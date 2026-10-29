/* =====================================================================
   IdentiTap - Script de base de datos (Azure SQL Database / SQL Server)

   COMO USARLO
   1. Crea una base de datos vacia (ej. IdentiTapDb) y conectate a ella.
   2. Ejecuta TODO este script (SSMS, Azure Data Studio o extension
      mssql de VS Code). Necesita el separador GO, por eso NO funciona
      pegado de una sola vez en el editor de consultas del portal de
      Azure: ahi ejecutalo bloque por bloque (entre cada GO).
   3. Es re-ejecutable: las tablas solo se crean si no existen y los
      procedimientos usan CREATE OR ALTER.
   4. Al final hay un bloque para cargar pulseras de prueba
      (sp_SeedBands). Ejecutalo una vez y GUARDA el resultado: el codigo
      de reclamo (ClaimCode) solo se muestra en ese momento.

   CODIGOS DE ERROR (los que lanzan los SP con THROW)
   50001 Codigo NFC invalido o ya vinculado
   50002 Pulsera inactiva o sin vincular
   50003 Sin documentos seleccionados
   50004 Documento invalido
   50005 Solicitud no valida o ya usada
   50006 Espera antes de pedir otro codigo
   50007 Demasiadas solicitudes
   50010 Correo ya registrado
   50011 Enlace de verificacion invalido o expirado
   50012 Correo sin verificar
   50013 El usuario ya tiene perfil
   50014 El perfil ya tiene una pulsera vinculada
   50020 No encontrado o sin permiso
   ===================================================================== */

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

/* ---------------------------------------------------------------------
   TABLAS
   --------------------------------------------------------------------- */

IF OBJECT_ID(N'dbo.Users', N'U') IS NULL
CREATE TABLE dbo.Users (
    UserID               INT IDENTITY(1,1) NOT NULL,
    Email                NVARCHAR(256)     NOT NULL,
    PasswordHash         NVARCHAR(255)     NOT NULL,
    EmailVerified        BIT               NOT NULL CONSTRAINT DF_Users_EmailVerified DEFAULT (0),
    VerifyTokenHash      CHAR(64)          NULL,
    VerifyTokenExpiresAt DATETIME2         NULL,
    CreatedAt            DATETIME2         NOT NULL CONSTRAINT DF_Users_CreatedAt DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_Users PRIMARY KEY (UserID),
    CONSTRAINT UQ_Users_Email UNIQUE (Email)
);
GO

IF OBJECT_ID(N'dbo.Elders', N'U') IS NULL
CREATE TABLE dbo.Elders (
    ElderID               INT IDENTITY(1,1) NOT NULL,
    UserID                INT               NOT NULL,
    FullName              NVARCHAR(150)     NOT NULL,
    BirthDate             DATE              NOT NULL,
    BloodType             VARCHAR(5)        NOT NULL,
    Allergies             NVARCHAR(500)     NULL,
    PhoneNumber           VARCHAR(20)       NOT NULL,   -- formato E.164, ej. +524421234567
    EmergencyContactName  NVARCHAR(150)     NOT NULL,
    EmergencyContactPhone VARCHAR(20)       NOT NULL,
    CreatedAt             DATETIME2         NOT NULL CONSTRAINT DF_Elders_CreatedAt DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_Elders PRIMARY KEY (ElderID),
    CONSTRAINT FK_Elders_Users FOREIGN KEY (UserID) REFERENCES dbo.Users(UserID),
    CONSTRAINT CK_Elders_BloodType CHECK (BloodType IN ('A+','A-','B+','B-','AB+','AB-','O+','O-'))
);
GO

-- Inventario de pulseras: se cargan desde fabrica (sp_SeedBands) y el usuario las VINCULA.
IF OBJECT_ID(N'dbo.NFCBands', N'U') IS NULL
CREATE TABLE dbo.NFCBands (
    BandID        INT IDENTITY(1,1) NOT NULL,
    NFCUID        VARCHAR(32)       NOT NULL,                -- codigo publico que va en la URL /scan/{NFCUID}
    ClaimCodeHash CHAR(64)          NOT NULL,                -- hash del codigo secreto impreso SOLO en la tarjeta
    ElderID       INT               NULL,                    -- NULL = pulsera sin vincular
    Status        VARCHAR(10)       NOT NULL CONSTRAINT DF_NFCBands_Status DEFAULT ('Inactiva'),
    LinkedAt      DATETIME2         NULL,
    CONSTRAINT PK_NFCBands PRIMARY KEY (BandID),
    CONSTRAINT UQ_NFCBands_NFCUID UNIQUE (NFCUID),
    CONSTRAINT FK_NFCBands_Elders FOREIGN KEY (ElderID) REFERENCES dbo.Elders(ElderID),
    CONSTRAINT CK_NFCBands_Status CHECK (Status IN ('Activa','Inactiva'))
);
GO

