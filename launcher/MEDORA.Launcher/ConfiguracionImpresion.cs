using System.Drawing.Printing;
using System.Text.Json;

namespace MEDORA.Launcher;

/// <summary>
/// Impresoras de este equipo, elegidas desde MEDORA (Mi perfil → Impresión):
/// la de recibos y documentos, la de tickets del quiosco y si se imprime sin
/// preguntar. Se guarda en %LocalAppData%\MEDORA\impresion.json.
/// </summary>
public sealed class ConfiguracionImpresion
{
    private static readonly string Ruta = Path.Combine(Program.CarpetaDatos, "impresion.json");

    public string? Recibos { get; set; }
    public string? Tickets { get; set; }
    public bool Preguntar { get; set; } = true;

    public static ConfiguracionImpresion Cargar()
    {
        try
        {
            if (File.Exists(Ruta))
            {
                return JsonSerializer.Deserialize<ConfiguracionImpresion>(File.ReadAllText(Ruta)) ?? new ConfiguracionImpresion();
            }
        }
        catch
        {
            // Archivo dañado: se vuelve a lo predeterminado.
        }

        return new ConfiguracionImpresion();
    }

    public void Guardar()
    {
        try
        {
            File.WriteAllText(Ruta, JsonSerializer.Serialize(this));
        }
        catch
        {
            // No crítico: la próxima vez se preguntará de nuevo.
        }
    }

    public static string[] Instaladas() => PrinterSettings.InstalledPrinters.Cast<string>().ToArray();

    public static string Predeterminada() => new PrinterSettings().PrinterName;

    /// <summary>La impresora indicada si sigue instalada; si no, null.</summary>
    public static string? SiExiste(string? nombre) =>
        !string.IsNullOrWhiteSpace(nombre) && Instaladas().Contains(nombre) ? nombre : null;
}
