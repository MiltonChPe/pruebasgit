using System.Text;
using IdentiTap.Api.Data;
using IdentiTap.Api.Helpers;
using IdentiTap.Api.Middleware;
using IdentiTap.Api.Models;
using IdentiTap.Api.Services;
using IdentiTap.Api.Settings;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;

namespace IdentiTap.Api.Controllers;

/// <summary>Web 1 (/admin). Todo requiere JWT y cada operación valida que el recurso sea del usuario.</summary>
[ApiController]
[Route("api/admin")]
[Authorize]
public class AdminController : ControllerBase
{
    private readonly Repository _repo;
    private readonly BlobService _blobs;
    private readonly CryptoService _crypto;
    private readonly AppOptions _app;

    public AdminController(Repository repo, BlobService blobs, CryptoService crypto, IOptions<AppOptions> app)
    {
        _repo = repo;
        _blobs = blobs;
        _crypto = crypto;
        _app = app.Value;
    }

    private int UserId => int.Parse(User.FindFirst("uid")!.Value);

    // ------------------------------------------------------------------ Estado
    /// <summary>El front lo usa para bloquear el dashboard hasta que exista el perfil.</summary>
    [HttpGet("me")]
    public async Task<ActionResult<MeResponse>> Me()
    {
        var status = await _repo.GetUserStatus(UserId);
        if (status is null) return Unauthorized();

        return new MeResponse(User.FindFirst("email")?.Value ?? "", status.EmailVerified, status.HasElder, status.ElderID);
    }

    // ------------------------------------------------------------------ Adulto mayor
    [HttpPost("elder")]
    [EnableRateLimiting("sensitive")]
    public async Task<IActionResult> CreateElder(CreateElderRequest req)
    {
        var (phone, emergencyPhone) = ValidateElder(req);

        var nfcCode = Normalizer.Code(req.NfcCode);
        var claimCode = Normalizer.Code(req.ClaimCode);
        if (!Normalizer.IsValidCode(nfcCode) || !Normalizer.IsValidCode(claimCode))
            throw new ApiException(400, "El código de la pulsera o el código de la tarjeta no tienen un formato válido.");

        var result = await _repo.CreateElderAndLinkBand(
            UserId, req.FullName.Trim(), req.BirthDate, req.BloodType, req.Allergies?.Trim(),
            phone, req.EmergencyContactName.Trim(), emergencyPhone,
            nfcCode, _crypto.Sha256Hex(claimCode))
            ?? throw new ApiException(500, "No se pudo crear el perfil.");

        return StatusCode(201, new { elderId = result.ElderID, bandId = result.BandID });
    }

    [HttpGet("elder")]
    public async Task<ActionResult<ElderResponse>> GetElder()
    {
        var elder = await _repo.GetElderByUser(UserId);
        if (elder is null) return NotFound(new { error = "Aún no has registrado el perfil del adulto mayor." });

        return new ElderResponse(
            elder.ElderID, elder.FullName, elder.BirthDate, elder.BloodType, elder.Allergies,
            elder.PhoneNumber, elder.EmergencyContactName, elder.EmergencyContactPhone,
            elder.BandID, elder.NFCUID, elder.Status);
    }

    [HttpPut("elder")]
    public async Task<IActionResult> UpdateElder(UpdateElderRequest req)
    {
        var elder = await RequireElderAsync();
        var (phone, emergencyPhone) = ValidateElder(req);

        await _repo.UpdateElder(
            UserId, elder.ElderID, req.FullName.Trim(), req.BirthDate, req.BloodType, req.Allergies?.Trim(),
            phone, req.EmergencyContactName.Trim(), emergencyPhone);

        return NoContent();
    }

    // ------------------------------------------------------------------ Pulsera
    /// <summary>Botón de contingencia "Desactivar NFC": la pulsera deja de mostrar datos y documentos.</summary>
    [HttpPost("band/deactivate")]
    public async Task<IActionResult> DeactivateBand()
    {
        var bandId = await RequireBandIdAsync();
        await _repo.UpdateBandStatus(UserId, bandId, "Inactiva");
        return Ok(new { status = "Inactiva" });
    }

    [HttpPost("band/activate")]
    public async Task<IActionResult> ActivateBand()
    {
        var bandId = await RequireBandIdAsync();
        await _repo.UpdateBandStatus(UserId, bandId, "Activa");
        return Ok(new { status = "Activa" });
    }

    /// <summary>Desvincula la pulsera (queda inactiva y sin dueño).</summary>
    [HttpPost("band/unlink")]
    public async Task<IActionResult> UnlinkBand()
    {
        var bandId = await RequireBandIdAsync();
        await _repo.UnlinkBand(UserId, bandId);
        return NoContent();
    }

    /// <summary>Vincula otra pulsera a un perfil que se quedó sin ella.</summary>
    [HttpPost("band/link")]
    [EnableRateLimiting("sensitive")]
    public async Task<IActionResult> LinkBand(LinkBandRequest req)
    {
        var nfcCode = Normalizer.Code(req.NfcCode);
        var claimCode = Normalizer.Code(req.ClaimCode);
        if (!Normalizer.IsValidCode(nfcCode) || !Normalizer.IsValidCode(claimCode))
            throw new ApiException(400, "El código de la pulsera o el código de la tarjeta no tienen un formato válido.");

        var result = await _repo.LinkBandToElder(UserId, nfcCode, _crypto.Sha256Hex(claimCode));
        return Ok(new { bandId = result?.BandID });
    }

    // ------------------------------------------------------------------ Documentos
    [HttpGet("documents")]
    public async Task<ActionResult<List<DocumentResponse>>> GetDocuments()
    {
        var elder = await RequireElderAsync();
        var docs = await _repo.GetDocumentsByElder(UserId, elder.ElderID);

        return docs.Select(d => new DocumentResponse(d.DocumentID, d.DocumentName, d.SizeBytes, d.CreatedAt)).ToList();
    }

