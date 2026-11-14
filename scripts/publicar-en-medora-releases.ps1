# Copia la release de MEDORA al repo público del que el launcher lee las actualizaciones
# (langLEMY/medora-releases), verifica el hash del instalador y vuelve a correr la
# verificación del workflow. Usa tu sesión de GitHub de git (la del git push); el token
# no se muestra ni se guarda. Se puede correr dos veces sin duplicar nada.
#
#   powershell -ExecutionPolicy Bypass -File publicar-en-medora-releases.ps1
#   powershell -ExecutionPolicy Bypass -File publicar-en-medora-releases.ps1 -Tag v1.13.0

param([string]$Tag = "v1.12.0")
$ErrorActionPreference = "Stop"
$api = "https://api.github.com/repos/langLEMY"

Write-Host "Leyendo tu sesión de GitHub..." -ForegroundColor Cyan
$cred = "protocol=https`nhost=github.com`n`n" | git credential fill
$tok = (($cred | Where-Object { $_ -like "password=*" }) -replace "^password=", "")
if (-not $tok) { throw "No hay sesión de GitHub guardada en git. Haz un 'git push' en G:\MEDORA y vuelve a intentar." }
$h = @{ Authorization = "Bearer $tok"; "User-Agent" = "medora"; Accept = "application/vnd.github+json" }

$repo = Invoke-RestMethod "$api/medora-releases" -Headers $h
if (-not $repo.permissions.push) { throw "Tu cuenta no puede publicar en medora-releases." }

$origen = Invoke-RestMethod "$api/MEDORA/releases/tags/$Tag" -Headers $h
Write-Host "Release de origen: $($origen.name) con $($origen.assets.Count) archivos" -ForegroundColor Cyan

# 1. Descargar los archivos de la release (repo privado: con tu sesión).
$dir = Join-Path $env:TEMP "medora-$Tag"
New-Item -ItemType Directory -Force $dir | Out-Null
foreach ($a in $origen.assets) {
  $archivo = Join-Path $dir $a.name
  if ((Test-Path $archivo) -and (Get-Item $archivo).Length -eq $a.size) { Write-Host "  ya descargado: $($a.name)"; continue }
  Write-Host "  descargando $($a.name) ($([math]::Round($a.size / 1MB, 1)) MB)..."
  # curl.exe no reenvía la autorización al almacenamiento al que redirige GitHub.
  & curl.exe -sSfL -H "Authorization: Bearer $tok" -H "Accept: application/octet-stream" -o $archivo $a.url
  if ($LASTEXITCODE -ne 0) { throw "No se pudo descargar $($a.name)." }
}

# 2. Verificar que el instalador coincide con su hash antes de publicarlo.
$exe = $origen.assets | Where-Object { $_.name -like "*.exe" } | Select-Object -First 1
$sha = $origen.assets | Where-Object { $_.name -like "*.exe.sha256" } | Select-Object -First 1
if (-not $exe -or -not $sha) { throw "La release no tiene el .exe y su .sha256: el launcher no la ofrecería." }
$esperado = ((Get-Content (Join-Path $dir $sha.name) -Raw).Trim() -split "\s+")[0].ToLower()
$real = (Get-FileHash (Join-Path $dir $exe.name) -Algorithm SHA256).Hash.ToLower()
if ($esperado -ne $real) { throw "El hash del instalador NO coincide. No se publica." }
Write-Host "Hash del instalador verificado." -ForegroundColor Green

# 3. Crear la release en medora-releases (o reutilizarla si ya existe).
try { $dest = Invoke-RestMethod "$api/medora-releases/releases/tags/$Tag" -Headers $h; Write-Host "La release ya existía en medora-releases: se completan los archivos." }
catch {
  $cuerpo = @{ tag_name = $Tag; name = $origen.name; body = $origen.body; draft = $false; prerelease = $false; make_latest = "true" } | ConvertTo-Json
  $dest = Invoke-RestMethod "$api/medora-releases/releases" -Method Post -Headers $h -Body ([Text.Encoding]::UTF8.GetBytes($cuerpo)) -ContentType "application/json; charset=utf-8"
  Write-Host "Release creada en medora-releases." -ForegroundColor Green
}

# 4. Subir los archivos que falten.
$ya = @($dest.assets | ForEach-Object { $_.name })
foreach ($a in $origen.assets) {
  if ($ya -contains $a.name) { Write-Host "  ya estaba: $($a.name)"; continue }
  Write-Host "  subiendo $($a.name)..."
  $url = "https://uploads.github.com/repos/langLEMY/medora-releases/releases/$($dest.id)/assets?name=$([uri]::EscapeDataString($a.name))"
  & curl.exe -sSf -o NUL -X POST -H "Authorization: Bearer $tok" -H "Content-Type: application/octet-stream" --data-binary "@$(Join-Path $dir $a.name)" $url
  if ($LASTEXITCODE -ne 0) { throw "No se pudo subir $($a.name)." }
}

# 5. Comprobar lo que verá el launcher.
$ultima = Invoke-RestMethod "$api/medora-releases/releases/latest" -Headers $h
$nombres = @($ultima.assets | ForEach-Object { $_.name })
if ($ultima.tag_name -ne $Tag -or -not ($nombres -like "*.exe") -or -not ($nombres -like "*.exe.sha256")) {
  throw "medora-releases muestra '$($ultima.tag_name)' como última: revisa en GitHub."
}
Write-Host "OK: el launcher ya ve $Tag con instalador y hash." -ForegroundColor Green

# 6. Volver a correr la verificación del workflow (para que quede en verde).
$sha1 = (git -C G:\MEDORA rev-list -n 1 $Tag).Trim()
$run = (Invoke-RestMethod "$api/MEDORA/actions/runs?head_sha=$sha1" -Headers $h).workflow_runs | Where-Object { $_.name -eq "Release" } | Select-Object -First 1
if ($run) {
  $job = (Invoke-RestMethod $run.jobs_url -Headers $h).jobs | Where-Object { $_.name -eq "verificar-publicacion" } | Select-Object -First 1
  if ($job -and $job.conclusion -ne "success") {
    Invoke-RestMethod "$api/MEDORA/actions/jobs/$($job.id)/rerun" -Method Post -Headers $h | Out-Null
    Write-Host "Verificación relanzada en GitHub Actions." -ForegroundColor Green
  }
}
Remove-Variable tok, h, cred -ErrorAction SilentlyContinue
Write-Host "Listo." -ForegroundColor Green
