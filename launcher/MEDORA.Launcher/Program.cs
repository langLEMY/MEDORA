using System.Diagnostics;
using System.Runtime.InteropServices;

namespace MEDORA.Launcher;

internal static class Program
{
    public static readonly string CarpetaDatos = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MEDORA");

    // Hilo STA de punta a punta: WebView2 inicializa su propio apartamento COM y choca
    // (RPC_E_CHANGED_MODE) si el hilo no fue STA desde el arranque. Por eso Main es síncrono.
    [STAThread]
    private static void Main()
    {
        using var instancia = new Mutex(initiallyOwned: true, "MEDORA.Launcher.InstanciaUnica", out var esPrimera);
        if (!esPrimera)
        {
            TraerAlFrente();
            return;
        }

        Directory.CreateDirectory(CarpetaDatos);
        MatarWebView2Huerfanos();

        ApplicationConfiguration.Initialize();
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        Application.ThreadException += (_, e) => RegistrarCrash(e.Exception);
        AppDomain.CurrentDomain.UnhandledException += (_, e) => RegistrarCrash(e.ExceptionObject as Exception);
        Application.Run(new FormPrincipal());
    }

    private static void RegistrarCrash(Exception? ex)
    {
        var mensaje = ex?.ToString() ?? "Excepción desconocida.";
        try
        {
            var logs = Path.Combine(CarpetaDatos, "logs");
            Directory.CreateDirectory(logs);
            File.AppendAllText(Path.Combine(logs, "crash.log"), $"{DateTimeOffset.Now:O}\n{mensaje}\n\n");
        }
        catch
        {
            // Si ni el log se puede escribir, igual se muestra el aviso.
        }

        MessageBox.Show("MEDORA encontró un error inesperado:\n\n" + ex?.Message, "MEDORA", MessageBoxButtons.OK, MessageBoxIcon.Error);
    }

    /// <summary>Si ya hay una ventana de MEDORA abierta, la trae al frente en vez de abrir otra.</summary>
    private static void TraerAlFrente()
    {
        var actual = Process.GetCurrentProcess();
        foreach (var p in Process.GetProcessesByName(actual.ProcessName))
        {
            if (p.Id != actual.Id && p.MainWindowHandle != IntPtr.Zero)
            {
                ShowWindow(p.MainWindowHandle, 9 /* SW_RESTORE */);
                SetForegroundWindow(p.MainWindowHandle);
                return;
            }
        }
    }

    /// <summary>
    /// Mismo arreglo que FUNBIDE: si MEDORA se cerró de forma abrupta, procesos
    /// msedgewebview2.exe de su perfil pueden quedar huérfanos y el siguiente arranque
    /// hereda un renderizado roto (pantalla negra). Solo se tocan procesos cuya línea de
    /// comandos referencia el perfil de MEDORA — nunca Edge/Teams/otras apps.
    /// </summary>
    private static void MatarWebView2Huerfanos()
    {
        // Tramo corto y estable: Windows puede reportar rutas en formato 8.3 ("RAYFER~1").
        var marca = Path.Combine("MEDORA", "WebView2");
        try
        {
            using var buscador = new System.Management.ManagementObjectSearcher(
                "SELECT ProcessId, CommandLine FROM Win32_Process WHERE Name = 'msedgewebview2.exe'");
            using var resultados = buscador.Get();
            foreach (var objeto in resultados)
            {
                using var proceso = objeto;
                if (proceso["CommandLine"] is string linea && linea.Contains(marca, StringComparison.OrdinalIgnoreCase))
                {
                    try
                    {
                        Process.GetProcessById((int)(uint)proceso["ProcessId"]).Kill(entireProcessTree: true);
                    }
                    catch
                    {
                        // Ya terminó entre la consulta y aquí.
                    }
                }
            }
        }
        catch
        {
            // WMI deshabilitado u otra rareza: solo se pierde la limpieza preventiva.
        }
    }

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
