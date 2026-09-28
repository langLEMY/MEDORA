using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace MEDORA.Launcher;

/// <summary>
/// Pantalla de llamados de la sala de espera en el segundo monitor (TV por HDMI) del
/// quiosco. Comparte el entorno WebView2 del quiosco —mismo perfil, misma sesión—, así
/// que no hay que iniciar sesión otra vez. Sin bordes, a pantalla completa en ese monitor.
/// </summary>
internal sealed class FormPantalla : Form
{
    private readonly WebView2 _webView = new() { Dock = DockStyle.Fill };
    private readonly CoreWebView2Environment _entorno;
    private readonly FormPrincipal _principal;

    public FormPantalla(CoreWebView2Environment entorno, Screen pantalla, FormPrincipal principal)
    {
        _entorno = entorno;
        _principal = principal;
        Text = "MEDORA · Sala de espera";
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.Manual;
        Bounds = pantalla.Bounds;
        ShowInTaskbar = false;
        BackColor = Color.FromArgb(11, 13, 18);
        Controls.Add(_webView);
        Load += async (_, _) => await IniciarAsync();
    }

    private async Task IniciarAsync()
    {
        try
        {
            _webView.DefaultBackgroundColor = BackColor;
            await _webView.EnsureCoreWebView2Async(_entorno);
            var core = _webView.CoreWebView2;
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.AreBrowserAcceleratorKeysEnabled = false;
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.IsZoomControlEnabled = false;
            core.NewWindowRequested += (_, e) => e.Handled = true;
            FormPrincipal.PrepararCarpetaApp(core);
            core.Navigate(_principal.UrlApp("#/pantalla"));
        }
        catch
        {
            // Sin la TV el quiosco sigue funcionando.
            Close();
        }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _webView.Dispose();
        }

        base.Dispose(disposing);
    }
}