IF OBJECT_ID(N'dbo.Documents', N'U') IS NULL
CREATE TABLE dbo.Documents (
    DocumentID   INT IDENTITY(1,1) NOT NULL,
    ElderID      INT               NOT NULL,
    DocumentName NVARCHAR(150)     NOT NULL,
    BlobName     NVARCHAR(300)     NOT NULL,                 -- nombre del blob en Azure Storage (NO la URL)
    SizeBytes    BIGINT            NOT NULL,
    IsDeleted    BIT               NOT NULL CONSTRAINT DF_Documents_IsDeleted DEFAULT (0),
    CreatedAt    DATETIME2         NOT NULL CONSTRAINT DF_Documents_CreatedAt DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_Documents PRIMARY KEY (DocumentID),
    CONSTRAINT FK_Documents_Elders FOREIGN KEY (ElderID) REFERENCES dbo.Elders(ElderID)
);
GO

IF OBJECT_ID(N'dbo.DocumentRequests', N'U') IS NULL
CREATE TABLE dbo.DocumentRequests (
    RequestID       UNIQUEIDENTIFIER NOT NULL,               -- lo genera el backend (no adivinable)
    ElderID         INT              NOT NULL,
    BandID          INT              NOT NULL,
    Status          VARCHAR(12)      NOT NULL CONSTRAINT DF_DocReq_Status DEFAULT ('Pendiente'),
    OtpHash         CHAR(64)         NOT NULL,               -- HMAC del OTP, nunca el codigo en claro
    OtpExpiresAt    DATETIME2        NOT NULL,
    OtpAttempts     INT              NOT NULL CONSTRAINT DF_DocReq_Attempts DEFAULT (0),
    RequesterName   NVARCHAR(100)    NULL,                   -- opcional: nombre/institucion de quien solicita
    RequesterIP     VARCHAR(45)      NULL,
    RequestedAt     DATETIME2        NOT NULL CONSTRAINT DF_DocReq_RequestedAt DEFAULT (SYSUTCDATETIME()),
    ApprovedAt      DATETIME2        NULL,
    AccessExpiresAt DATETIME2        NULL,                   -- ApprovedAt + 3 minutos
    CONSTRAINT PK_DocumentRequests PRIMARY KEY (RequestID),
    CONSTRAINT FK_DocReq_Elders FOREIGN KEY (ElderID) REFERENCES dbo.Elders(ElderID),
    CONSTRAINT FK_DocReq_Bands  FOREIGN KEY (BandID)  REFERENCES dbo.NFCBands(BandID),
    CONSTRAINT CK_DocReq_Status CHECK (Status IN ('Pendiente','Aprobado','Rechazado','Expirado'))
);
GO

IF OBJECT_ID(N'dbo.DocumentRequestItems', N'U') IS NULL
CREATE TABLE dbo.DocumentRequestItems (
    RequestID  UNIQUEIDENTIFIER NOT NULL,
    DocumentID INT              NOT NULL,
    CONSTRAINT PK_DocumentRequestItems PRIMARY KEY (RequestID, DocumentID),
    CONSTRAINT FK_DocReqItems_Requests  FOREIGN KEY (RequestID)  REFERENCES dbo.DocumentRequests(RequestID),
    CONSTRAINT FK_DocReqItems_Documents FOREIGN KEY (DocumentID) REFERENCES dbo.Documents(DocumentID)
);
GO

/* ---------------------------------------------------------------------
   INDICES
   --------------------------------------------------------------------- */

-- Un usuario tiene un solo perfil de adulto mayor
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Elders_UserID' AND object_id = OBJECT_ID(N'dbo.Elders'))
    CREATE UNIQUE INDEX UX_Elders_UserID ON dbo.Elders(UserID);
GO

