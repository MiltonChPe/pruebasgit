using System.Text.RegularExpressions;

namespace IdentiTap.Api.Helpers;

public static class Normalizer
{
    /// <summary>Código NFC / de reclamo: mayúsculas y sin guiones ni espacios ("xyz-890" -> "XYZ890").</summary>
    public static string Code(string? value) =>
        (value ?? "").Trim().ToUpperInvariant().Replace("-", "").Replace(" ", "");

    public static bool IsValidCode(string code) =>
        Regex.IsMatch(code, "^[A-Z0-9]{4,32}$");

    public static string Email(string? value) =>
        (value ?? "").Trim().ToLowerInvariant();

    /// <summary>
    /// Devuelve el teléfono en formato E.164 (+524421234567) o null si no es válido.
    /// Si trae 10 dígitos sin prefijo, se asume el país por defecto (+52).
    /// </summary>
    public static string? Phone(string? value, string defaultCountryCode = "+52")
    {
        var cleaned = new string((value ?? "").Where(c => char.IsDigit(c) || c == '+').ToArray());
        if (cleaned.Length == 0) return null;

        if (!cleaned.StartsWith('+'))
            cleaned = cleaned.Length == 10 ? defaultCountryCode + cleaned : "+" + cleaned;

        return Regex.IsMatch(cleaned, @"^\+[1-9]\d{7,14}$") ? cleaned : null;
    }

    public static string MaskPhone(string phone) =>
        phone.Length > 4 ? new string('*', phone.Length - 4) + phone[^4..] : "****";

    public static int AgeFrom(DateOnly birth)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var age = today.Year - birth.Year;
        if (birth > today.AddYears(-age)) age--;
        return age;
    }
}
