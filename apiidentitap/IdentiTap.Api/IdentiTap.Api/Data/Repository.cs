using System.Data;
using Dapper;
using IdentiTap.Api.Models;
using Microsoft.Data.SqlClient;

namespace IdentiTap.Api.Data;

/// <summary>Maneja DateOnly (columnas DATE) con Dapper.</summary>
public class DateOnlyHandler : SqlMapper.TypeHandler<DateOnly>
{
    public override void SetValue(IDbDataParameter parameter, DateOnly value)
    {
        parameter.DbType = DbType.Date;
        parameter.Value = value.ToDateTime(TimeOnly.MinValue);
    }

    public override DateOnly Parse(object value) => DateOnly.FromDateTime((DateTime)value);
}

/// <summary>Las fechas de la base están en UTC: se marcan como UTC para que el JSON salga con "Z".</summary>
public class UtcDateTimeHandler : SqlMapper.TypeHandler<DateTime>
{
    public override void SetValue(IDbDataParameter parameter, DateTime value)
    {
        parameter.DbType = DbType.DateTime2;
        parameter.Value = value;
    }

    public override DateTime Parse(object value) =>
        DateTime.SpecifyKind((DateTime)value, DateTimeKind.Utc);
}

/// <summary>Única clase que habla con SQL: cada método = un stored procedure.</summary>
public class Repository
{
    private readonly string _connectionString;

    public Repository(IConfiguration config)
    {
        _connectionString = config.GetConnectionString("Default")
            ?? throw new InvalidOperationException("Falta ConnectionStrings:Default.");
    }

    // Azure SQL gratuito (serverless) se pausa; al despertar los primeros intentos pueden fallar (40613).
    private async Task<SqlConnection> OpenAsync()
    {
        for (var attempt = 1; ; attempt++)
        {
            var conn = new SqlConnection(_connectionString);
            try
            {
                await conn.OpenAsync();
                return conn;
            }
            catch (SqlException ex) when (attempt < 4 && ex.Number is 40613 or 40197 or 40501)
            {
                await conn.DisposeAsync();
                await Task.Delay(TimeSpan.FromSeconds(5 * attempt));
            }
            catch
            {
                await conn.DisposeAsync();
                throw;
            }
        }
    }

    private async Task<T?> One<T>(string sp, object? param = null)
    {
        await using var conn = await OpenAsync();
        return await conn.QueryFirstOrDefaultAsync<T>(sp, param, commandType: CommandType.StoredProcedure);
    }

    private async Task<List<T>> Many<T>(string sp, object? param = null)
    {
        await using var conn = await OpenAsync();
        var rows = await conn.QueryAsync<T>(sp, param, commandType: CommandType.StoredProcedure);
        return rows.ToList();
    }

    private async Task Exec(string sp, object? param = null)
    {
        await using var conn = await OpenAsync();
        await conn.ExecuteAsync(sp, param, commandType: CommandType.StoredProcedure);
    }

    // ---------------- Usuarios ----------------
    public Task<UserRow?> CreateUser(string email, string passwordHash, string tokenHash, DateTime tokenExpiresAt) =>
        One<UserRow>("sp_CreateUser", new
        {
            Email = email,
            PasswordHash = passwordHash,
            VerifyTokenHash = tokenHash,
            VerifyTokenExpiresAt = tokenExpiresAt
        });

    public Task<UserRow?> GetUserByEmail(string email) =>
        One<UserRow>("sp_GetUserByEmail", new { Email = email });

    public Task<UserRow?> SetEmailVerifyToken(string email, string tokenHash, DateTime tokenExpiresAt) =>
        One<UserRow>("sp_SetEmailVerifyToken", new
        {
            Email = email,
            VerifyTokenHash = tokenHash,
            VerifyTokenExpiresAt = tokenExpiresAt
        });

    public Task VerifyEmail(string tokenHash) =>
        Exec("sp_VerifyEmail", new { TokenHash = tokenHash });

    public Task<UserStatusRow?> GetUserStatus(int userId) =>
        One<UserStatusRow>("sp_GetUserStatus", new { UserID = userId });

    // ---------------- Adulto mayor y pulsera ----------------
    public Task<CreateElderResult?> CreateElderAndLinkBand(
        int userId, string fullName, DateOnly birthDate, string bloodType, string? allergies,
        string phone, string emergencyName, string emergencyPhone, string nfcUid, string claimCodeHash) =>
        One<CreateElderResult>("sp_CreateElderAndLinkBand", new
        {
            UserID = userId,
            FullName = fullName,
            BirthDate = birthDate,
            BloodType = bloodType,
            Allergies = allergies,
            PhoneNumber = phone,
            EmergencyContactName = emergencyName,
            EmergencyContactPhone = emergencyPhone,
            NFCUID = nfcUid,
            ClaimCodeHash = claimCodeHash
        });

