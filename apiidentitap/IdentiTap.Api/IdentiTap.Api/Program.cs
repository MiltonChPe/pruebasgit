using System.Text;
using System.Threading.RateLimiting;
using Dapper;
using IdentiTap.Api.Data;
using IdentiTap.Api.Middleware;
using IdentiTap.Api.Services;
using IdentiTap.Api.Settings;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;

var builder = WebApplication.CreateBuilder(args);
var config = builder.Configuration;

// ---------------------------------------------------------------- Dapper
SqlMapper.AddTypeHandler(new DateOnlyHandler());
SqlMapper.AddTypeHandler(new UtcDateTimeHandler());

// ---------------------------------------------------------------- Configuración tipada
builder.Services.Configure<JwtOptions>(config.GetSection("Jwt"));
builder.Services.Configure<SecurityOptions>(config.GetSection("Security"));
builder.Services.Configure<AppOptions>(config.GetSection("App"));
builder.Services.Configure<EmailOptions>(config.GetSection("Email"));
builder.Services.Configure<SmsOptions>(config.GetSection("Sms"));
builder.Services.Configure<StorageOptions>(config.GetSection("Storage"));

// ---------------------------------------------------------------- Servicios
builder.Services.AddSingleton<Repository>();
builder.Services.AddSingleton<CryptoService>();
builder.Services.AddSingleton<JwtService>();
builder.Services.AddSingleton<BlobService>();
builder.Services.AddScoped<AccessService>();

// Proveedor de correo: "Console" (demo) o "Smtp"
var emailProvider = (config["Email:Provider"] ?? config["Email__Provider"] ?? "Console").Trim();
if (emailProvider.Equals("Smtp", StringComparison.OrdinalIgnoreCase))
    builder.Services.AddSingleton<IEmailService, SmtpEmailService>();
else
    builder.Services.AddSingleton<IEmailService, ConsoleEmailService>();

// Proveedor de SMS: "Console" (demo), "Twilio" o "SmsGate" (tu teléfono Android)
var smsProvider = (config["Sms:Provider"] ?? config["Sms__Provider"] ?? "Console").Trim();
if (smsProvider.Equals("Twilio", StringComparison.OrdinalIgnoreCase))
    builder.Services.AddSingleton<ISmsService, TwilioSmsService>();
else if (smsProvider.Equals("SmsGate", StringComparison.OrdinalIgnoreCase))
    builder.Services.AddHttpClient<ISmsService, SmsGateSmsService>();
else
    builder.Services.AddSingleton<ISmsService, ConsoleSmsService>();

// ---------------------------------------------------------------- Autenticación JWT
var jwt = config.GetSection("Jwt").Get<JwtOptions>() ?? new JwtOptions();
if (string.IsNullOrWhiteSpace(jwt.Secret) || jwt.Secret.Length < 32)
    throw new InvalidOperationException("Jwt:Secret debe tener al menos 32 caracteres.");

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.MapInboundClaims = false;
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwt.Issuer,
            ValidateAudience = true,
            ValidAudience = jwt.Audience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.Secret)),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromSeconds(30)
        };
    });
builder.Services.AddAuthorization();

// ---------------------------------------------------------------- CORS (solo tu frontend)
var origins = config.GetSection("Cors:Origins").Get<string[]>() ?? Array.Empty<string>();
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p
    .WithOrigins(origins)
    .AllowAnyHeader()
    .AllowAnyMethod()));

// ---------------------------------------------------------------- Rate limiting por IP
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = async (context, token) =>
    {
        context.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
        await context.HttpContext.Response.WriteAsJsonAsync(
            new { error = "Demasiados intentos. Espera un momento e inténtalo de nuevo." }, token);
    };

    options.AddPolicy("public", ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 60,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0
        }));

    options.AddPolicy("sensitive", ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 10,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0
        }));
});

// App Service está detrás de un proxy: así RemoteIpAddress es la IP real del cliente.
builder.Services.Configure<ForwardedHeadersOptions>(o =>
{
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    o.KnownNetworks.Clear();
    o.KnownProxies.Clear();
});

// ---------------------------------------------------------------- MVC + validación en español
builder.Services.AddControllers().ConfigureApiBehaviorOptions(o =>
{
    o.InvalidModelStateResponseFactory = ctx =>
    {
        var message = ctx.ModelState.Values
            .SelectMany(v => v.Errors)
            .Select(e => string.IsNullOrWhiteSpace(e.ErrorMessage) ? "Datos inválidos." : e.ErrorMessage)
            .FirstOrDefault() ?? "Datos inválidos.";
        return new BadRequestObjectResult(new { error = message });
    };
});

// ---------------------------------------------------------------- Swagger (pruebas)
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "IdentiTap API", Version = "v1" });
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "Pega solo el token JWT que devuelve /api/auth/login"
    });
    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme { Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" } },
            Array.Empty<string>()
        }
    });
});

// ================================================================ Pipeline
var app = builder.Build();

app.UseForwardedHeaders();
app.UseMiddleware<ErrorHandlingMiddleware>();

// En Azure activa Swagger poniendo EnableSwagger=true (y desactívalo al terminar las pruebas).
if (app.Environment.IsDevelopment() || config.GetValue<bool>("EnableSwagger"))
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();
app.UseCors();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapGet("/", () => Results.Ok(new { name = "IdentiTap API", status = "ok", smsProvider, emailProvider }));

app.Run();