-- Un adulto mayor tiene una sola pulsera vinculada a la vez
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_NFCBands_ElderID' AND object_id = OBJECT_ID(N'dbo.NFCBands'))
    CREATE UNIQUE INDEX UX_NFCBands_ElderID ON dbo.NFCBands(ElderID) WHERE ElderID IS NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Documents_ElderID' AND object_id = OBJECT_ID(N'dbo.Documents'))
    CREATE INDEX IX_Documents_ElderID ON dbo.Documents(ElderID) INCLUDE (IsDeleted);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_DocReq_Band_RequestedAt' AND object_id = OBJECT_ID(N'dbo.DocumentRequests'))
    CREATE INDEX IX_DocReq_Band_RequestedAt ON dbo.DocumentRequests(BandID, RequestedAt DESC);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_DocReq_Elder_RequestedAt' AND object_id = OBJECT_ID(N'dbo.DocumentRequests'))
    CREATE INDEX IX_DocReq_Elder_RequestedAt ON dbo.DocumentRequests(ElderID, RequestedAt DESC);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Users_VerifyTokenHash' AND object_id = OBJECT_ID(N'dbo.Users'))
    CREATE INDEX IX_Users_VerifyTokenHash ON dbo.Users(VerifyTokenHash) WHERE VerifyTokenHash IS NOT NULL;
GO

/* ---------------------------------------------------------------------
   STORED PROCEDURES - USUARIOS
   --------------------------------------------------------------------- */

-- Registra un usuario. Recibe el HASH de la contraseña (nunca la contraseña).
-- Regresa: UserID, Email, CreatedAt
CREATE OR ALTER PROCEDURE dbo.sp_CreateUser
    @Email                NVARCHAR(256),
    @PasswordHash         NVARCHAR(255),
    @VerifyTokenHash      CHAR(64),
    @VerifyTokenExpiresAt DATETIME2
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (SELECT 1 FROM dbo.Users WHERE Email = @Email)
        THROW 50010, N'Ese correo ya está registrado.', 1;

    INSERT INTO dbo.Users (Email, PasswordHash, EmailVerified, VerifyTokenHash, VerifyTokenExpiresAt)
    VALUES (@Email, @PasswordHash, 0, @VerifyTokenHash, @VerifyTokenExpiresAt);

    SELECT UserID, Email, CreatedAt
    FROM dbo.Users
    WHERE UserID = CAST(SCOPE_IDENTITY() AS INT);
END
GO

-- Reemplaza a sp_LoginUser: la comparacion de contraseña se hace en el backend (BCrypt).
-- Regresa: UserID, Email, PasswordHash, EmailVerified, CreatedAt
CREATE OR ALTER PROCEDURE dbo.sp_GetUserByEmail
    @Email NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT UserID, Email, PasswordHash, EmailVerified, CreatedAt
    FROM dbo.Users
    WHERE Email = @Email;
END
GO

-- Genera un nuevo token de verificacion (reenviar correo). Solo si aun no esta verificado.
-- Regresa: UserID, Email (0 filas si no existe o ya esta verificado)
CREATE OR ALTER PROCEDURE dbo.sp_SetEmailVerifyToken
    @Email                NVARCHAR(256),
    @VerifyTokenHash      CHAR(64),
    @VerifyTokenExpiresAt DATETIME2
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.Users
    SET VerifyTokenHash = @VerifyTokenHash,
        VerifyTokenExpiresAt = @VerifyTokenExpiresAt
    OUTPUT inserted.UserID, inserted.Email
    WHERE Email = @Email AND EmailVerified = 0;
END
GO

-- Marca el correo como verificado usando el hash del token del enlace.
-- No regresa nada. Lanza 50011 si el enlace es invalido, expiro o ya se uso.
CREATE OR ALTER PROCEDURE dbo.sp_VerifyEmail
    @TokenHash CHAR(64)
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE dbo.Users
    SET EmailVerified = 1,
        VerifyTokenHash = NULL,
        VerifyTokenExpiresAt = NULL
    WHERE VerifyTokenHash = @TokenHash
      AND VerifyTokenExpiresAt > SYSUTCDATETIME();

    IF @@ROWCOUNT = 0
        THROW 50011, N'El enlace de verificación no es válido, ya se usó o expiró.', 1;
END
GO

-- Estado del usuario para bloquear/liberar el dashboard.
-- Regresa: EmailVerified, HasElder, ElderID
CREATE OR ALTER PROCEDURE dbo.sp_GetUserStatus
    @UserID INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT u.EmailVerified,
           CAST(CASE WHEN e.ElderID IS NULL THEN 0 ELSE 1 END AS BIT) AS HasElder,
           e.ElderID
    FROM dbo.Users u
    LEFT JOIN dbo.Elders e ON e.UserID = u.UserID
    WHERE u.UserID = @UserID;
END
GO

/* ---------------------------------------------------------------------
   STORED PROCEDURES - ADULTO MAYOR Y PULSERA
   --------------------------------------------------------------------- */

