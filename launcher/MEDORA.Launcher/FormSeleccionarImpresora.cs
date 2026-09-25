using System.Drawing.Printing;

namespace MEDORA.Launcher;

/// <summary>
/// Diálogo para elegir la impresora (p. ej. la térmica de recibos vs. la de documentos).
/// Recuerda la última elegida en %LocalAppData%\MEDORA\ultima-impresora.txt.
/// </summary>
public sealed class FormSeleccionarImpresora : Form
{
    private static readonly string RutaPreferencia = Path.Combine(Program.CarpetaDatos, "ultima-impresora.txt");

    private readonly ComboBox _combo = new() { DropDownStyle = ComboBoxStyle.DropDownList };

    public string? ImpresoraSeleccionada { get; private set; }

    public FormSeleccionarImpresora()
    {
        FormBorderStyle = FormBorderStyle.FixedDialog;
        StartPosition = FormStartPosition.CenterParent;
        ShowInTaskbar = false;
        MaximizeBox = false;
        MinimizeBox = false;
        Text = "MEDORA · Imprimir";
        Font = new Font("Segoe UI", 9.75f);
        AutoScaleMode = AutoScaleMode.Dpi;
        ClientSize = new Size(400, 140);

        var etiqueta = new Label { Text = "¿En qué impresora imprimimos?", AutoSize = true, Location = new Point(20, 18) };
        _combo.SetBounds(20, 46, 360, 28);
        foreach (var nombre in PrinterSettings.InstalledPrinters)
        {
            _combo.Items.Add(nombre);
        }

        var ultima = LeerUltima();
        var preseleccion = ultima is not null && _combo.Items.Contains(ultima) ? ultima : new PrinterSettings().PrinterName;
        if (_combo.Items.Contains(preseleccion))
        {
            _combo.SelectedItem = preseleccion;
        }
        else if (_combo.Items.Count > 0)
        {
            _combo.SelectedIndex = 0;
        }

        var imprimir = new Button { Text = "Imprimir", DialogResult = DialogResult.OK };
        var cancelar = new Button { Text = "Cancelar", DialogResult = DialogResult.Cancel };
        imprimir.SetBounds(200, 92, 86, 30);
        cancelar.SetBounds(294, 92, 86, 30);
        AcceptButton = imprimir;
        CancelButton = cancelar;

        imprimir.Click += (_, _) =>
        {
            ImpresoraSeleccionada = _combo.SelectedItem as string;
            if (ImpresoraSeleccionada is not null)
            {
                try
                {
                    File.WriteAllText(RutaPreferencia, ImpresoraSeleccionada);
                }
                catch
                {
                    // No crítico: la próxima vez no se recordará.
                }
            }
        };

        Controls.AddRange([etiqueta, _combo, imprimir, cancelar]);
    }

    private static string? LeerUltima()
    {
        try
        {
            return File.Exists(RutaPreferencia) ? File.ReadAllText(RutaPreferencia).Trim() : null;
        }
        catch
        {
            return null;
        }
    }
}
