using System.Text.Json;
using IdentiTap.Api.Data;
using IdentiTap.Api.Helpers;
using IdentiTap.Api.Middleware;
using IdentiTap.Api.Models;
using IdentiTap.Api.Settings;
using Microsoft.Extensions.Options;

namespace IdentiTap.Api.Services;

/// <summary>Flujo público: pulsera -> solicitud -> OTP por SMS -> verificación -> SAS de 3 minutos.</summary>
public class AccessService
{
    private const string NotAvailable = "Esta pulsera no está disponible.";

    private readonly Repository _repo;
    private readonly CryptoService _crypto;
    private readonly ISmsService _sms;
    private readonly BlobService _blobs;
    private readonly SecurityOptions _security;
    private readonly ILogger<AccessService> _log;

    public AccessService(
        Repository repo, CryptoService crypto, ISmsService sms, BlobService blobs,
        IOptions<SecurityOptions> security, ILogger<AccessService> log)
    {
        _repo = repo;
        _crypto = crypto;
        _sms = sms;
        _blobs = blobs;
        _security = security.Value;
        _log = log;
    }

    /// <summary>Devuelve el adulto mayor si la pulsera existe, está vinculada y Activa; si no, 404 genérico.</summary>
    public async Task<ElderRow> GetActiveElderAsync(string rawCode)
    {
        var code = Normalizer.Code(rawCode);
        if (!Normalizer.IsValidCode(code))
            throw new ApiException(404, NotAvailable);

        var elder = await _repo.GetElderByNFCUID(code);
        if (elder is null || elder.BandID is null || elder.Status != "Activa")
            throw new ApiException(404, NotAvailable);

        return elder;
    }

    public async Task<RequestAccessResponse> RequestAsync(string rawCode, RequestAccessRequest req, string? ip)
    {
        var elder = await GetActiveElderAsync(rawCode);

        var ids = req.DocumentIds.Distinct().ToList();
        if (ids.Count == 0)
            throw new ApiException(400, "Selecciona al menos un documento.");

        var requestId = Guid.NewGuid();
        var otp = _crypto.GenerateOtp();
        var expiresAt = DateTime.UtcNow.AddMinutes(_security.OtpMinutes);

        // El SP valida documentos, aplica el límite anti-abuso y devuelve el teléfono (nunca viene del cliente).
        var created = await _repo.CreateDocumentRequest(
            requestId,
            elder.BandID!.Value,
            JsonSerializer.Serialize(ids),
            _crypto.HashOtp(requestId, otp),
            expiresAt,
            ip,
            string.IsNullOrWhiteSpace(req.RequesterName) ? null : req.RequesterName.Trim())
            ?? throw new ApiException(500, "No se pudo crear la solicitud.");

        // Texto sin acentos para que el SMS use codificación GSM-7 (1 segmento, más barato).
        var text = $"Hola, para ver tus documentos de identitap usa los numeros {otp}";

        try
        {
            await _sms.SendAsync(created.PhoneNumber, text);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Fallo el envío del SMS para la solicitud {RequestId}", requestId);
            await _repo.UpdateDocumentRequestStatus(requestId, "Rechazado");
            throw new ApiException(502, "No se pudo enviar el SMS. Intenta de nuevo en un minuto.");
        }

        // Opcional: avisar también al contacto de emergencia (si el adulto mayor no puede dictar el código).
        if (_security.SendOtpToEmergencyContact && !string.IsNullOrWhiteSpace(created.EmergencyContactPhone))
        {
            try { await _sms.SendAsync(created.EmergencyContactPhone!, text); }
            catch (Exception ex) { _log.LogWarning(ex, "No se pudo avisar al contacto de emergencia."); }
        }

        return new RequestAccessResponse(requestId, expiresAt, Normalizer.MaskPhone(created.PhoneNumber));
    }

    public async Task<FilesResponse> VerifyOtpAsync(VerifyOtpRequest req)
    {
        var request = await _repo.GetDocumentRequest(req.RequestId)
            ?? throw new ApiException(404, "No se encontró la solicitud.");

        if (request.Status != "Pendiente")
            throw new ApiException(400, "Esta solicitud ya no está disponible. Solicita un código nuevo.");

        if (DateTime.UtcNow > request.OtpExpiresAt)
        {
            await _repo.UpdateDocumentRequestStatus(request.RequestID, "Expirado");
            throw new ApiException(400, "El código venció. Solicita uno nuevo.");
        }

        if (request.OtpAttempts >= _security.MaxOtpAttempts)
        {
            await _repo.UpdateDocumentRequestStatus(request.RequestID, "Rechazado");
            throw new ApiException(400, "Demasiados intentos. Solicita un código nuevo.");
        }

        var expected = _crypto.HashOtp(request.RequestID, req.Code);
        if (!_crypto.FixedEquals(expected, request.OtpHash))
        {
            var attempt = await _repo.RegisterOtpAttempt(request.RequestID, _security.MaxOtpAttempts);
            var remaining = _security.MaxOtpAttempts - (attempt?.Attempts ?? _security.MaxOtpAttempts);

            if (attempt is null || attempt.Status == "Rechazado" || remaining <= 0)
                throw new ApiException(400, "Demasiados intentos. Solicita un código nuevo.");

            throw new ApiException(400, $"Código incorrecto. Intentos restantes: {remaining}.");
        }

        // Código correcto: aprobación atómica y de un solo uso (el SP fija ahora + 3 minutos).
        var approved = await _repo.ApproveDocumentRequest(request.RequestID, _security.AccessMinutes)
            ?? throw new ApiException(400, "La solicitud no es válida o ya fue utilizada.");

        return await BuildFilesAsync(request.RequestID, approved.AccessExpiresAt);
    }

    /// <summary>Vuelve a emitir los enlaces mientras dure la ventana (por si recargan la página). Nunca la extiende.</summary>
    public async Task<FilesResponse> GetFilesAsync(Guid requestId)
    {
        var request = await _repo.GetDocumentRequest(requestId)
            ?? throw new ApiException(404, "No se encontró la solicitud.");

        if (request.Status != "Aprobado" || request.AccessExpiresAt is null || request.AccessExpiresAt <= DateTime.UtcNow)
            throw new ApiException(410, "El acceso a los documentos ya expiró.");

        return await BuildFilesAsync(requestId, request.AccessExpiresAt.Value);
    }

    private async Task<FilesResponse> BuildFilesAsync(Guid requestId, DateTime accessExpiresAtUtc)
    {
        var docs = await _repo.GetDocumentsByRequest(requestId);
        if (docs.Count == 0)
            throw new ApiException(410, "El acceso a los documentos ya expiró.");

        var expiresOn = new DateTimeOffset(DateTime.SpecifyKind(accessExpiresAtUtc, DateTimeKind.Utc));

        var links = docs
            .Select(d => new FileLink(d.DocumentID, d.DocumentName, _blobs.CreateReadUrl(d.BlobName, d.DocumentName, expiresOn)))
            .ToList();

        return new FilesResponse(DateTime.SpecifyKind(accessExpiresAtUtc, DateTimeKind.Utc), DateTime.UtcNow, links);
    }
}
