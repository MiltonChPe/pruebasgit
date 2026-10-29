namespace IdentiTap.Api.Models;

// Estas clases reciben las columnas que regresan los stored procedures (Dapper mapea por nombre).

public class UserRow
{
    public int UserID { get; set; }
    public string Email { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public bool EmailVerified { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class UserStatusRow
{
    public bool EmailVerified { get; set; }
    public bool HasElder { get; set; }
    public int? ElderID { get; set; }
}

public class CreateElderResult
{
    public int ElderID { get; set; }
    public int BandID { get; set; }
}

public class BandIdRow
{
    public int BandID { get; set; }
}

public class ElderRow
{
    public int ElderID { get; set; }
    public string FullName { get; set; } = "";
    public DateOnly BirthDate { get; set; }
    public string BloodType { get; set; } = "";
    public string? Allergies { get; set; }
    public string PhoneNumber { get; set; } = "";
    public string EmergencyContactName { get; set; } = "";
    public string EmergencyContactPhone { get; set; } = "";
    public int? BandID { get; set; }
    public string? NFCUID { get; set; }
    public string? Status { get; set; }
}

public class DocumentIdRow
{
    public int DocumentID { get; set; }
}

public class DocumentRow
{
    public int DocumentID { get; set; }
    public int ElderID { get; set; }
    public string DocumentName { get; set; } = "";
    public string BlobName { get; set; } = "";
    public long SizeBytes { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class PublicDocumentRow
{
    public int DocumentID { get; set; }
    public string DocumentName { get; set; } = "";
}

public class OldBlobRow
{
    public string? OldBlobName { get; set; }
}

public class BlobRow
{
    public string BlobName { get; set; } = "";
}

public class CreateRequestResult
{
    public Guid RequestID { get; set; }
    public string PhoneNumber { get; set; } = "";
    public string? EmergencyContactPhone { get; set; }
    public string FullName { get; set; } = "";
}

public class RequestRow
{
    public Guid RequestID { get; set; }
    public int ElderID { get; set; }
    public int BandID { get; set; }
    public string Status { get; set; } = "";
    public string OtpHash { get; set; } = "";
    public DateTime OtpExpiresAt { get; set; }
    public int OtpAttempts { get; set; }
    public DateTime? AccessExpiresAt { get; set; }
}

public class AttemptRow
{
    public int Attempts { get; set; }
    public string Status { get; set; } = "";
}

public class AccessExpiryRow
{
    public DateTime AccessExpiresAt { get; set; }
}

public class RequestDocumentRow
{
    public int DocumentID { get; set; }
    public string DocumentName { get; set; } = "";
    public string BlobName { get; set; } = "";
}

public class AccessLogRow
{
    public Guid RequestID { get; set; }
    public DateTime RequestedAt { get; set; }
    public string Status { get; set; } = "";
    public string? RequesterName { get; set; }
    public string? RequesterIP { get; set; }
    public DateTime? ApprovedAt { get; set; }
    public DateTime? AccessExpiresAt { get; set; }
    public string? Documents { get; set; }
}
