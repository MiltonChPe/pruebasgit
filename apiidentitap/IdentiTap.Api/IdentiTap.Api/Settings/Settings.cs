namespace IdentiTap.Api.Settings;

public class JwtOptions
{
    public string Secret { get; set; } = "";
    public string Issuer { get; set; } = "identitap-api";
    public string Audience { get; set; } = "identitap-web";
    public int ExpireMinutes { get; set; } = 120;
}

public class SecurityOptions
{
    /// <summary>Secreto (mín. 16 caracteres) para firmar el hash del OTP (HMAC).</summary>
    public string OtpPepper { get; set; } = "";
    public int OtpMinutes { get; set; } = 5;
    public int AccessMinutes { get; set; } = 3;
    public int MaxOtpAttempts { get; set; } = 3;
    public int VerifyEmailHours { get; set; } = 24;
    /// <summary>Si es true, el OTP también se manda al contacto de emergencia (útil si el adulto mayor no puede dictarlo).</summary>
    public bool SendOtpToEmergencyContact { get; set; } = false;
}

public class AppOptions
{
    /// <summary>URL base del frontend (para armar el enlace del correo de verificación).</summary>
    public string FrontendBaseUrl { get; set; } = "http://localhost:4200";
    public string DefaultCountryCode { get; set; } = "+52";
    public int MaxDocumentsPerElder { get; set; } = 20;
    public int MaxFileMb { get; set; } = 10;
}

public class EmailOptions
{
    /// <summary>"Console" (solo imprime en logs) o "Smtp".</summary>
    public string Provider { get; set; } = "Console";
    public string Host { get; set; } = "";
    public int Port { get; set; } = 587;
    public string User { get; set; } = "";
    public string Password { get; set; } = "";
    public string FromEmail { get; set; } = "";
    public string FromName { get; set; } = "IdentiTap";
}

public class SmsOptions
{
    /// <summary>"Console" (solo imprime en logs), "Twilio" o "SmsGate" (tu teléfono Android como pasarela).</summary>
    public string Provider { get; set; } = "Console";
    public string AccountSid { get; set; } = "";
    public string AuthToken { get; set; } = "";
    public string FromNumber { get; set; } = "";

    // --- SmsGate (app "SMS Gateway for Android") ---
    public string GatewayUsername { get; set; } = "";
    public string GatewayPassword { get; set; } = "";
    public string GatewayBaseUrl { get; set; } = "https://api.sms-gate.app/3rdparty/v1";
}

public class StorageOptions
{
    public string ConnectionString { get; set; } = "";
    public string Container { get; set; } = "documentos";
}
