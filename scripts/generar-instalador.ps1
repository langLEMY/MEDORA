<#
.SYNOPSIS
    Genera el instalador de MEDORA: instalacion\Output\MEDORA-X.Y.Z-Setup-x64.exe (+ .sha256).

.DESCRIPTION
    1. Compila la app (React) → app\dist
    2. Publica el launcher (self-contained, single-file) → dist\
    3. Copia app\dist → dist\app
    4. Compila instalacion\MEDORA.iss con Inno Setup
    5. Genera el SHA256 del .exe (el auto-update lo verifica antes de ejecutar nada)

    El instalador no contiene ningún secreto: solo la URL y la clave publicable de
    Supabase (públicas por diseño). La seguridad la aplica el RLS de Postgres.

    Normalmente esto lo corre .github/workflows/release.yml al publicar un tag vX.Y.Z.

.EXAMPLE
    pwsh scripts/generar-instalador.ps1
#>
$ErrorActionPreference = "Stop"

function Paso([string]$Descripcion, [scriptblock]$Accion) {
    Write-Host "==> $Descripcion" -ForegroundColor Cyan
    & $Accion
    if ($LASTEXITCODE -ne 0) { throw "Falló: $Descripcion (código $LASTEXITCODE)" }
}

$raiz = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$version = (Get-Content (Join-Path $raiz "version.txt") -Raw).Trim()
$dist = Join-Path $raiz "dist"

if (Test-Path $dist) { Remove-Item -Recurse -Force $dist }

Push-Location (Join-Path $raiz "app")
try {
    Paso "Instalando dependencias de la app" { npm ci --no-audit --no-fund }
    Paso "Compilando la app" { npm run build }
} finally { Pop-Location }

Paso "Publicando el launcher $version" {
    dotnet publish (Join-Path $raiz "launcher\MEDORA.Launcher\MEDORA.Launcher.csproj") -c Release -o $dist -p:DebugType=none
}

Copy-Item -Recurse (Join-Path $raiz "app\dist") (Join-Path $dist "app")

$candidatos = @(
    (Join-Path $env:LOCALAPPDATA "Programs\Inno Setup 6\ISCC.exe"),
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
)
$iscc = $candidatos | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) { throw "No se encontró Inno Setup 6. Instálalo con: winget install JRSoftware.InnoSetup" }

Paso "Compilando el instalador" { & $iscc /Q (Join-Path $raiz "instalacion\MEDORA.iss") }

$exe = Join-Path $raiz "instalacion\Output\MEDORA-$version-Setup-x64.exe"
if (-not (Test-Path $exe)) { throw "No se encontró $exe" }

$hash = (Get-FileHash -Path $exe -Algorithm SHA256).Hash
Set-Content -Path "$exe.sha256" -Value "$hash  $(Split-Path $exe -Leaf)" -Encoding ascii -NoNewline

Write-Host ""
Write-Host "Instalador listo:" -ForegroundColor Green
Write-Host "  $exe"
Write-Host "  $exe.sha256"
