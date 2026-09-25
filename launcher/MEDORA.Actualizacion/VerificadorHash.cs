using System.Security.Cryptography;

namespace MEDORA.Actualizacion;

public static class VerificadorHash
{
    /// <summary>
    /// Compara el SHA256 del archivo contra el hash publicado. Acepta mayúsculas/minúsculas y
    /// el formato de sha256sum ("hash  nombre-del-archivo"): solo se usa el primer token.
    /// </summary>
    public static bool Coincide(Stream contenido, string hashEsperado)
    {
        var hashCalculado = Convert.ToHexString(SHA256.HashData(contenido));
        return string.Equals(hashCalculado, PrimerToken(hashEsperado), StringComparison.OrdinalIgnoreCase);
    }

    public static bool Coincide(byte[] contenido, string hashEsperado)
    {
        using var ms = new MemoryStream(contenido, writable: false);
        return Coincide(ms, hashEsperado);
    }

    private static string PrimerToken(string texto) =>
        texto.Trim().Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? string.Empty;
}