-- Reemplaza a sp_CreateElder + sp_CreateNFCBand: crea el perfil y vincula la pulsera
-- en UNA transaccion. Valida correo verificado, un perfil por usuario y codigos.
-- Regresa: ElderID, BandID
CREATE OR ALTER PROCEDURE dbo.sp_CreateElderAndLinkBand
    @UserID                INT,
    @FullName              NVARCHAR(150),
    @BirthDate             DATE,
    @BloodType             VARCHAR(5),
    @Allergies             NVARCHAR(500),
    @PhoneNumber           VARCHAR(20),
    @EmergencyContactName  NVARCHAR(150),
    @EmergencyContactPhone VARCHAR(20),
    @NFCUID                VARCHAR(32),
    @ClaimCodeHash         CHAR(64)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE UserID = @UserID AND EmailVerified = 1)
        THROW 50012, N'Debes verificar tu correo antes de crear el perfil.', 1;

    IF EXISTS (SELECT 1 FROM dbo.Elders WHERE UserID = @UserID)
        THROW 50013, N'Ya tienes un perfil de adulto mayor registrado.', 1;

    BEGIN TRAN;

        DECLARE @BandID INT;

        SELECT @BandID = BandID
        FROM dbo.NFCBands WITH (UPDLOCK, HOLDLOCK)
        WHERE NFCUID = @NFCUID
          AND ClaimCodeHash = @ClaimCodeHash
          AND ElderID IS NULL;

        IF @BandID IS NULL
        BEGIN
            ROLLBACK TRAN;
            THROW 50001, N'El código de la pulsera no es válido o ya fue vinculado.', 1;
        END

        INSERT INTO dbo.Elders (UserID, FullName, BirthDate, BloodType, Allergies, PhoneNumber,
                                EmergencyContactName, EmergencyContactPhone)
        VALUES (@UserID, @FullName, @BirthDate, @BloodType, @Allergies, @PhoneNumber,
                @EmergencyContactName, @EmergencyContactPhone);

        DECLARE @ElderID INT = CAST(SCOPE_IDENTITY() AS INT);

        UPDATE dbo.NFCBands
        SET ElderID = @ElderID, Status = 'Activa', LinkedAt = SYSUTCDATETIME()
        WHERE BandID = @BandID;

    COMMIT TRAN;

    SELECT @ElderID AS ElderID, @BandID AS BandID;
END
GO

-- Vincula una pulsera a un perfil que se quedo sin pulsera (despues de desvincular).
-- Regresa: BandID
CREATE OR ALTER PROCEDURE dbo.sp_LinkBandToElder
    @UserID        INT,
    @NFCUID        VARCHAR(32),
    @ClaimCodeHash CHAR(64)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ElderID INT = (SELECT ElderID FROM dbo.Elders WHERE UserID = @UserID);
    IF @ElderID IS NULL
        THROW 50020, N'Primero registra el perfil del adulto mayor.', 1;

    IF EXISTS (SELECT 1 FROM dbo.NFCBands WHERE ElderID = @ElderID)
        THROW 50014, N'El perfil ya tiene una pulsera vinculada.', 1;

    UPDATE dbo.NFCBands
    SET ElderID = @ElderID, Status = 'Activa', LinkedAt = SYSUTCDATETIME()
    OUTPUT inserted.BandID
    WHERE NFCUID = @NFCUID AND ClaimCodeHash = @ClaimCodeHash AND ElderID IS NULL;

    IF @@ROWCOUNT = 0
        THROW 50001, N'El código de la pulsera no es válido o ya fue vinculado.', 1;
END
GO

-- Datos del adulto mayor del usuario (panel admin) incluyendo su pulsera.
-- Regresa: ElderID, FullName, BirthDate, BloodType, Allergies, PhoneNumber,
--          EmergencyContactName, EmergencyContactPhone, BandID, NFCUID, Status
CREATE OR ALTER PROCEDURE dbo.sp_GetElderByUser
    @UserID INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT e.ElderID, e.FullName, e.BirthDate, e.BloodType, e.Allergies, e.PhoneNumber,
           e.EmergencyContactName, e.EmergencyContactPhone,
           b.BandID, b.NFCUID, b.Status
    FROM dbo.Elders e
    LEFT JOIN dbo.NFCBands b ON b.ElderID = e.ElderID
    WHERE e.UserID = @UserID;
END
GO

