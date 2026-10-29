using IdentiTap.Api.Data;
using IdentiTap.Api.Helpers;
using IdentiTap.Api.Models;
using IdentiTap.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace IdentiTap.Api.Controllers;

/// <summary>Web 2 (/scan/:code). Sin login. Solo expone lo mínimo necesario.</summary>
[ApiController]
[Route("api/scan")]
[EnableRateLimiting("public")]
public class ScanController : ControllerBase
{
    private readonly AccessService _access;
    private readonly Repository _repo;

    public ScanController(AccessService access, Repository repo)
    {
        _access = access;
        _repo = repo;
    }

    /// <summary>Datos de emergencia: carga inmediata, sin OTP.</summary>
    [HttpGet("{code}/emergency")]
    public async Task<ActionResult<EmergencyResponse>> Emergency(string code)
    {
        var elder = await _access.GetActiveElderAsync(code);

        return new EmergencyResponse(
            elder.FullName,
            Normalizer.AgeFrom(elder.BirthDate),
            elder.BloodType,
            elder.Allergies,
            elder.EmergencyContactName,
            elder.EmergencyContactPhone);
    }

    /// <summary>Lista de documentos disponibles (solo ID y nombre; nunca URLs).</summary>
    [HttpGet("{code}/documents")]
    public async Task<ActionResult<List<PublicDocumentResponse>>> Documents(string code)
    {
        var elder = await _access.GetActiveElderAsync(code);
        var docs = await _repo.GetPublicDocuments(elder.ElderID);

        return docs.Select(d => new PublicDocumentResponse(d.DocumentID, d.DocumentName)).ToList();
    }

    /// <summary>"Solicitar documentos": genera la solicitud y envía el OTP por SMS al adulto mayor.</summary>
    [HttpPost("{code}/request")]
    [EnableRateLimiting("sensitive")]
    public async Task<ActionResult<RequestAccessResponse>> Request(string code, RequestAccessRequest req)
    {
        var ip = HttpContext.Connection.RemoteIpAddress?.ToString();
        return await _access.RequestAsync(code, req, ip);
    }
}
