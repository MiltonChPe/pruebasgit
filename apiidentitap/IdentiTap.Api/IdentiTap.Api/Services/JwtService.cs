using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using IdentiTap.Api.Settings;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace IdentiTap.Api.Services;

public class JwtService
{
    private readonly JwtOptions _options;
    private readonly SigningCredentials _credentials;

    public JwtService(IOptions<JwtOptions> options)
    {
        _options = options.Value;
        if (string.IsNullOrWhiteSpace(_options.Secret) || _options.Secret.Length < 32)
            throw new InvalidOperationException("Jwt:Secret debe tener al menos 32 caracteres.");

        _credentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_options.Secret)),
            SecurityAlgorithms.HmacSha256);
    }

    public (string Token, DateTime ExpiresAt) Create(int userId, string email)
    {
        var expires = DateTime.UtcNow.AddMinutes(_options.ExpireMinutes);

        var token = new JwtSecurityToken(
            issuer: _options.Issuer,
            audience: _options.Audience,
            claims: new[]
            {
                new Claim("uid", userId.ToString()),
                new Claim("email", email)
            },
            notBefore: DateTime.UtcNow,
            expires: expires,
            signingCredentials: _credentials);

        return (new JwtSecurityTokenHandler().WriteToken(token), expires);
    }
}