-- Datos del adulto mayor a partir del codigo de la pulsera (Web 2). SOLO uso interno del backend:
-- el API decide que campos se exponen publicamente.
-- Regresa: ElderID, FullName, BirthDate, BloodType, Allergies, PhoneNumber,
--          EmergencyContactName, EmergencyContactPhone, BandID, NFCUID, Status
CREATE OR ALTER PROCEDURE dbo.sp_GetElderByNFCUID
    @NFCUID VARCHAR(32)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT e.ElderID, e.FullName, e.BirthDate, e.BloodType, e.Allergies, e.PhoneNumber,
           e.EmergencyContactName, e.EmergencyContactPhone,
           b.BandID, b.NFCUID, b.Status
    FROM dbo.NFCBands b
    JOIN dbo.Elders e ON e.ElderID = b.ElderID
    WHERE b.NFCUID = @NFCUID;
END
GO

-- Actualiza los datos de emergencia. No regresa nada.
CREATE OR ALTER PROCEDURE dbo.sp_UpdateElder
    @UserID                INT,
    @ElderID               INT,
    @FullName              NVARCHAR(150),
    @BirthDate             DATE,
    @BloodType             VARCHAR(5),
    @Allergies             NVARCHAR(500),
    @PhoneNumber           VARCHAR(20),
    @EmergencyContactName  NVARCHAR(150),
    @EmergencyContactPhone VARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE dbo.Elders
    SET FullName = @FullName,
        BirthDate = @BirthDate,
        BloodType = @BloodType,
        Allergies = @Allergies,
        PhoneNumber = @PhoneNumber,
        EmergencyContactName = @EmergencyContactName,
        EmergencyContactPhone = @EmergencyContactPhone
    WHERE ElderID = @ElderID AND UserID = @UserID;

    IF @@ROWCOUNT = 0
        THROW 50020, N'No se encontró el perfil o no tienes permiso.', 1;
END
GO

-- Activa / desactiva la pulsera (boton "Desactivar NFC"). No regresa nada.
CREATE OR ALTER PROCEDURE dbo.sp_UpdateNFCBandStatus
    @UserID INT,
    @BandID INT,
    @Status VARCHAR(10)
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE b
    SET b.Status = @Status
    FROM dbo.NFCBands b
    JOIN dbo.Elders e ON e.ElderID = b.ElderID
    WHERE b.BandID = @BandID AND e.UserID = @UserID;

    IF @@ROWCOUNT = 0
        THROW 50020, N'No se encontró la pulsera o no tienes permiso.', 1;
END
GO

-- "Eliminar" pulsera = DESVINCULAR (no se borra el registro para conservar historial).
-- Queda Inactiva y sin dueño; se puede volver a vincular con su codigo de reclamo. No regresa nada.
CREATE OR ALTER PROCEDURE dbo.sp_DeleteNFCBand
    @UserID INT,
    @BandID INT
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE b
    SET b.ElderID = NULL, b.Status = 'Inactiva', b.LinkedAt = NULL
    FROM dbo.NFCBands b
    JOIN dbo.Elders e ON e.ElderID = b.ElderID
    WHERE b.BandID = @BandID AND e.UserID = @UserID;

    IF @@ROWCOUNT = 0
        THROW 50020, N'No se encontró la pulsera o no tienes permiso.', 1;
END
GO

/* sp_DeleteElder: NO se implementa (por las llaves foraneas y el historial de accesos). */

/* ---------------------------------------------------------------------
   STORED PROCEDURES - DOCUMENTOS
   --------------------------------------------------------------------- */

-- Registra un documento ya subido a Blob Storage. Regresa: DocumentID
CREATE OR ALTER PROCEDURE dbo.sp_CreateDocument
    @UserID       INT,
    @ElderID      INT,
    @DocumentName NVARCHAR(150),
    @BlobName     NVARCHAR(300),
    @SizeBytes    BIGINT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.Elders WHERE ElderID = @ElderID AND UserID = @UserID)
        THROW 50020, N'No se encontró el perfil o no tienes permiso.', 1;

    INSERT INTO dbo.Documents (ElderID, DocumentName, BlobName, SizeBytes)
    VALUES (@ElderID, @DocumentName, @BlobName, @SizeBytes);

    SELECT CAST(SCOPE_IDENTITY() AS INT) AS DocumentID;
END
GO

