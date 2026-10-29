using IdentiTap.Api.Settings;
using Microsoft.Extensions.Options;
using Twilio;
using Twilio.Rest.Api.V2010.Account;
using Twilio.Types;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;

namespace IdentiTap.Api.Services;

public interface ISmsService
{
    Task SendAsync(string toPhoneE164, string body);
}

/// <summary>Solo para desarrollo/demo: imprime el SMS en los logs (el OTP queda visible ahí).</summary>
public class ConsoleSmsService : ISmsService
{
    private readonly ILogger<ConsoleSmsService> _log;
    public ConsoleSmsService(ILogger<ConsoleSmsService> log) => _log = log;

    public Task SendAsync(string toPhoneE164, string body)
    {
        _log.LogWarning("[SMS DEMO] Para {To}: {Body}", toPhoneE164, body);
        return Task.CompletedTask;
    }
}

public class TwilioSmsService : ISmsService
{
    private readonly SmsOptions _options;

    public TwilioSmsService(IOptions<SmsOptions> options)
    {
        _options = options.Value;
        if (string.IsNullOrWhiteSpace(_options.AccountSid) ||
            string.IsNullOrWhiteSpace(_options.AuthToken) ||
            string.IsNullOrWhiteSpace(_options.FromNumber))
            throw new InvalidOperationException("Configura Sms:AccountSid, Sms:AuthToken y Sms:FromNumber para usar Twilio.");

        TwilioClient.Init(_options.AccountSid, _options.AuthToken);
    }

    public async Task SendAsync(string toPhoneE164, string body)
    {
        await MessageResource.CreateAsync(
            to: new PhoneNumber(toPhoneE164),
            from: new PhoneNumber(_options.FromNumber),
            body: body);
    }
}

public class SmsGateSmsService : ISmsService
{
    private readonly HttpClient _http;

    public SmsGateSmsService(HttpClient http, IOptions<SmsOptions> options, IConfiguration config)
    {
        var o = options.Value;
        var username = (!string.IsNullOrWhiteSpace(o.GatewayUsername) ? o.GatewayUsername : config["Sms__GatewayUsername"])?.Trim() ?? "";
        var password = (!string.IsNullOrWhiteSpace(o.GatewayPassword) ? o.GatewayPassword : config["Sms__GatewayPassword"])?.Trim() ?? "";
        var baseUrl = string.IsNullOrWhiteSpace(o.GatewayBaseUrl)
            ? "https://api.sms-gate.app/3rdparty/v1"
            : o.GatewayBaseUrl.Trim();

        if (!baseUrl.StartsWith("http://", StringComparison.OrdinalIgnoreCase) &&
            !baseUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
        {
            baseUrl = "https://" + baseUrl;
        }
        if (baseUrl.EndsWith(":443", StringComparison.OrdinalIgnoreCase) ||
            baseUrl.EndsWith("api.sms-gate.app", StringComparison.OrdinalIgnoreCase))
        {
            baseUrl = baseUrl.TrimEnd('/') + "/3rdparty/v1";
        }

        if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password))
            throw new InvalidOperationException("Configura Sms:GatewayUsername y Sms:GatewayPassword para usar SmsGate.");

        _http = http;
        _http.BaseAddress = new Uri(baseUrl.TrimEnd('/') + "/");
        _http.Timeout = TimeSpan.FromSeconds(15);

        var basic = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{username}:{password}"));
        _http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic", basic);
    }

    public async Task SendAsync(string toPhoneE164, string body)
    {
        var payload = new
        {
            textMessage = new { text = body },
            phoneNumbers = new[] { toPhoneE164 }
        };

        using var response = await _http.PostAsJsonAsync("messages", payload);

        if (!response.IsSuccessStatusCode)
        {
            var detail = await response.Content.ReadAsStringAsync();
            throw new InvalidOperationException($"SmsGate respondió {(int)response.StatusCode}: {detail}");
        }
    }
}