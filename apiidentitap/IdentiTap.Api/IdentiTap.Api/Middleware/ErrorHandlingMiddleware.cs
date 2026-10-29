using Microsoft.Data.SqlClient;

namespace IdentiTap.Api.Middleware;

/// <summary>Error "esperado" que se devuelve al cliente con un código HTTP y un mensaje.</summary>
public class ApiException : Exception
{
    public int Status { get; }
    public ApiException(int status, string message) : base(message) => Status = status;
}

public class ErrorHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ErrorHandlingMiddleware> _log;

    public ErrorHandlingMiddleware(RequestDelegate next, ILogger<ErrorHandlingMiddleware> log)
    {
        _next = next;
        _log = log;
    }

    public async Task Invoke(HttpContext ctx)
    {
        try
        {
            await _next(ctx);
        }
        catch (ApiException ex)
        {
            await Write(ctx, ex.Status, ex.Message);
        }
        // Errores lanzados con THROW 50xxx desde los stored procedures
        catch (SqlException ex) when (ex.Number is >= 50000 and < 51000)
        {
            var status = ex.Number switch
            {
                50020 => StatusCodes.Status404NotFound,
                50006 or 50007 => StatusCodes.Status429TooManyRequests,
                50010 or 50013 or 50014 => StatusCodes.Status409Conflict,
                _ => StatusCodes.Status400BadRequest
            };
            await Write(ctx, status, ex.Message);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Error no controlado en {Path}", ctx.Request.Path);
            await Write(ctx, StatusCodes.Status500InternalServerError, "Ocurrió un error interno. Intenta de nuevo.");
        }
    }

    private static Task Write(HttpContext ctx, int status, string message)
    {
        if (ctx.Response.HasStarted) return Task.CompletedTask;
        ctx.Response.StatusCode = status;
        return ctx.Response.WriteAsJsonAsync(new { error = message });
    }
}
