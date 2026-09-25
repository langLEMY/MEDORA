; Instalador de MEDORA (Windows, por usuario, sin permisos de administrador).
;
; Único método de instalación de MEDORA. No lo compiles a mano: usa
;   pwsh scripts/generar-instalador.ps1
; (o deja que lo haga el workflow .github/workflows/release.yml al publicar un tag),
; que primero arma dist\ (launcher publicado + app\ con la SPA compilada).
;
; Actualizaciones: el launcher descarga el instalador de la release más nueva, verifica
; su SHA256 y lo ejecuta con /SILENT; el mismo AppId hace que se instale encima.

#define MyAppName "MEDORA"
#define MyAppVersion Trim(FileRead(FileOpen("..\version.txt")))
#define MyAppPublisher "MEDORA"
#define MyAppExeName "MEDORA.exe"
#define SourceDir "..\dist"

[Setup]
AppId={{B3E1C7A2-5D4F-4E8B-9A61-2F7C0D9E4A15}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppComments=Sistema de gestión hospitalaria
DefaultDirName={localappdata}\Programs\MEDORA
DefaultGroupName=MEDORA
DisableProgramGroupPage=yes
DisableDirPage=yes
OutputBaseFilename=MEDORA-{#MyAppVersion}-Setup-x64
OutputDir=Output
SetupIconFile=..\launcher\MEDORA.Launcher\medora.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName=MEDORA
Compression=lzma2/ultra64
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=lowest
WizardStyle=modern
; Cierra MEDORA si está abierto (Restart Manager) para poder reemplazar archivos.
CloseApplications=force
RestartApplications=no
VersionInfoVersion={#MyAppVersion}

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "desktopicon"; Description: "Crear un acceso directo en el Escritorio"; GroupDescription: "Accesos directos:"; Flags: checkedonce

[InstallDelete]
; La SPA cambia de nombres de archivo en cada build (hash): se limpia la versión anterior.
Type: filesandordirs; Name: "{app}\app"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\MEDORA"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\Desinstalar MEDORA"; Filename: "{uninstallexe}"
Name: "{userdesktop}\MEDORA"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Abrir MEDORA"; Flags: nowait postinstall skipifsilent
; Actualización automática (/SILENT): vuelve a abrir MEDORA al terminar.
Filename: "{app}\{#MyAppExeName}"; Flags: nowait; Check: WizardSilent

[UninstallDelete]
Type: filesandordirs; Name: "{localappdata}\MEDORA"

[Code]
const
  WebView2Guid = '{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}';

function WebView2Instalado(): Boolean;
var
  Version: String;
begin
  Result :=
    (RegQueryStringValue(HKLM64, 'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\' + WebView2Guid, 'pv', Version) and (Version <> '') and (Version <> '0.0.0.0')) or
    (RegQueryStringValue(HKLM64, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\' + WebView2Guid, 'pv', Version) and (Version <> '') and (Version <> '0.0.0.0')) or
    (RegQueryStringValue(HKCU, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\' + WebView2Guid, 'pv', Version) and (Version <> '') and (Version <> '0.0.0.0'));
end;

// Windows 11 trae WebView2; en Windows 10 puede faltar. Se instala solo, por usuario.
procedure CurStepChanged(CurStep: TSetupStep);
var
  Codigo: Integer;
begin
  if (CurStep = ssPostInstall) and not WebView2Instalado() then
  begin
    try
      DownloadTemporaryFile('https://go.microsoft.com/fwlink/p/?LinkId=2124703', 'MicrosoftEdgeWebview2Setup.exe', '', nil);
      Exec(ExpandConstant('{tmp}\MicrosoftEdgeWebview2Setup.exe'), '/silent /install', '', SW_HIDE, ewWaitUntilTerminated, Codigo);
    except
      if not WizardSilent() then
        MsgBox('MEDORA necesita "Microsoft Edge WebView2 Runtime" y no se pudo instalar automáticamente.' + #13#10 +
               'Descárgalo desde https://go.microsoft.com/fwlink/p/?LinkId=2124703', mbInformation, MB_OK);
    end;
  end;
end;
