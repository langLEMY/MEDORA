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
    private readonly Modo _modo;
    private InfoActualizacion? _pendiente;
    private bool _instalando;
    private bool _salidaPermitida;
    private bool _primerChequeo = true;
    private FormPantalla? _pantallaSala;

    public FormPrincipal(Modo modo = Modo.Normal)
    {
        _modo = modo;
        Text = modo switch { Modo.Quiosco => "MEDORA · Turnos", Modo.Pantalla => "MEDORA · Sala de espera", _ => "MEDORA" };
        Width = 1440;
        Height = 900;
        MinimumSize = modo == Modo.Normal ? new Size(1100, 700) : Size.Empty;
        StartPosition = FormStartPosition.CenterScreen;

        if (modo != Modo.Normal)
        {
            // Pantalla completa sin bordes (cubre también la barra de tareas).
            FormBorderStyle = FormBorderStyle.None;
            StartPosition = FormStartPosition.Manual;
            Bounds = Screen.PrimaryScreen?.Bounds ?? Bounds;
            TopMost = modo == Modo.Quiosco;
        }

        // El quiosco solo se cierra desde la app, con la contraseña de su cuenta
        // (mensaje "salir-quiosco"): Alt+F4 y compañía no hacen nada.
        FormClosing += (_, e) =>
        {
            if (_modo == Modo.Quiosco && !_salidaPermitida && e.CloseReason == CloseReason.UserClosing)
            {
                e.Cancel = true;
            }
        };
        FormClosed += (_, _) => _pantallaSala?.Close();
        BackColor = TemaOscuro() ? Color.FromArgb(11, 13, 18) : Color.FromArgb(233, 236, 240);

        var icono = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        if (icono is not null)
        {
            Icon = icono;
        }

        // Maximizar en Shown (no al nacer): WebView2 a veces crea su controller con bounds de
        // un frame intermedio y queda pintando negro si la ventana ya nace maximizada.
        if (modo == Modo.Normal)
        {
            Shown += (_, _) => WindowState = FormWindowState.Maximized;
        }
        HandleCreated += (_, _) => AplicarBarraTitulo();
        SystemEvents.UserPreferenceChanged += (_, _) => AplicarBarraTitulo();

        Controls.Add(_webView);
        Load += async (_, _) => await IniciarAsync();

        // En quiosco/TV se revisa cada hora para caer en la ventana nocturna de instalación.
        if (modo != Modo.Normal)
        {
            _temporizador.Interval = (int)TimeSpan.FromHours(1).TotalMilliseconds;
        }

        _temporizador.Tick += async (_, _) => await BuscarActualizacionAsync(manual: false);
    }

    private async Task IniciarAsync()
    {
        try
        {
            var opciones = new CoreWebView2EnvironmentOptions
            {
                // --disable-gpu: en VMs/escritorios remotos con GPU floja WebView2 pinta negro
                // en vez de caer a software (hallazgo de FUNBIDE). Autoplay: la TV de la sala
                // anuncia los turnos con sonido y voz sin que nadie toque la pantalla.
                AdditionalBrowserArguments = "--disable-gpu --autoplay-policy=no-user-gesture-required",
            };
            var entorno = await CoreWebView2Environment.CreateAsync(null, Path.Combine(Program.CarpetaDatos, "WebView2"), opciones);
            _webView.DefaultBackgroundColor = BackColor;
            await _webView.EnsureCoreWebView2Async(entorno);

            var core = _webView.CoreWebView2;
            var devtools = _modo == Modo.Normal && Environment.GetEnvironmentVariable("MEDORA_DEVTOOLS") == "1";
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
                // En el quiosco y la TV, ninguno (ni con toque largo).
                var permitidos = _modo == Modo.Normal ? new HashSet<string> { "cut", "copy", "paste", "selectAll" } : [];
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

            var ruta = _modo switch { Modo.Quiosco => "#/quiosco", Modo.Pantalla => "#/pantalla", _ => "" };
            if (_urlDesarrollo is null && !PrepararCarpetaApp(core))
            {
                MessageBox.Show("La instalación de MEDORA está incompleta (falta la carpeta app). Reinstala MEDORA.", "MEDORA",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
                _salidaPermitida = true;
                Close();
                return;
            }

            core.Navigate(UrlApp(ruta));

            // Quiosco con un segundo monitor (TV por HDMI): la pantalla de llamados va ahí.
            if (_modo == Modo.Quiosco && Screen.AllScreens.FirstOrDefault(s => !s.Primary) is { } tv)
            {
                _pantallaSala = new FormPantalla(entorno, tv, this);
                _pantallaSala.Show();
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

    /// <summary>Sirve .\app en https://app.medora.local (también lo usa la ventana de la TV).</summary>
    internal static bool PrepararCarpetaApp(CoreWebView2 core)
    {
        var carpetaApp = Path.Combine(AppContext.BaseDirectory, "app");
        if (!File.Exists(Path.Combine(carpetaApp, "index.html")))
        {
            return false;
        }

        core.SetVirtualHostNameToFolderMapping(Host, carpetaApp, CoreWebView2HostResourceAccessKind.Deny);
        return true;
    }

    internal string UrlApp(string ruta) => (_urlDesarrollo ?? $"https://{Host}/index.html") + ruta;

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
        JsonElement raiz;
        try
        {
            using var doc = JsonDocument.Parse(e.TryGetWebMessageAsString());
            raiz = doc.RootElement.Clone();
            tipo = raiz.GetProperty("tipo").GetString();
            if (raiz.TryGetProperty("nombre", out var n))
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
            case "imprimir-directo":
                await ImprimirDirectoAsync();
                break;
            case "salir-quiosco":
                _salidaPermitida = true;
                Close();
                break;
            case "pdf":
                await ExportarPdfAsync(nombre);
                break;
            case "impresoras":
                EnviarImpresoras();
                break;
            case "configurar-impresion":
                {
                    var cfg = ConfiguracionImpresion.Cargar();
                    if (raiz.TryGetProperty("recibos", out var rec))
                    {
                        cfg.Recibos = rec.ValueKind == JsonValueKind.String ? rec.GetString() : null;
                    }

                    if (raiz.TryGetProperty("tickets", out var tic))
                    {
                        cfg.Tickets = tic.ValueKind == JsonValueKind.String ? tic.GetString() : null;
                    }

                    if (raiz.TryGetProperty("preguntar", out var pre) && pre.ValueKind is JsonValueKind.True or JsonValueKind.False)
                    {
                        cfg.Preguntar = pre.GetBoolean();
                    }

                    cfg.Guardar();
                    EnviarImpresoras();
                    break;
                }
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

            // El quiosco y la TV no tienen quién apriete "Actualizar": se instalan solos al
            // arrancar el equipo o de noche, cuando nadie está tomando turno.
            var hora = DateTime.Now.Hour;
            if (_modo != Modo.Normal && (_primerChequeo || hora >= 21 || hora < 6))
            {
                await InstalarAsync();
            }
        }
        else if (manual)
        {
            Enviar(_actualizacion.UltimoProblema is { } problema
                ? new { tipo = "error-busqueda", mensaje = problema }
                : new { tipo = "sin-actualizacion" });
        }

        _primerChequeo = false;
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
                Arguments = "/SILENT /SUPPRESSMSGBOXES /NORESTART /CLOSEAPPLICATIONS"
                    + (_modo == Modo.Normal ? "" : $" /MODO=--{_modo.ToString().ToLowerInvariant()}"),
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

    private void EnviarImpresoras()
    {
        var cfg = ConfiguracionImpresion.Cargar();
        Enviar(new
        {
            tipo = "impresoras",
            lista = ConfiguracionImpresion.Instaladas(),
            predeterminada = ConfiguracionImpresion.Predeterminada(),
            recibos = cfg.Recibos,
            tickets = cfg.Tickets,
            preguntar = cfg.Preguntar,
        });
    }

    /// <summary>
    /// Imprime la vista actual (recibos, documentos). Si en MEDORA se eligió una
    /// impresora y "imprimir sin preguntar", va directo; si no, pregunta a cuál.
    /// </summary>
    private async Task ImprimirAsync()
    {
        var preferida = ConfiguracionImpresion.Cargar();
        var impresora = preferida.Preguntar ? null : ConfiguracionImpresion.SiExiste(preferida.Recibos);
        if (impresora is null)
        {
            using var selector = new FormSeleccionarImpresora(ConfiguracionImpresion.SiExiste(preferida.Recibos));
            if (selector.ShowDialog(this) != DialogResult.OK || selector.ImpresoraSeleccionada is null)
            {
                return;
            }

            impresora = selector.ImpresoraSeleccionada;
        }

        try
        {
            var config = _webView.CoreWebView2.Environment.CreatePrintSettings();
            config.ShouldPrintBackgrounds = true;
            config.ShouldPrintHeaderAndFooter = false;
            config.PrinterName = impresora;
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
    /// Ticket del quiosco: a la impresora predeterminada de Windows (la térmica), sin
    /// ningún diálogo. Si falla no se muestra nada al paciente: queda en el log.
    /// </summary>
    private async Task ImprimirDirectoAsync()
    {
        try
        {
            var config = _webView.CoreWebView2.Environment.CreatePrintSettings();
            config.ShouldPrintBackgrounds = true;
            config.ShouldPrintHeaderAndFooter = false;
            config.PrinterName = ConfiguracionImpresion.SiExiste(ConfiguracionImpresion.Cargar().Tickets) ?? ConfiguracionImpresion.Predeterminada();
            config.MarginTop = config.MarginBottom = config.MarginLeft = config.MarginRight = 0.08;
            var resultado = await _webView.CoreWebView2.PrintAsync(config);
            if (resultado != CoreWebView2PrintStatus.Succeeded)
            {
                Registrar($"Impresión del ticket: {resultado} (impresora «{config.PrinterName}»).");
            }
        }
        catch (Exception ex)
        {
            Registrar("Impresión del ticket: " + ex.Message);
        }
    }

    private static void Registrar(string mensaje)
    {
        try
        {
            var logs = Path.Combine(Program.CarpetaDatos, "logs");
            Directory.CreateDirectory(logs);
            File.AppendAllText(Path.Combine(logs, "quiosco.log"), $"{DateTimeOffset.Now:O} {mensaje}\n");
        }
        catch
        {
            // Sin log posible: el quiosco sigue funcionando.
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
