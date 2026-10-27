using System.Runtime.InteropServices;
using System.Security.Cryptography.X509Certificates;

namespace MEDORA.Launcher;

/// <summary>
/// Verificación Authenticode del instalador descargado (además del SHA256).
///
/// El hash vive en la misma release que el .exe: quien pudiera cambiar uno cambiaría
/// el otro. La firma no: exige el certificado de MEDORA. Regla de transición:
/// si este MEDORA.exe está firmado, la actualización debe venir firmada por el mismo
/// titular; si todavía no lo está (versiones anteriores a la firma), basta el hash.
/// </summary>
internal static class FirmaCodigo
{
    /// <summary>Lanza si el instalador no cumple la firma que exige el launcher actual.</summary>
    public static void ExigirMismaFirma(string instalador)
    {
        var propio = Environment.ProcessPath;
        if (propio is null || Titular(propio) is not { } titularPropio)
        {
            return;
        }

        if (!FirmaValida(instalador))
        {
            throw new InvalidOperationException("el instalador descargado no tiene una firma digital válida.");
        }

        var titular = Titular(instalador);
        if (!string.Equals(titular, titularPropio, StringComparison.Ordinal))
        {
            throw new InvalidOperationException($"el instalador está firmado por otro titular ({titular ?? "desconocido"}).");
        }
    }

    /// <summary>Titular (Subject) del certificado si el archivo tiene una firma válida; si no, null.</summary>
    private static string? Titular(string ruta)
    {
        if (!FirmaValida(ruta))
        {
            return null;
        }

        try
        {
#pragma warning disable SYSLIB0057 // CreateFromSignedFile es la única forma de leer el firmante de un PE.
            using var cert = X509Certificate.CreateFromSignedFile(ruta);
#pragma warning restore SYSLIB0057
            return cert.Subject;
        }
        catch (Exception)
        {
            return null;
        }
    }

    private static bool FirmaValida(string ruta)
    {
        var archivo = new WinTrustFileInfo(ruta);
        var datos = new WinTrustData(archivo);
        try
        {
            var accion = WintrustActionGenericVerifyV2;
            return WinVerifyTrust(IntPtr.Zero, ref accion, datos) == 0;
        }
        finally
        {
            datos.Liberar();
            archivo.Liberar();
        }
    }

    private static Guid WintrustActionGenericVerifyV2 = new("00AAC56B-CD44-11d0-8CC2-00C04FC295EE");

    [DllImport("wintrust.dll", ExactSpelling = true, SetLastError = false, CharSet = CharSet.Unicode)]
    private static extern uint WinVerifyTrust(IntPtr hwnd, ref Guid accion, WinTrustData datos);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private sealed class WinTrustFileInfo
    {
        private readonly uint cbStruct = (uint)Marshal.SizeOf<WinTrustFileInfo>();
        private IntPtr pcwszFilePath;
        private readonly IntPtr hFile = IntPtr.Zero;
        private readonly IntPtr pgKnownSubject = IntPtr.Zero;

        public WinTrustFileInfo(string ruta) => pcwszFilePath = Marshal.StringToCoTaskMemUni(ruta);

        public void Liberar()
        {
            if (pcwszFilePath != IntPtr.Zero)
            {
                Marshal.FreeCoTaskMem(pcwszFilePath);
                pcwszFilePath = IntPtr.Zero;
            }
        }
    }

    [StructLayout(LayoutKind.Sequential)]
    private sealed class WinTrustData
    {
        private readonly uint cbStruct = (uint)Marshal.SizeOf<WinTrustData>();
        private readonly IntPtr pPolicyCallbackData = IntPtr.Zero;
        private readonly IntPtr pSIPClientData = IntPtr.Zero;
        private readonly uint dwUIChoice = 2;            // WTD_UI_NONE
        private readonly uint fdwRevocationChecks = 0;   // WTD_REVOKE_NONE (sin red: no bloquear por CRL)
        private readonly uint dwUnionChoice = 1;         // WTD_CHOICE_FILE
        private IntPtr pFile;
        private readonly uint dwStateAction = 0;
        private readonly IntPtr hWVTStateData = IntPtr.Zero;
        private readonly IntPtr pwszURLReference = IntPtr.Zero;
        private readonly uint dwProvFlags = 0x00000040;  // WTD_CACHE_ONLY_URL_RETRIEVAL
        private readonly uint dwUIContext = 0;
        private readonly IntPtr pSignatureSettings = IntPtr.Zero;

        public WinTrustData(WinTrustFileInfo archivo)
        {
            pFile = Marshal.AllocCoTaskMem(Marshal.SizeOf<WinTrustFileInfo>());
            Marshal.StructureToPtr(archivo, pFile, false);
        }

        public void Liberar()
        {
            if (pFile != IntPtr.Zero)
            {
                Marshal.FreeCoTaskMem(pFile);
                pFile = IntPtr.Zero;
            }
        }
    }
}
