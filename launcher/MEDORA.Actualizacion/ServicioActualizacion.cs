using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace MEDORA.Actualizacion;

/// <summary>
/// Lo necesario para ofrecer y aplicar una actualización: versión, instalador y su hash.
/// </summary>
public sealed record InfoActualizacion(string VersionTag, Uri UrlInstalador, Uri UrlHash, string NombreArchivo, string? Notas);

/// <summary>
/// Busca y descarga actualizaciones desde GitHub Releases. Convención de cada release
/// (la genera .github/workflows/release.yml):
///   tag vX.Y.Z · asset MEDORA-X.Y.Z-Setup-x64.exe · asset MEDORA-X.Y.Z-Setup-x64.exe.sha256
/// </summary>
public sealed class ServicioActualizacion(HttpClient http, string repositorio = ServicioActualizacion.RepositorioPorDefecto)
{
    public const string RepositorioPorDefecto = "langLEMY/MEDORA";

    /// <summary>Nunca lanza: sin red, con rate limit o con un release mal formado, devuelve null.</summary>
    public async Task<InfoActualizacion?> BuscarAsync(Version versionLocal, CancellationToken ct)
    {
        try
        {
            using var solicitud = new HttpRequestMessage(HttpMethod.Get, $"https://api.github.com/repos/{repositorio}/releases/latest");
            solicitud.Headers.UserAgent.ParseAdd("MEDORA-Launcher");
            solicitud.Headers.Accept.ParseAdd("application/vnd.github+json");

            using var respuesta = await http.SendAsync(solicitud, ct);
            if (!respuesta.IsSuccessStatusCode)
            {
                return null;
            }

            var release = await respuesta.Content.ReadFromJsonAsync<ReleaseGitHub>(ct);
            return InterpretarRelease(release, versionLocal);
        }
        catch
        {
            return null;
        }
    }

    /// <summary>Separado de la red para poder testearlo con releases fabricados.</summary>
    public static InfoActualizacion? InterpretarRelease(ReleaseGitHub? release, Version versionLocal)
    {
        if (release?.TagName is null || release.Draft || release.Prerelease ||
            !ComparadorVersiones.HayVersionMasNueva(release.TagName, versionLocal))
        {
            return null;
        }

        var instalador = release.Assets?.FirstOrDefault(a =>
            a.Name.EndsWith("-Setup-x64.exe", StringComparison.OrdinalIgnoreCase));
        if (instalador is null)
        {
            return null;
        }

        // Sin hash publicado no hay forma de verificar integridad: no se ofrece.
        var hash = release.Assets?.FirstOrDefault(a =>
            string.Equals(a.Name, instalador.Name + ".sha256", StringComparison.OrdinalIgnoreCase));
        if (hash is null)
        {
            return null;
        }

        return new InfoActualizacion(
            release.TagName,
            new Uri(instalador.BrowserDownloadUrl),
            new Uri(hash.BrowserDownloadUrl),
            instalador.Name,
            release.Body);
    }

    /// <summary>
    /// Descarga el instalador a %TEMP% reportando progreso (0–100) y lo verifica contra el
    /// hash publicado ANTES de devolver la ruta. Si no coincide, borra el archivo y lanza.
    /// </summary>
    public async Task<string> DescargarAsync(InfoActualizacion info, IProgress<int>? progreso, CancellationToken ct)
    {
        var hashEsperado = await http.GetStringAsync(info.UrlHash, ct);
        var destino = Path.Combine(Path.GetTempPath(), info.NombreArchivo);

        using (var respuesta = await http.GetAsync(info.UrlInstalador, HttpCompletionOption.ResponseHeadersRead, ct))
        {
            respuesta.EnsureSuccessStatusCode();
            var total = respuesta.Content.Headers.ContentLength;
            await using var origen = await respuesta.Content.ReadAsStreamAsync(ct);
            await using var archivo = File.Create(destino);

            var buffer = new byte[81920];
            long leidos = 0;
            var ultimo = -1;
            int n;
            while ((n = await origen.ReadAsync(buffer, ct)) > 0)
            {
                await archivo.WriteAsync(buffer.AsMemory(0, n), ct);
                leidos += n;
                if (total is > 0)
                {
                    var pct = (int)(leidos * 100 / total.Value);
                    if (pct != ultimo)
                    {
                        ultimo = pct;
                        progreso?.Report(pct);
                    }
                }
            }
        }

        bool valido;
        await using (var lectura = File.OpenRead(destino))
        {
            valido = VerificadorHash.Coincide(lectura, hashEsperado);
        }

        if (!valido)
        {
            File.Delete(destino);
            throw new InvalidOperationException("El instalador descargado no coincide con el hash publicado: puede estar incompleto o alterado.");
        }

        return destino;
    }
}

public sealed record ReleaseGitHub(
    [property: JsonPropertyName("tag_name")] string? TagName,
    [property: JsonPropertyName("body")] string? Body,
    [property: JsonPropertyName("draft")] bool Draft,
    [property: JsonPropertyName("prerelease")] bool Prerelease,
    [property: JsonPropertyName("assets")] List<AssetGitHub>? Assets);

public sealed record AssetGitHub(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("browser_download_url")] string BrowserDownloadUrl);
