# IdentiTap API (.NET 8)

API completa del proyecto: portal admin (`/api/admin`), escáner público (`/api/scan`, `/api/access`) y autenticación (`/api/auth`).

## 1. Preparar la base de datos
1. Crea una base **Azure SQL Database** (oferta gratuita) llamada `IdentiTapDb`.
2. En el servidor SQL: *Networking* → activa **Allow Azure services and resources to access this server** y agrega tu IP para poder conectarte desde tu PC.
3. Ejecuta `Database/IdentiTap_Database.sql` completo (SSMS / Azure Data Studio / extensión mssql de VS Code).
4. Carga pulseras de prueba: `EXEC dbo.sp_SeedBands @Count = 3;` y **guarda** el resultado (el `ClaimCode` no se vuelve a mostrar).

## 2. Storage
Crea una cuenta de Storage (LRS). El contenedor `documentos` lo crea la API solo (privado). Copia la *connection string* de *Access keys*.

## 3. Configuración
Edita `appsettings.json` para pruebas locales. En Azure NO subas secretos: usa **App Service → Settings → Environment variables** (el `__` doble reemplaza `:`):

| Variable en Azure | Valor |
|---|---|
| `ConnectionStrings__Default` | cadena de conexión de Azure SQL |
| `Jwt__Secret` | cadena aleatoria de 32+ caracteres |
| `Security__OtpPepper` | cadena aleatoria de 16+ caracteres |
| `Storage__ConnectionString` | connection string del Storage |
| `App__FrontendBaseUrl` | URL de tu Static Web App |
| `Cors__Origins__0` / `Cors__Origins__1` | `http://localhost:4200` / URL de tu Static Web App |
| `Email__Provider` | `Console` (demo) o `Smtp` |
| `Email__Host`, `Email__Port`, `Email__User`, `Email__Password`, `Email__FromEmail` | datos SMTP (Brevo o Gmail con contraseña de aplicación) |
| `Sms__Provider` | `Console` (demo) o `Twilio` |
| `Sms__AccountSid`, `Sms__AuthToken`, `Sms__FromNumber` | datos de Twilio |
| `EnableSwagger` | `true` solo mientras pruebas |

Con `Provider = Console`, el enlace de verificación y el SMS con el OTP se imprimen en el **Log stream** de App Service (Monitoring → Log stream). Úsalo solo para desarrollo/demo.

## 4. Ejecutar local
```
dotnet restore
dotnet run
```
Swagger: `https://localhost:PUERTO/swagger`.

## 5. Publicar en Azure (Visual Studio)
1. Click derecho al proyecto → **Publish** → Azure → **Azure App Service (Windows o Linux)**.
2. Elige o crea el App Service (runtime .NET 8) y publica.
3. Configura las variables de entorno de la tabla anterior y reinicia.
4. Abre `https://TU-API.azurewebsites.net/` → debe responder `{"name":"IdentiTap API","status":"ok"}`.

## 6. Endpoints

**Auth**
- `POST /api/auth/register` `{email,password}`
- `POST /api/auth/verify-email` `{token}`
- `POST /api/auth/resend-verification` `{email}`
- `POST /api/auth/login` → `{token,expiresAt,email}`

**Admin** (header `Authorization: Bearer <token>`)
- `GET  /api/admin/me` → `{email,emailVerified,hasElder,elderId}`
- `POST /api/admin/elder` · `GET /api/admin/elder` · `PUT /api/admin/elder`
- `POST /api/admin/band/deactivate` · `/activate` · `/unlink` · `/link`
- `GET/POST /api/admin/documents` (POST = multipart: `file`, `name`)
- `PUT /api/admin/documents/{id}` `{documentName}` · `PUT /api/admin/documents/{id}/file` · `DELETE /api/admin/documents/{id}`
- `GET /api/admin/access-logs`

**Público**
- `GET  /api/scan/{code}/emergency`
- `GET  /api/scan/{code}/documents`
- `POST /api/scan/{code}/request` `{documentIds:[1,2], requesterName?}` → `{requestId,otpExpiresAt,maskedPhone}`
- `POST /api/access/verify-otp` `{requestId,code}` → `{expiresAt,serverNow,files:[{documentId,name,url}]}`
- `GET  /api/access/{requestId}/files` (reemite enlaces dentro de la misma ventana de 3 min)

Errores: siempre `{ "error": "mensaje en español" }` con el código HTTP correspondiente.

## 7. Notas
- Los enlaces de descarga se abren con `<a href=url>` (no con `fetch`), así no hace falta CORS en el Storage.
- El temporizador del front se calcula con `expiresAt - serverNow` (no con el reloj del dispositivo).
- El SMS se manda sin acentos para que use un solo segmento GSM-7.
- Para .NET 10: cambia `TargetFramework` a `net10.0`, `JwtBearer` a `10.0.*` y el runtime del App Service.