    [HttpPost("documents")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(15_000_000)]
    public async Task<IActionResult> UploadDocument([FromForm] UploadDocumentForm form)
    {
        var elder = await RequireElderAsync();

        var existing = await _repo.GetDocumentsByElder(UserId, elder.ElderID);
        if (existing.Count >= _app.MaxDocumentsPerElder)
            throw new ApiException(400, $"Llegaste al máximo de {_app.MaxDocumentsPerElder} documentos. Elimina alguno para subir otro.");

        await ValidatePdfAsync(form.File);

        var name = CleanName(form.Name, form.File.FileName);

        string blobName;
        long size;
        await using (var stream = form.File.OpenReadStream())
            (blobName, size) = await _blobs.UploadPdfAsync(elder.ElderID, stream, form.File.Length);

        try
        {
            var created = await _repo.CreateDocument(UserId, elder.ElderID, name, blobName, size)
                ?? throw new ApiException(500, "No se pudo registrar el documento.");

            return StatusCode(201, new { documentId = created.DocumentID, documentName = name });
        }
        catch
        {
            await _blobs.DeleteAsync(blobName);   // no dejar archivos huérfanos
            throw;
        }
    }

    /// <summary>Cambia solo el nombre del documento.</summary>
    [HttpPut("documents/{id:int}")]
    public async Task<IActionResult> RenameDocument(int id, UpdateDocumentNameRequest req)
    {
        await _repo.UpdateDocument(UserId, id, req.DocumentName.Trim(), null, null);
        return NoContent();
    }

    /// <summary>Reemplaza el archivo PDF de un documento existente.</summary>
    [HttpPut("documents/{id:int}/file")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(15_000_000)]
    public async Task<IActionResult> ReplaceDocumentFile(int id, [FromForm] UploadDocumentForm form)
    {
        var elder = await RequireElderAsync();
        await ValidatePdfAsync(form.File);

        string blobName;
        long size;
        await using (var stream = form.File.OpenReadStream())
            (blobName, size) = await _blobs.UploadPdfAsync(elder.ElderID, stream, form.File.Length);

        try
        {
            var result = await _repo.UpdateDocument(
                UserId, id,
                string.IsNullOrWhiteSpace(form.Name) ? null : form.Name.Trim(),
                blobName, size);

            if (!string.IsNullOrEmpty(result?.OldBlobName))
                await _blobs.DeleteAsync(result.OldBlobName);

            return NoContent();
        }
        catch
        {
            await _blobs.DeleteAsync(blobName);
            throw;
        }
    }

    [HttpDelete("documents/{id:int}")]
    public async Task<IActionResult> DeleteDocument(int id)
    {
        var result = await _repo.DeleteDocument(UserId, id);
        if (result is not null)
            await _blobs.DeleteAsync(result.BlobName);

        return NoContent();
    }

    // ------------------------------------------------------------------ Registros de acceso
    [HttpGet("access-logs")]
    public async Task<ActionResult<List<AccessLogResponse>>> GetAccessLogs()
    {
        var logs = await _repo.GetAccessLogs(UserId, 100);

        return logs.Select(l => new AccessLogResponse(
            l.RequestID, l.RequestedAt, l.Status, l.RequesterName, l.RequesterIP,
            l.ApprovedAt, l.AccessExpiresAt, l.Documents)).ToList();
    }

    // ------------------------------------------------------------------ Helpers
    private async Task<ElderRow> RequireElderAsync() =>
        await _repo.GetElderByUser(UserId)
        ?? throw new ApiException(400, "Primero registra el perfil del adulto mayor.");

    private async Task<int> RequireBandIdAsync()
    {
        var elder = await RequireElderAsync();
        return elder.BandID ?? throw new ApiException(400, "El perfil no tiene una pulsera vinculada.");
    }

    private (string Phone, string EmergencyPhone) ValidateElder(ElderBase e)
    {
        var minDate = new DateOnly(1900, 1, 1);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        if (e.BirthDate < minDate || e.BirthDate > today)
            throw new ApiException(400, "La fecha de nacimiento no es válida.");

        var phone = Normalizer.Phone(e.PhoneNumber, _app.DefaultCountryCode)
            ?? throw new ApiException(400, "El teléfono del adulto mayor no es válido (10 dígitos o formato +52...).");
        var emergencyPhone = Normalizer.Phone(e.EmergencyContactPhone, _app.DefaultCountryCode)
            ?? throw new ApiException(400, "El teléfono del contacto de emergencia no es válido.");

        return (phone, emergencyPhone);
    }

    private async Task ValidatePdfAsync(IFormFile? file)
    {
        if (file is null || file.Length == 0)
            throw new ApiException(400, "Selecciona un archivo PDF.");

        if (file.Length > _app.MaxFileMb * 1024L * 1024L)
            throw new ApiException(400, $"El archivo supera el máximo de {_app.MaxFileMb} MB.");

        // Se revisa el contenido real (firma "%PDF-"), no solo la extensión.
        await using var stream = file.OpenReadStream();
        var header = new byte[5];
        var read = await stream.ReadAsync(header, 0, header.Length);
        if (read < 5 || Encoding.ASCII.GetString(header) != "%PDF-")
            throw new ApiException(400, "Solo se permiten archivos PDF válidos.");
    }

    private static string CleanName(string? requested, string fileName)
    {
        var name = string.IsNullOrWhiteSpace(requested) ? Path.GetFileNameWithoutExtension(fileName) : requested.Trim();
        if (string.IsNullOrWhiteSpace(name)) name = "Documento";
        return name.Length > 150 ? name[..150] : name;
    }
}
