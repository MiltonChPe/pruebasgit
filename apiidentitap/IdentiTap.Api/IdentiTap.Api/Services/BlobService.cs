using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Azure.Storage.Sas;
using IdentiTap.Api.Settings;
using Microsoft.Extensions.Options;

namespace IdentiTap.Api.Services;

/// <summary>Guarda los PDF en un contenedor PRIVADO y genera SAS de solo lectura con caducidad corta.</summary>
public class BlobService
{
    private readonly BlobContainerClient _container;
    private bool _containerReady;

    public BlobService(IOptions<StorageOptions> options)
    {
        var o = options.Value;
        if (string.IsNullOrWhiteSpace(o.ConnectionString))
            throw new InvalidOperationException("Falta Storage:ConnectionString.");

        _container = new BlobContainerClient(o.ConnectionString, o.Container);
    }

    private async Task EnsureContainerAsync()
    {
        if (_containerReady) return;
        await _container.CreateIfNotExistsAsync(PublicAccessType.None);
        _containerReady = true;
    }

    public async Task<(string BlobName, long Size)> UploadPdfAsync(int elderId, Stream content, long size)
    {
        await EnsureContainerAsync();

        var blobName = $"elder-{elderId}/{Guid.NewGuid():N}.pdf";
        var blob = _container.GetBlobClient(blobName);

        await blob.UploadAsync(content, new BlobUploadOptions
        {
            HttpHeaders = new BlobHttpHeaders { ContentType = "application/pdf" }
        });

        return (blobName, size);
    }

    public async Task DeleteAsync(string blobName)
    {
        await EnsureContainerAsync();
        await _container.GetBlobClient(blobName).DeleteIfExistsAsync();
    }

    /// <summary>URL con SAS de solo lectura que vence EXACTAMENTE en expiresOn.</summary>
    public string CreateReadUrl(string blobName, string downloadName, DateTimeOffset expiresOn)
    {
        var blob = _container.GetBlobClient(blobName);
        if (!blob.CanGenerateSasUri)
            throw new InvalidOperationException("El cliente de Blob no puede generar SAS: usa la connection string con la clave de la cuenta.");

        var ascii = ToAsciiFileName(downloadName);

        var builder = new BlobSasBuilder
        {
            BlobContainerName = _container.Name,
            BlobName = blobName,
            Resource = "b",
            StartsOn = DateTimeOffset.UtcNow.AddMinutes(-1),   // tolerancia de reloj
            ExpiresOn = expiresOn,
            ContentType = "application/pdf",
            ContentDisposition =
                $"attachment; filename=\"{ascii}.pdf\"; filename*=UTF-8''{Uri.EscapeDataString(downloadName)}.pdf"
        };
        builder.SetPermissions(BlobSasPermissions.Read);

        return blob.GenerateSasUri(builder).ToString();
    }

    private static string ToAsciiFileName(string name)
    {
        var normalized = name.Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder();
        foreach (var c in normalized)
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
                sb.Append(c);

        var clean = Regex.Replace(sb.ToString(), @"[^A-Za-z0-9 _.-]", "_").Trim();
        return string.IsNullOrWhiteSpace(clean) ? "documento" : clean;
    }
}
