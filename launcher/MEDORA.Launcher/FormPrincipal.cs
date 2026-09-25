using System.Diagnostics;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text.Json;
using MEDORA.Actualizacion;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using Microsoft.Win32;

namespace MEDORA.Launcher;

/// <summary>
/// Ventana nativa que hospeda la app (React, empaquetada junto al .exe en .\app) en un
/// WebView2. A diferencia de FUNBIDE no hay API local ni base de datos en la PC: la app
/// habla directo con Supabase y el RLS de Postgres hace cumplir los permisos, así que el
/// instalador no lleva ninguna contraseña ni clave privada.
///
/// Puente app ↔ launcher (JSON por postMessage), ver app/src/lib/escritorio.ts.
/// </summary>
public sealed class FormPrincipal : Form
{
    private const string Host = "app.medora.local";
    private static readonly TimeSpan IntervaloChequeo = TimeSpan.FromHours(4);

    private readonly WebView2 _webView = new() { Dock = DockStyle.Fill };
    private readonly ServicioActualizacion _actualizacion = new(new HttpClient { Timeout = TimeSpan.FromMinutes(10) });
    private readonly System.Windows.Forms.Timer _temporizador = new() { Interval = (int)IntervaloChequeo.TotalMilliseconds };
    private readonly Version _version = Assembly.GetExecutingAssembly().GetName().Version ?? new Version(0, 0, 0);
    private readonly string? _urlDesarrollo = Environment.GetEnvironmentVariable("MEDORA_URL");
    private InfoActualizacion? _pendiente;
    private bool _instalando;

    public FormPrincipal()
    {
        Text = "MEDORA";
        Width = 1440;
        Height = 900;
        MinimumSize = new Size(1100, 700);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = TemaOscuro() ? Color.FromArgb(11, 13, 18) : Color.FromArgb(246, 247, 249);

        var icono = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        if (icono is not null)
        {
            Icon = icono;
        }

        // Maximizar en Shown (no al nacer): WebView2 a veces crea su controller con bounds de
        // un frame intermedio y queda pintando negro si la ventana ya nace maximizada.
        Shown += (_, _) => WindowState = FormWindowState.Maximized;
        HandleCreated += (_, _) => AplicarBarraTitulo();
        SystemEvents.UserPreferenceChanged += (_, _) => AplicarBarraTitulo();

        Controls.Add(_webView);
        Load += async (_, _) => await IniciarAsync();

        _temporizador.Tick += async (_, _) => await BuscarActualizacionAsync(manual: false);
    }

