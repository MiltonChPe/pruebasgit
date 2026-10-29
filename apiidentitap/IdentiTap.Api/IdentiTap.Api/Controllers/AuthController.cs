using IdentiTap.Api.Data;
using IdentiTap.Api.Helpers;
using IdentiTap.Api.Middleware;
using IdentiTap.Api.Models;
using IdentiTap.Api.Services;
using IdentiTap.Api.Settings;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;

namespace IdentiTap.Api.Controllers;

[ApiController]
[Route("api/auth")]
[EnableRateLimiting("sensitive")]
public class AuthController : ControllerBase
{
    // Hash de relleno para que el login tarde igual exista o no el correo.
    private static readonly string DummyHash = BCrypt.Net.BCrypt.HashPassword("relleno-no-usar", 11);

    private readonly Repository _repo;
    private readonly CryptoService _crypto;
    private readonly JwtService _jwt;
    private readonly IEmailService _email;
    private readonly AppOptions _app;
    private readonly SecurityOptions _security;
    private readonly ILogger<AuthController> _log;

    public AuthController(
        Repository repo, CryptoService crypto, JwtService jwt, IEmailService email,
        IOptions<AppOptions> app, IOptions<SecurityOptions> security, ILogger<AuthController> log)
    {
        _repo = repo;
        _crypto = crypto;
        _jwt = jwt;
        _email = email;
        _app = app.Value;
        _security = security.Value;
        _log = log;
    }

    /// <summary>Registro con correo y contraseña. Envía el correo de verificación.</summary>
    [HttpPost("register")]
    public async Task<IActionResult> Register(RegisterRequest req)
    {
        var email = Normalizer.Email(req.Email);
        var token = _crypto.NewToken();

        await _repo.CreateUser(
            email,
            _crypto.HashPassword(req.Password),
            _crypto.Sha256Hex(token),
            DateTime.UtcNow.AddHours(_security.VerifyEmailHours));

        await SendVerificationAsync(email, token, failIfCannotSend: true);

        return StatusCode(201, new { message = "Cuenta creada. Revisa tu correo para confirmarla." });
    }

    /// <summary>La página /admin/verify-email del frontend llama aquí con el token del enlace.</summary>
    [HttpPost("verify-email")]
    public async Task<IActionResult> VerifyEmail(TokenRequest req)
    {
        await _repo.VerifyEmail(_crypto.Sha256Hex(req.Token.Trim()));
        return Ok(new { message = "Correo verificado. Ya puedes iniciar sesión." });
    }

    [HttpPost("resend-verification")]
    public async Task<IActionResult> Resend(EmailRequest req)
    {
        var email = Normalizer.Email(req.Email);
        var token = _crypto.NewToken();

        var user = await _repo.SetEmailVerifyToken(
            email, _crypto.Sha256Hex(token), DateTime.UtcNow.AddHours(_security.VerifyEmailHours));

        if (user is not null)
            await SendVerificationAsync(email, token, failIfCannotSend: false);

        // Misma respuesta exista o no el correo (evita enumerar usuarios).
        return Ok(new { message = "Si el correo existe y falta confirmarlo, te enviamos un nuevo enlace." });
    }

    [HttpPost("login")]
    public async Task<ActionResult<AuthResponse>> Login(LoginRequest req)
    {
        var email = Normalizer.Email(req.Email);
        var user = await _repo.GetUserByEmail(email);

        var ok = _crypto.VerifyPassword(req.Password, user?.PasswordHash ?? DummyHash);
        if (user is null || !ok)
            throw new ApiException(401, "Correo o contraseña incorrectos.");

        if (!user.EmailVerified)
            throw new ApiException(403, "Primero confirma tu correo. Revisa tu bandeja de entrada.");

        var (token, expiresAt) = _jwt.Create(user.UserID, user.Email);
        return new AuthResponse(token, expiresAt, user.Email);
    }

    private async Task SendVerificationAsync(string email, string token, bool failIfCannotSend)
    {
        var link = $"{_app.FrontendBaseUrl.TrimEnd('/')}/admin/verify-email?token={Uri.EscapeDataString(token)}";
        try
        {
            await _email.SendVerificationAsync(email, link);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "No se pudo enviar el correo de verificación a {Email}", email);
            if (failIfCannotSend)
                throw new ApiException(502,
                    "Tu cuenta se creó, pero no pudimos enviar el correo. Usa \"Reenviar correo\" en unos minutos.");
        }
    }
}