    public Task<BandIdRow?> LinkBandToElder(int userId, string nfcUid, string claimCodeHash) =>
        One<BandIdRow>("sp_LinkBandToElder", new { UserID = userId, NFCUID = nfcUid, ClaimCodeHash = claimCodeHash });

    public Task<ElderRow?> GetElderByUser(int userId) =>
        One<ElderRow>("sp_GetElderByUser", new { UserID = userId });

    public Task<ElderRow?> GetElderByNFCUID(string nfcUid) =>
        One<ElderRow>("sp_GetElderByNFCUID", new { NFCUID = nfcUid });

    public Task UpdateElder(
        int userId, int elderId, string fullName, DateOnly birthDate, string bloodType, string? allergies,
        string phone, string emergencyName, string emergencyPhone) =>
        Exec("sp_UpdateElder", new
        {
            UserID = userId,
            ElderID = elderId,
            FullName = fullName,
            BirthDate = birthDate,
            BloodType = bloodType,
            Allergies = allergies,
            PhoneNumber = phone,
            EmergencyContactName = emergencyName,
            EmergencyContactPhone = emergencyPhone
        });

    public Task UpdateBandStatus(int userId, int bandId, string status) =>
        Exec("sp_UpdateNFCBandStatus", new { UserID = userId, BandID = bandId, Status = status });

    public Task UnlinkBand(int userId, int bandId) =>
        Exec("sp_DeleteNFCBand", new { UserID = userId, BandID = bandId });

    // ---------------- Documentos ----------------
    public Task<DocumentIdRow?> CreateDocument(int userId, int elderId, string name, string blobName, long sizeBytes) =>
        One<DocumentIdRow>("sp_CreateDocument", new
        {
            UserID = userId,
            ElderID = elderId,
            DocumentName = name,
            BlobName = blobName,
            SizeBytes = sizeBytes
        });

    public Task<List<DocumentRow>> GetDocumentsByElder(int userId, int elderId) =>
        Many<DocumentRow>("sp_GetDocumentsByElder", new { UserID = userId, ElderID = elderId });

    public Task<List<PublicDocumentRow>> GetPublicDocuments(int elderId) =>
        Many<PublicDocumentRow>("sp_GetPublicDocuments", new { ElderID = elderId });

    public Task<OldBlobRow?> UpdateDocument(int userId, int documentId, string? name, string? blobName, long? sizeBytes) =>
        One<OldBlobRow>("sp_UpdateDocument", new
        {
            UserID = userId,
            DocumentID = documentId,
            DocumentName = name,
            BlobName = blobName,
            SizeBytes = sizeBytes
        });

    public Task<BlobRow?> DeleteDocument(int userId, int documentId) =>
        One<BlobRow>("sp_DeleteDocument", new { UserID = userId, DocumentID = documentId });

    // ---------------- Solicitudes de acceso (OTP) ----------------
    public Task<CreateRequestResult?> CreateDocumentRequest(
        Guid requestId, int bandId, string documentIdsJson, string otpHash, DateTime otpExpiresAt,
        string? ip, string? requesterName) =>
        One<CreateRequestResult>("sp_CreateDocumentRequest", new
        {
            RequestID = requestId,
            BandID = bandId,
            DocumentIdsJson = documentIdsJson,
            OtpHash = otpHash,
            OtpExpiresAt = otpExpiresAt,
            RequesterIP = ip,
            RequesterName = requesterName
        });

    public Task<RequestRow?> GetDocumentRequest(Guid requestId) =>
        One<RequestRow>("sp_GetDocumentRequest", new { RequestID = requestId });

    public Task<AttemptRow?> RegisterOtpAttempt(Guid requestId, int maxAttempts) =>
        One<AttemptRow>("sp_RegisterOtpAttempt", new { RequestID = requestId, MaxAttempts = maxAttempts });

    public Task<AccessExpiryRow?> ApproveDocumentRequest(Guid requestId, int accessMinutes) =>
        One<AccessExpiryRow>("sp_ApproveDocumentRequest", new { RequestID = requestId, AccessMinutes = accessMinutes });

    public Task UpdateDocumentRequestStatus(Guid requestId, string status) =>
        Exec("sp_UpdateDocumentRequestStatus", new { RequestID = requestId, Status = status });

    public Task<List<RequestDocumentRow>> GetDocumentsByRequest(Guid requestId) =>
        Many<RequestDocumentRow>("sp_GetDocumentsByRequest", new { RequestID = requestId });

    public Task<List<AccessLogRow>> GetAccessLogs(int userId, int top = 100) =>
        Many<AccessLogRow>("sp_GetAccessLogsByUser", new { UserID = userId, Top = top });
}