-- Lista de documentos del adulto mayor (panel admin).
-- Regresa: DocumentID, ElderID, DocumentName, BlobName, SizeBytes, CreatedAt
CREATE OR ALTER PROCEDURE dbo.sp_GetDocumentsByElder
    @UserID  INT,
    @ElderID INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT d.DocumentID, d.ElderID, d.DocumentName, d.BlobName, d.SizeBytes, d.CreatedAt
    FROM dbo.Documents d
    JOIN dbo.Elders e ON e.ElderID = d.ElderID
    WHERE d.ElderID = @ElderID AND e.UserID = @UserID AND d.IsDeleted = 0
    ORDER BY d.CreatedAt DESC;
END
GO

-- Lista PUBLICA (Web 2): solo ID y nombre. Nunca expone BlobName ni URLs.
-- Regresa: DocumentID, DocumentName
CREATE OR ALTER PROCEDURE dbo.sp_GetPublicDocuments
    @ElderID INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT DocumentID, DocumentName
    FROM dbo.Documents
    WHERE ElderID = @ElderID AND IsDeleted = 0
    ORDER BY DocumentName;
END
GO

-- Cambia el nombre y/o el archivo (BlobName) de un documento.
-- Regresa: OldBlobName (solo si se reemplazo el archivo, para que el backend borre el blob anterior)
CREATE OR ALTER PROCEDURE dbo.sp_UpdateDocument
    @UserID       INT,
    @DocumentID   INT,
    @DocumentName NVARCHAR(150) = NULL,
    @BlobName     NVARCHAR(300) = NULL,
    @SizeBytes    BIGINT        = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Old NVARCHAR(300);

    SELECT @Old = d.BlobName
    FROM dbo.Documents d
    JOIN dbo.Elders e ON e.ElderID = d.ElderID
    WHERE d.DocumentID = @DocumentID AND e.UserID = @UserID AND d.IsDeleted = 0;

    IF @Old IS NULL
        THROW 50020, N'No se encontró el documento o no tienes permiso.', 1;

    UPDATE dbo.Documents
    SET DocumentName = COALESCE(@DocumentName, DocumentName),
        BlobName     = COALESCE(@BlobName, BlobName),
        SizeBytes    = COALESCE(@SizeBytes, SizeBytes)
    WHERE DocumentID = @DocumentID;

    SELECT CASE WHEN @BlobName IS NOT NULL THEN @Old ELSE NULL END AS OldBlobName;
END
GO

-- Borrado LOGICO (el historial de solicitudes conserva la referencia).
-- Regresa: BlobName (el backend borra el archivo de Blob Storage)
CREATE OR ALTER PROCEDURE dbo.sp_DeleteDocument
    @UserID     INT,
    @DocumentID INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Blob NVARCHAR(300);

    SELECT @Blob = d.BlobName
    FROM dbo.Documents d
    JOIN dbo.Elders e ON e.ElderID = d.ElderID
    WHERE d.DocumentID = @DocumentID AND e.UserID = @UserID AND d.IsDeleted = 0;

    IF @Blob IS NULL
        THROW 50020, N'No se encontró el documento o no tienes permiso.', 1;

    UPDATE dbo.Documents SET IsDeleted = 1 WHERE DocumentID = @DocumentID;

    SELECT @Blob AS BlobName;
END
GO

/* ---------------------------------------------------------------------
   STORED PROCEDURES - SOLICITUDES DE ACCESO (OTP)
   --------------------------------------------------------------------- */

