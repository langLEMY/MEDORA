namespace MEDORA.Actualizacion;

public static class ComparadorVersiones
{
    /// <summary>
    /// Compara un tag de GitHub Release ("v1.5.0", con o sin "v") contra la versión local.
    /// Un tag que no se puede interpretar se trata como "no hay actualización" en vez de
    /// lanzar: jamás debe impedir que MEDORA arranque.
    /// </summary>
    public static bool HayVersionMasNueva(string tagRemoto, Version versionLocal)
    {
        var texto = tagRemoto.Trim();
        if (texto.Length > 0 && (texto[0] == 'v' || texto[0] == 'V'))
        {
            texto = texto[1..];
        }

        return Version.TryParse(texto, out var versionRemota) && Normalizar(versionRemota) > Normalizar(versionLocal);
    }

    // Version.Parse("1.2.0") tiene Revision = -1 y la versión del ensamblado 1.2.0.0 tiene 0:
    // sin normalizar, "1.2.0" < "1.2.0.0" y se ofrecería "actualizar" a la misma versión.
    private static Version Normalizar(Version v) =>
        new(v.Major, v.Minor, Math.Max(v.Build, 0), Math.Max(v.Revision, 0));
}
