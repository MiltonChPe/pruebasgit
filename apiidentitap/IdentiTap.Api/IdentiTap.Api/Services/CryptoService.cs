using System.Security.Cryptography;
using System.Text;
using IdentiTap.Api.Settings;
using Microsoft.Extensions.Options;

namespace IdentiTap.Api.Services;

public class CryptoService
{
    private readonly byte[] _pepper;

    public CryptoService(IOptions<SecurityOptions> options)
    {
        var pepper = options.Value.OtpPepper;
        if (string.IsNullOrWhiteSpace(pepper) || pepper.Length < 16)
            throw new InvalidOperationException("Security:OtpPepper debe tener al menos 16 caracteres.");
        _pepper = Encoding.UTF8.GetBytes(pepper);
    }

    // ---- Contraseñas (BCrypt) ----
    public string HashPassword(string password) => BCrypt.Net.BCrypt.HashPassword(password, 11);

    public bool VerifyPassword(string password, string hash)
    {
        try { return BCrypt.Net.BCrypt.Verify(password, hash); }
        catch { return false; }
    }

    // ---- Tokens aleatorios (verificación de correo) ----
    public string NewToken() => Base64Url(RandomNumberGenerator.GetBytes(32));

    /// <summary>SHA-256 en hexadecimal MAYÚSCULAS (coincide con CONVERT(..., 2) de SQL Server).</summary>
    public string Sha256Hex(string value) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));

    // ---- OTP ----
    public string GenerateOtp() => RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");

    public string HashOtp(Guid requestId, string otp) =>
        Convert.ToHexString(HMACSHA256.HashData(_pepper, Encoding.UTF8.GetBytes($"{requestId:N}:{otp}")));

    /// <summary>Comparación en tiempo constante (evita ataques por temporización).</summary>
    public bool FixedEquals(string a, string b)
    {
        var x = Encoding.UTF8.GetBytes(a.ToUpperInvariant());
        var y = Encoding.UTF8.GetBytes(b.ToUpperInvariant());
        return x.Length == y.Length && CryptographicOperations.FixedTimeEquals(x, y);
    }

    private static string Base64Url(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