-- Crea la solicitud con sus documentos. Aplica limite anti-abuso de SMS por pulsera
-- (1 cada 60 s y maximo 6 por hora).
-- Regresa: RequestID, PhoneNumber, EmergencyContactPhone, FullName
CREATE OR ALTER PROCEDURE dbo.sp_CreateDocumentRequest
    @RequestID       UNIQUEIDENTIFIER,
    @BandID          INT,
    @DocumentIdsJson NVARCHAR(MAX),     -- ej. [1,2,5]
    @OtpHash         CHAR(64),
    @OtpExpiresAt    DATETIME2,
    @RequesterIP     VARCHAR(45)   = NULL,
    @RequesterName   NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ElderID INT;

    SELECT @ElderID = ElderID
    FROM dbo.NFCBands
    WHERE BandID = @BandID AND Status = 'Activa' AND ElderID IS NOT NULL;

    IF @ElderID IS NULL
        THROW 50002, N'La pulsera está inactiva o no está vinculada.', 1;

    IF EXISTS (SELECT 1 FROM dbo.DocumentRequests
               WHERE BandID = @BandID AND RequestedAt > DATEADD(SECOND, -60, SYSUTCDATETIME()))
        THROW 50006, N'Espera un minuto antes de solicitar otro código.', 1;

    IF (SELECT COUNT(*) FROM dbo.DocumentRequests
        WHERE BandID = @BandID AND RequestedAt > DATEADD(HOUR, -1, SYSUTCDATETIME())) >= 6
        THROW 50007, N'Demasiadas solicitudes. Intenta más tarde.', 1;

    DECLARE @ids TABLE (DocumentID INT PRIMARY KEY);

    INSERT INTO @ids (DocumentID)
    SELECT DISTINCT CAST([value] AS INT) FROM OPENJSON(@DocumentIdsJson);

    IF NOT EXISTS (SELECT 1 FROM @ids)
        THROW 50003, N'Selecciona al menos un documento.', 1;

    IF EXISTS (SELECT 1 FROM @ids i
               WHERE NOT EXISTS (SELECT 1 FROM dbo.Documents d
                                 WHERE d.DocumentID = i.DocumentID
                                   AND d.ElderID = @ElderID
                                   AND d.IsDeleted = 0))
        THROW 50004, N'Alguno de los documentos no es válido.', 1;

    BEGIN TRAN;

        INSERT INTO dbo.DocumentRequests (RequestID, ElderID, BandID, OtpHash, OtpExpiresAt, RequesterIP, RequesterName)
        VALUES (@RequestID, @ElderID, @BandID, @OtpHash, @OtpExpiresAt, @RequesterIP, @RequesterName);

        INSERT INTO dbo.DocumentRequestItems (RequestID, DocumentID)
        SELECT @RequestID, DocumentID FROM @ids;

    COMMIT TRAN;

    SELECT @RequestID AS RequestID, e.PhoneNumber, e.EmergencyContactPhone, e.FullName
    FROM dbo.Elders e
    WHERE e.ElderID = @ElderID;
END
GO

-- Lee una solicitud (para validar el OTP en el backend).
-- Regresa: RequestID, ElderID, BandID, Status, OtpHash, OtpExpiresAt, OtpAttempts, AccessExpiresAt
CREATE OR ALTER PROCEDURE dbo.sp_GetDocumentRequest
    @RequestID UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SELECT RequestID, ElderID, BandID, Status, OtpHash, OtpExpiresAt, OtpAttempts, AccessExpiresAt
    FROM dbo.DocumentRequests
    WHERE RequestID = @RequestID;
END
GO

-- Suma un intento fallido; al llegar al maximo, la solicitud queda Rechazada.
-- Regresa: Attempts, Status
CREATE OR ALTER PROCEDURE dbo.sp_RegisterOtpAttempt
    @RequestID   UNIQUEIDENTIFIER,
    @MaxAttempts INT = 3
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE dbo.DocumentRequests
    SET OtpAttempts = OtpAttempts + 1,
        Status = CASE WHEN OtpAttempts + 1 >= @MaxAttempts THEN 'Rechazado' ELSE Status END
    WHERE RequestID = @RequestID AND Status = 'Pendiente';

    SELECT OtpAttempts AS Attempts, Status
    FROM dbo.DocumentRequests
    WHERE RequestID = @RequestID;
END
GO

-- Aprueba la solicitud UNA sola vez (OTP de un solo uso, seguro ante peticiones simultaneas)
-- y fija la caducidad del acceso (por defecto 3 minutos).
-- Regresa: AccessExpiresAt
CREATE OR ALTER PROCEDURE dbo.sp_ApproveDocumentRequest
    @RequestID     UNIQUEIDENTIFIER,
    @AccessMinutes INT = 3
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @now DATETIME2 = SYSUTCDATETIME();

    UPDATE dbo.DocumentRequests
    SET Status = 'Aprobado',
        ApprovedAt = @now,
        AccessExpiresAt = DATEADD(MINUTE, @AccessMinutes, @now)
    WHERE RequestID = @RequestID
      AND Status = 'Pendiente'
      AND OtpExpiresAt > @now;

    IF @@ROWCOUNT = 0
        THROW 50005, N'La solicitud no es válida o ya fue utilizada.', 1;

    SELECT AccessExpiresAt FROM dbo.DocumentRequests WHERE RequestID = @RequestID;
END
GO

-- Cambia el estado de una solicitud PENDIENTE (Rechazado / Expirado). No regresa nada.
CREATE OR ALTER PROCEDURE dbo.sp_UpdateDocumentRequestStatus
    @RequestID UNIQUEIDENTIFIER,
    @Status    VARCHAR(12)
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE dbo.DocumentRequests
    SET Status = @Status
    WHERE RequestID = @RequestID AND Status = 'Pendiente';
