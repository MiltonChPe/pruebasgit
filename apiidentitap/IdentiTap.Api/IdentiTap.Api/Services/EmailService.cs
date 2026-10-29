using IdentiTap.Api.Settings;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Options;
using MimeKit;

namespace IdentiTap.Api.Services;

public interface IEmailService
{
    Task SendVerificationAsync(string toEmail, string verifyLink);
}

/// <summary>Solo para desarrollo/demo: imprime el enlace en los logs en lugar de enviar un correo.</summary>
public class ConsoleEmailService : IEmailService
{
    private readonly ILogger<ConsoleEmailService> _log;
    public ConsoleEmailService(ILogger<ConsoleEmailService> log) => _log = log;

    public Task SendVerificationAsync(string toEmail, string verifyLink)
    {
        _log.LogWarning("[EMAIL DEMO] Para {To}: enlace de verificación {Link}", toEmail, verifyLink);
        return Task.CompletedTask;
    }
}

/// <summary>Envío real por SMTP (Brevo, Gmail con contraseña de aplicación, etc.).</summary>
public class SmtpEmailService : IEmailService
{
    private readonly EmailOptions _options;

    public SmtpEmailService(IOptions<EmailOptions> options)
    {
        _options = options.Value;
        if (string.IsNullOrWhiteSpace(_options.Host) || string.IsNullOrWhiteSpace(_options.FromEmail))
            throw new InvalidOperationException("Configura Email:Host y Email:FromEmail para usar SMTP.");
    }

    public async Task SendVerificationAsync(string toEmail, string verifyLink)
    {
        var message = new MimeMessage();
        message.From.Add(new MailboxAddress(_options.FromName, _options.FromEmail));
        message.To.Add(MailboxAddress.Parse(toEmail));
        message.Subject = "Confirma tu cuenta de IdentiTap";

        var html = $@"
<div style=""font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#334155"">
  <h2 style=""color:#102C53"">Bienvenido a IdentiTap</h2>
  <p>Para activar tu cuenta, confirma tu correo electrónico:</p>
  <p style=""margin:28px 0"">
    <a href=""{verifyLink}""
       style=""background:#102C53;color:#ffffff;padding:14px 26px;border-radius:8px;text-decoration:none;font-weight:bold"">
      Confirmar mi correo
    </a>
  </p>
  <p style=""font-size:14px"">El enlace vence en 24 horas. Si no creaste esta cuenta, ignora este mensaje.</p>
  <p style=""font-size:12px;color:#64748b"">Si el botón no funciona, copia y pega esta dirección en tu navegador:<br>{verifyLink}</p>
</div>";

        message.Body = new BodyBuilder
        {
            HtmlBody = html,
            TextBody = $"Confirma tu cuenta de IdentiTap abriendo este enlace (vence en 24 horas): {verifyLink}"
        }.ToMessageBody();

        using var client = new SmtpClient();
        await client.ConnectAsync(_options.Host, _options.Port, SecureSocketOptions.StartTls);
        if (!string.IsNullOrWhiteSpace(_options.User))
            await client.AuthenticateAsync(_options.User, _options.Password);
        await client.SendAsync(message);
        await client.DisconnectAsync(true);
    }
}
