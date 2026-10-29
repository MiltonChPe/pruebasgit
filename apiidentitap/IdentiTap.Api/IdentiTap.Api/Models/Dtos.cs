using System.ComponentModel.DataAnnotations;

namespace IdentiTap.Api.Models;

// ------------------------- AUTH -------------------------
public class RegisterRequest
{
    [Required(ErrorMessage = "El correo es obligatorio."), EmailAddress(ErrorMessage = "Correo inválido."), StringLength(256)]
    public string Email { get; set; } = "";

    [Required(ErrorMessage = "La contraseña es obligatoria."),
     StringLength(100, MinimumLength = 8, ErrorMessage = "La contraseña debe tener al menos 8 caracteres.")]
    public string Password { get; set; } = "";
}

public class LoginRequest
{
    [Required(ErrorMessage = "El correo es obligatorio.")]
    public string Email { get; set; } = "";

    [Required(ErrorMessage = "La contraseña es obligatoria.")]
    public string Password { get; set; } = "";
}

public class EmailRequest
{
    [Required(ErrorMessage = "El correo es obligatorio."), EmailAddress(ErrorMessage = "Correo inválido.")]
    public string Email { get; set; } = "";
}

public class TokenRequest
{
    [Required(ErrorMessage = "Falta el token de verificación.")]
    public string Token { get; set; } = "";
}

public record AuthResponse(string Token, DateTime ExpiresAt, string Email);

// ------------------------- ADMIN: ADULTO MAYOR -------------------------
public class ElderBase
{
    [Required(ErrorMessage = "El nombre es obligatorio."), StringLength(150)]
    public string FullName { get; set; } = "";

    [Required(ErrorMessage = "La fecha de nacimiento es obligatoria.")]
    public DateOnly BirthDate { get; set; }

    [Required(ErrorMessage = "El tipo de sangre es obligatorio."),
     RegularExpression(@"^(A|B|AB|O)[+-]$", ErrorMessage = "Tipo de sangre inválido (ej. O+, A-, AB+).")]
    public string BloodType { get; set; } = "";

    [StringLength(500)]
    public string? Allergies { get; set; }

    [Required(ErrorMessage = "El teléfono del adulto mayor es obligatorio.")]
    public string PhoneNumber { get; set; } = "";

    [Required(ErrorMessage = "El nombre del contacto de emergencia es obligatorio."), StringLength(150)]
    public string EmergencyContactName { get; set; } = "";

    [Required(ErrorMessage = "El teléfono del contacto de emergencia es obligatorio.")]
    public string EmergencyContactPhone { get; set; } = "";
}

public class CreateElderRequest : ElderBase
{
    /// <summary>Código público de la pulsera (el de la URL, ej. XYZ-890).</summary>
    [Required(ErrorMessage = "El código de la pulsera es obligatorio.")]
    public string NfcCode { get; set; } = "";

    /// <summary>Código secreto impreso solo en la tarjeta de la caja.</summary>
    [Required(ErrorMessage = "El código de reclamo de la tarjeta es obligatorio.")]
    public string ClaimCode { get; set; } = "";
}

public class UpdateElderRequest : ElderBase { }

public class LinkBandRequest
{
    [Required(ErrorMessage = "El código de la pulsera es obligatorio.")]
    public string NfcCode { get; set; } = "";

    [Required(ErrorMessage = "El código de reclamo de la tarjeta es obligatorio.")]
    public string ClaimCode { get; set; } = "";
}

public record MeResponse(string Email, bool EmailVerified, bool HasElder, int? ElderId);

public record ElderResponse(
    int ElderId, string FullName, DateOnly BirthDate, string BloodType, string? Allergies,
    string PhoneNumber, string EmergencyContactName, string EmergencyContactPhone,
    int? BandId, string? NfcCode, string? BandStatus);

// ------------------------- ADMIN: DOCUMENTOS -------------------------
public class UploadDocumentForm
{
    [Required(ErrorMessage = "Selecciona un archivo PDF.")]
    public IFormFile File { get; set; } = default!;

    [StringLength(150)]
    public string? Name { get; set; }
}

public class UpdateDocumentNameRequest
{
    [Required(ErrorMessage = "El nombre es obligatorio."), StringLength(150)]
    public string DocumentName { get; set; } = "";
}

public record DocumentResponse(int DocumentId, string DocumentName, long SizeBytes, DateTime CreatedAt);

public record AccessLogResponse(
    Guid RequestId, DateTime RequestedAt, string Status, string? RequesterName, string? RequesterIp,
    DateTime? ApprovedAt, DateTime? AccessExpiresAt, string? Documents);

// ------------------------- PÚBLICO: ESCÁNER -------------------------
public record EmergencyResponse(
    string FullName, int Age, string BloodType, string? Allergies,
    string EmergencyContactName, string EmergencyContactPhone);

public record PublicDocumentResponse(int DocumentId, string DocumentName);

public class RequestAccessRequest
{
    [Required(ErrorMessage = "Selecciona al menos un documento."), MinLength(1, ErrorMessage = "Selecciona al menos un documento."),
     MaxLength(50)]
    public List<int> DocumentIds { get; set; } = new();

    /// <summary>Opcional: nombre o institución de quien solicita (queda en el registro de accesos).</summary>
    [StringLength(100)]
    public string? RequesterName { get; set; }
}

public record RequestAccessResponse(Guid RequestId, DateTime OtpExpiresAt, string MaskedPhone);

public class VerifyOtpRequest
{
    [Required]
    public Guid RequestId { get; set; }

    [Required(ErrorMessage = "Escribe el código de 6 dígitos."),
     RegularExpression(@"^\d{6}$", ErrorMessage = "El código debe tener 6 dígitos.")]
    public string Code { get; set; } = "";
}

public record FileLink(int DocumentId, string Name, string Url);

/// <summary>ExpiresAt y ServerNow van en UTC: el front calcula el temporizador con la diferencia.</summary>
public record FilesResponse(DateTime ExpiresAt, DateTime ServerNow, List<FileLink> Files);
