# Base de MEDORA en tu PC (requiere Docker Desktop): aplica todas las migraciones desde cero,
# carga la semilla y corre las mismas baterías que el CI. Nada toca producción.
#   ./scripts/probar-base-local.ps1           → levanta (si hace falta), reinicia y prueba
#   ./scripts/probar-base-local.ps1 -Detener  → apaga los contenedores
param([switch]$Detener)
$ErrorActionPreference = "Stop"
$raiz = Split-Path $PSScriptRoot -Parent
Push-Location $raiz
try {
  if ($Detener) { npx supabase stop; return }
  npx supabase start -x studio,imgproxy,mailpit,edge-runtime,logflare,vector,supavisor,postgres-meta
  npx supabase db reset --local
  npx supabase db query --local --output-format json -f supabase/tests/funcional_roles.sql | Out-File -Encoding utf8 funcional.json
  npx supabase db query --local --output-format json -f supabase/tests/rls_aislamiento.sql | Out-File -Encoding utf8 rls.json
  python scripts/verificar-baterias.py funcional.json rls.json
} finally {
  Remove-Item -ErrorAction SilentlyContinue funcional.json, rls.json
  Pop-Location
}
