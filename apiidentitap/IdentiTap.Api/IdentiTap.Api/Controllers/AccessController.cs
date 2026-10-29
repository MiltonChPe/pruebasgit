using IdentiTap.Api.Models;
using IdentiTap.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace IdentiTap.Api.Controllers;

[ApiController]
[Route("api/access")]
[EnableRateLimiting("public")]
public class AccessController : ControllerBase
{
    private readonly AccessService _access;

    public AccessController(AccessService access) => _access = access;

    /// <summary>
    /// Verifica el OTP. Si es correcto devuelve los enlaces de descarga (SAS) que vencen
    /// exactamente 3 minutos después de la aprobación.
    /// </summary>
    [HttpPost("verify-otp")]
    [EnableRateLimiting("sensitive")]
    public async Task<ActionResult<FilesResponse>> VerifyOtp(VerifyOtpRequest req) =>
        await _access.VerifyOtpAsync(req);

    /// <summary>Reemite los enlaces dentro de la misma ventana (p. ej. si recargan la página). No la extiende.</summary>
    [HttpGet("{requestId:guid}/files")]
    public async Task<ActionResult<FilesResponse>> Files(Guid requestId) =>
        await _access.GetFilesAsync(requestId);
}