END
GO

-- Documentos de una solicitud APROBADA y aun vigente (la base impone la caducidad de 3 min).
-- Regresa: DocumentID, DocumentName, BlobName
CREATE OR ALTER PROCEDURE dbo.sp_GetDocumentsByRequest
    @RequestID UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SELECT d.DocumentID, d.DocumentName, d.BlobName
    FROM dbo.DocumentRequests r
    JOIN dbo.DocumentRequestItems i ON i.RequestID = r.RequestID
    JOIN dbo.Documents d ON d.DocumentID = i.DocumentID
    WHERE r.RequestID = @RequestID
      AND r.Status = 'Aprobado'
      AND r.AccessExpiresAt > SYSUTCDATETIME()
      AND d.IsDeleted = 0;
END
GO

-- Registros de acceso para el panel admin.
-- Regresa: RequestID, RequestedAt, Status, RequesterName, RequesterIP, ApprovedAt, AccessExpiresAt, Documents
CREATE OR ALTER PROCEDURE dbo.sp_GetAccessLogsByUser
    @UserID INT,
    @Top    INT = 100
AS
BEGIN
    SET NOCOUNT ON;

    SELECT TOP (@Top)
           r.RequestID,
           r.RequestedAt,
           CASE WHEN r.Status = 'Pendiente' AND r.OtpExpiresAt < SYSUTCDATETIME()
                THEN 'Expirado' ELSE r.Status END AS Status,
           r.RequesterName,
           r.RequesterIP,
           r.ApprovedAt,
           r.AccessExpiresAt,
           (SELECT STRING_AGG(d.DocumentName, N', ')
            FROM dbo.DocumentRequestItems i
            JOIN dbo.Documents d ON d.DocumentID = i.DocumentID
            WHERE i.RequestID = r.RequestID) AS Documents
    FROM dbo.DocumentRequests r
    JOIN dbo.Elders e ON e.ElderID = r.ElderID
    WHERE e.UserID = @UserID
    ORDER BY r.RequestedAt DESC;
END
GO

/* ---------------------------------------------------------------------
   PROVISION DE PULSERAS (proceso de "fabrica")
   Genera @Count pulseras con codigo publico (NFCUID, 10 caracteres) y
   codigo de reclamo (ClaimCode, 8 caracteres). Guarda solo el HASH del
   ClaimCode. Regresa los codigos en claro UNA sola vez:
     - NFCUID     -> va en la URL grabada en el chip  /scan/{NFCUID}
     - ClaimCode  -> se imprime en la tarjeta dentro de la caja
   El usuario escribe AMBOS en la Web 1 al crear el perfil.
   --------------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.sp_SeedBands
    @Count INT = 5
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @alphabet CHAR(31) = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   -- sin 0, O, 1, I, L
    DECLARE @out TABLE (NFCUID VARCHAR(32), ClaimCode VARCHAR(16));
    DECLARE @i INT = 0, @k INT, @uid VARCHAR(32), @claim VARCHAR(16);

    WHILE @i < @Count
    BEGIN
        SET @uid = ''; SET @claim = ''; SET @k = 0;

        WHILE @k < 10
        BEGIN
            SET @uid += SUBSTRING(@alphabet, 1 + ABS(CHECKSUM(NEWID()) % 31), 1);
            SET @k += 1;
        END

        SET @k = 0;
        WHILE @k < 8
        BEGIN
            SET @claim += SUBSTRING(@alphabet, 1 + ABS(CHECKSUM(NEWID()) % 31), 1);
            SET @k += 1;
        END

        IF NOT EXISTS (SELECT 1 FROM dbo.NFCBands WHERE NFCUID = @uid)
        BEGIN
            INSERT INTO dbo.NFCBands (NFCUID, ClaimCodeHash)
            VALUES (@uid, CONVERT(CHAR(64), HASHBYTES('SHA2_256', @claim), 2));

            INSERT INTO @out VALUES (@uid, @claim);
            SET @i += 1;
        END
    END

    SELECT NFCUID,
           ClaimCode,
           'https://TU-APP.azurestaticapps.net/scan/' + NFCUID AS UrlParaGrabarEnElChip
    FROM @out;
END
GO

/* ---------------------------------------------------------------------
   CARGA DE PULSERAS DE PRUEBA  (descomenta, ejecuta UNA vez y guarda el resultado)
   --------------------------------------------------------------------- */
-- EXEC dbo.sp_SeedBands @Count = 3;
-- GO

PRINT 'IdentiTap: estructura creada correctamente.';
GO