    private async Task IniciarAsync()
    {
        try
        {
            var opciones = new CoreWebView2EnvironmentOptions
            {
                // Sin esto, en VMs/escritorios remotos con GPU floja WebView2 pinta negro en
                // vez de caer a renderizado por software (hallazgo de FUNBIDE).
                AdditionalBrowserArguments = "--disable-gpu",
            };
            var entorno = await CoreWebView2Environment.CreateAsync(null, Path.Combine(Program.CarpetaDatos, "WebView2"), opciones);
            _webView.DefaultBackgroundColor = BackColor;
            await _webView.EnsureCoreWebView2Async(entorno);

            var core = _webView.CoreWebView2;
            var devtools = Environment.GetEnvironmentVariable("MEDORA_DEVTOOLS") == "1";
            core.Settings.AreDevToolsEnabled = devtools;
            core.Settings.AreBrowserAcceleratorKeysEnabled = devtools;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.IsZoomControlEnabled = false;
            // PCs compartidas en hospitales: nunca ofrecer guardar contraseñas.
            core.Settings.IsPasswordAutosaveEnabled = false;
            core.Settings.IsGeneralAutofillEnabled = false;

            // Menú contextual mínimo: solo edición de texto (sin "Inspeccionar", "Atrás", etc.).
            core.ContextMenuRequested += (_, e) =>
            {
                var permitidos = new HashSet<string> { "cut", "copy", "paste", "selectAll" };
                foreach (var item in e.MenuItems.ToList())
                {
                    if (!permitidos.Contains(item.Name))
                    {
                        e.MenuItems.Remove(item);
                    }
                }
            };

            // Enlaces externos → navegador del sistema; la ventana solo muestra MEDORA.
            core.NewWindowRequested += (_, e) =>
            {
                e.Handled = true;
                AbrirEnNavegador(e.Uri);
            };
            core.NavigationStarting += (_, e) =>
            {
                if (!EsPropia(e.Uri))
                {
                    e.Cancel = true;
                    AbrirEnNavegador(e.Uri);
                }
            };

            core.WebMessageReceived += async (_, e) => await ProcesarMensajeAsync(e);
            core.NavigationCompleted += (_, e) =>
            {
                if (!e.IsSuccess)
                {
                    return;
                }

                Enviar(new { tipo = "info", version = _version.ToString(3) });
                if (_pendiente is not null)
                {
                    EnviarActualizacion(_pendiente);
                }
            };

            if (_urlDesarrollo is not null)
            {
                core.Navigate(_urlDesarrollo);
            }
            else
            {
                var carpetaApp = Path.Combine(AppContext.BaseDirectory, "app");
                if (!File.Exists(Path.Combine(carpetaApp, "index.html")))
                {
                    MessageBox.Show("La instalación de MEDORA está incompleta (falta la carpeta app). Reinstala MEDORA.", "MEDORA",
                        MessageBoxButtons.OK, MessageBoxIcon.Error);
                    Close();
                    return;
                }

                core.SetVirtualHostNameToFolderMapping(Host, carpetaApp, CoreWebView2HostResourceAccessKind.Deny);
                core.Navigate($"https://{Host}/index.html");
            }

            // El chequeo de actualizaciones nunca demora el arranque: corre en segundo plano.
            _ = Task.Delay(TimeSpan.FromSeconds(4)).ContinueWith(_ => BeginInvoke(async () => await BuscarActualizacionAsync(manual: false)));
            _temporizador.Start();
        }
        catch (WebView2RuntimeNotFoundException)
        {
            MessageBox.Show(
                "Falta \"Microsoft Edge WebView2 Runtime\", necesario para mostrar MEDORA.\n\n" +
                "Windows 11 lo trae de fábrica. Si no está, instálalo desde https://go.microsoft.com/fwlink/p/?LinkId=2124703 y vuelve a abrir MEDORA.",
                "MEDORA", MessageBoxButtons.OK, MessageBoxIcon.Error);
            Close();
        }
        catch (Exception ex)
        {
            MessageBox.Show("MEDORA no pudo iniciar la vista:\n\n" + ex.Message, "MEDORA", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private bool EsPropia(string uri) =>
        Uri.TryCreate(uri, UriKind.Absolute, out var u) &&
        (u.Host.Equals(Host, StringComparison.OrdinalIgnoreCase) ||
         (_urlDesarrollo is not null && uri.StartsWith(_urlDesarrollo, StringComparison.OrdinalIgnoreCase)));

    private static void AbrirEnNavegador(string uri)
    {
        if (Uri.TryCreate(uri, UriKind.Absolute, out var u) && (u.Scheme == Uri.UriSchemeHttps || u.Scheme == Uri.UriSchemeHttp || u.Scheme == "mailto"))
        {
            Process.Start(new ProcessStartInfo(uri) { UseShellExecute = true });
        }
    }

    private async Task ProcesarMensajeAsync(CoreWebView2WebMessageReceivedEventArgs e)
    {
        string? tipo;
        string? nombre = null;
        try
        {
            using var doc = JsonDocument.Parse(e.TryGetWebMessageAsString());
            tipo = doc.RootElement.GetProperty("tipo").GetString();
            if (doc.RootElement.TryGetProperty("nombre", out var n))
            {
                nombre = n.GetString();
            }
        }
        catch
        {
            return;
        }

        switch (tipo)
        {
            case "info":
                Enviar(new { tipo = "info", version = _version.ToString(3) });
                break;
            case "buscar-actualizacion":
                await BuscarActualizacionAsync(manual: true);
                break;
            case "instalar-actualizacion":
                await InstalarAsync();
                break;
            case "imprimir":
                await ImprimirAsync();
                break;
            case "pdf":
                await ExportarPdfAsync(nombre);
                break;
        }
    }

    private async Task BuscarActualizacionAsync(bool manual)
    {
        if (_instalando)
        {
            return;
        }

        using var cancelacion = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        var info = await _actualizacion.BuscarAsync(_version, cancelacion.Token);
        if (info is not null)
        {
            _pendiente = info;
            EnviarActualizacion(info);
        }
        else if (manual)
        {
            Enviar(new { tipo = "sin-actualizacion" });
        }
    }

    private void EnviarActualizacion(InfoActualizacion info) =>
        Enviar(new { tipo = "actualizacion", version = info.VersionTag.TrimStart('v', 'V'), notas = info.Notas });

    /// <summary>
    /// Descarga con progreso, verifica SHA256 y ejecuta el instalador en modo silencioso:
    /// instala por usuario (sin UAC) y vuelve a abrir MEDORA solo al terminar.
    /// </summary>
    private async Task InstalarAsync()
    {
        if (_pendiente is null || _instalando)
        {
            return;
        }

        _instalando = true;
        try
        {
            var progreso = new Progress<int>(p => Enviar(new { tipo = "progreso", porcentaje = p }));
            using var cancelacion = new CancellationTokenSource(TimeSpan.FromMinutes(10));
            var ruta = await _actualizacion.DescargarAsync(_pendiente, progreso, cancelacion.Token);

            Process.Start(new ProcessStartInfo
            {
                FileName = ruta,
                Arguments = "/SILENT /SUPPRESSMSGBOXES /NORESTART /CLOSEAPPLICATIONS",
                UseShellExecute = true,
            });
            Application.Exit();
        }
        catch (Exception ex)
        {
            _instalando = false;
            Enviar(new { tipo = "error-actualizacion", mensaje = "No se pudo actualizar: " + ex.Message });
        }
    }

    /// <summary>Imprime la vista actual (recibos) preguntando antes a qué impresora.</summary>
    private async Task ImprimirAsync()
    {
        using var selector = new FormSeleccionarImpresora();
        if (selector.ShowDialog(this) != DialogResult.OK || selector.ImpresoraSeleccionada is null)
        {
            return;
        }

        try
        {
            var config = _webView.CoreWebView2.Environment.CreatePrintSettings();
            config.ShouldPrintBackgrounds = true;
            config.ShouldPrintHeaderAndFooter = false;
            config.PrinterName = selector.ImpresoraSeleccionada;
            config.MarginTop = config.MarginBottom = config.MarginLeft = config.MarginRight = 0.08;

            var resultado = await _webView.CoreWebView2.PrintAsync(config);
            if (resultado != CoreWebView2PrintStatus.Succeeded)
            {
                MessageBox.Show($"No se pudo imprimir ({resultado}). Revisa que la impresora esté encendida y conectada.",
                    "MEDORA", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show($"No se pudo imprimir: {ex.Message}", "MEDORA", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    /// <summary>
    /// Guarda el documento abierto (factura, estado de cuenta, reporte…) como PDF. La app
    /// ya dejó en .area-impresion solo el documento, así que se imprime únicamente eso.
    /// </summary>
    private async Task ExportarPdfAsync(string? nombre)
    {
        var sugerido = string.Concat((string.IsNullOrWhiteSpace(nombre) ? "MEDORA" : nombre).Split(Path.GetInvalidFileNameChars()));
        using var dialogo = new SaveFileDialog
        {
            Title = "Guardar como PDF",
            Filter = "Documento PDF (*.pdf)|*.pdf",
            FileName = sugerido + ".pdf",
            InitialDirectory = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
            AddExtension = true,
            OverwritePrompt = true,
        };
        if (dialogo.ShowDialog(this) != DialogResult.OK)
        {
            return;
        }

        try
        {
            var config = _webView.CoreWebView2.Environment.CreatePrintSettings();
            config.ShouldPrintBackgrounds = true;
            config.ShouldPrintHeaderAndFooter = false;
            config.MarginTop = config.MarginBottom = 0.4;
            config.MarginLeft = config.MarginRight = 0.4;

            var ok = await _webView.CoreWebView2.PrintToPdfAsync(dialogo.FileName, config);
            if (!ok)
            {
                MessageBox.Show("No se pudo generar el PDF.", "MEDORA", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            Process.Start(new ProcessStartInfo(dialogo.FileName) { UseShellExecute = true });
        }
        catch (Exception ex)
        {
            MessageBox.Show($"No se pudo generar el PDF: {ex.Message}", "MEDORA", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private void Enviar(object mensaje)
    {
        if (_webView.CoreWebView2 is null)
        {
            return;
        }

        var json = JsonSerializer.Serialize(mensaje);
        if (InvokeRequired)
        {
            BeginInvoke(() => _webView.CoreWebView2.PostWebMessageAsString(json));
        }
        else
        {
            _webView.CoreWebView2.PostWebMessageAsString(json);
        }
    }

    // --- Barra de título oscura/clara según el tema de Windows -------------------------

    private static bool TemaOscuro()
    {
        try
        {
            using var clave = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize");
            return clave?.GetValue("AppsUseLightTheme") is int v && v == 0;
        }
        catch
        {
            return false;
        }
    }

    private void AplicarBarraTitulo()
    {
        if (!IsHandleCreated)
        {
            return;
        }

        var oscuro = TemaOscuro() ? 1 : 0;
        _ = DwmSetWindowAttribute(Handle, 20 /* DWMWA_USE_IMMERSIVE_DARK_MODE */, ref oscuro, sizeof(int));
    }

    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int valor, int tamano);

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _temporizador.Dispose();
            _webView.Dispose();
        }

        base.Dispose(disposing);
    }
}
