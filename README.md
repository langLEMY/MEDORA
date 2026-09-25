<p align="center"><img src="docs/medora-256.png" width="96" alt="MEDORA" /></p>

<h1 align="center">MEDORA</h1>
<p align="center">Sistema de gestión hospitalaria multi‑sistema · aplicación de escritorio para Windows con actualización automática</p>

---

MEDORA administra **varios sistemas hospitalarios** desde una sola instalación. Cada sistema tiene sus sedes, su personal, sus pacientes y sus finanzas, **aislados a nivel de base de datos**: una persona solo ve los sistemas a los que pertenece, con los permisos de su rol en cada uno.

## Módulos

| Módulo | Qué cubre |
|---|---|
| Inicio | Indicadores del día (pacientes, citas, ingresos, stock bajo) y actividad de 14 días. |
| Recepción | Flujo de pacientes del día (por llegar → sala de espera → consulta → atendidos), en vivo en todas las PCs. |
| Agenda | Vista diaria por médico, citas sin solapes (lo garantiza Postgres). |
| Pacientes | Registro con expediente automático, búsqueda por nombre/cédula/expediente, ficha completa. |
| Historia clínica | Entradas firmadas e **inalterables**; correcciones como adendas. Signos vitales estructurados. |
| Caja | Turnos con arqueo, cobros con cobertura de ARS calculada en el servidor, recibos imprimibles, anulaciones trazables. |
| Inventario | Farmacia e insumos; el stock solo cambia con movimientos (entrada/salida/ajuste). |
| Personal | Alta con contraseña temporal, roles múltiples por sistema, restablecimiento de contraseñas. |
| Servicios y seguros | Catálogo de precios, aseguradoras y tarifario de coberturas. |
| Auditoría | Bitácora automática de cada cambio (antes/después), inalterable, exportable a CSV. |
| Sistema y sedes | Datos del sistema, color de marca (tiñe toda la interfaz), sedes. |
| Sistemas hospitalarios | (Superadmin) Alta y activación de sistemas en la plataforma. |

### Roles (por sistema)

`admin` · `medico` · `enfermeria` · `recepcion` · `caja` · `farmacia` · `auditor` — una persona puede tener varios, y roles distintos en sistemas distintos. El **superadmin** de la plataforma administra sistemas, personal y configuración, pero **no ve datos clínicos ni financieros** de un sistema salvo que tenga membresía explícita en él.

## Arquitectura

```
┌────────────────────── PC con Windows ──────────────────────┐
│ MEDORA.exe (WinForms + WebView2)                            │
│   ├─ sirve .\app (React) en https://app.medora.local        │
│   ├─ auto‑update: GitHub Releases + SHA256 + /SILENT         │
│   └─ puente nativo: impresión con selector de impresora     │
└───────────────┬─────────────────────────────────────────────┘
                │ HTTPS (JWT del usuario)
┌───────────────▼──────────── Supabase ───────────────────────┐
│ Auth · PostgREST · Realtime · Edge Functions                 │
│ Postgres: RLS por sistema y rol, triggers de auditoría,      │
│           tablas append‑only, RPC transaccionales (caja)     │
└──────────────────────────────────────────────────────────────┘
```

- **Sin servidor propio ni secretos en el instalador.** La app usa la clave *publicable* de Supabase; toda autorización la aplica Postgres con RLS (`supabase/migrations`). Las operaciones que requieren la service key (crear usuarios) viven en Edge Functions que validan permisos.
- **Stack:** React 19 + TypeScript + Vite + Tailwind 4 + Motion + TanStack Query · .NET 9 WinForms + WebView2 · Supabase (Postgres 17).

Más detalle en [docs/arquitectura.md](docs/arquitectura.md).

## Instalación (único método)

1. Descargar `MEDORA-X.Y.Z-Setup-x64.exe` de la [última release](../../releases/latest).
2. Ejecutarlo: instala por usuario, sin permisos de administrador, e instala WebView2 si falta.
3. Primer arranque de la plataforma: el asistente pide el **código de instalación** (entregado por separado), crea la cuenta de superadmin y el primer sistema hospitalario.

Las PCs se actualizan solas: al detectar una release nueva, MEDORA muestra un aviso; con "Actualizar ahora" descarga, verifica el SHA256, instala en silencio y vuelve a abrir.

## Desarrollo

```bash
# App (navegador, contra el proyecto real de Supabase)
cd app && npm install && npm run dev

# Launcher apuntando al servidor de desarrollo
$env:MEDORA_URL="http://localhost:5173"; $env:MEDORA_DEVTOOLS="1"
dotnet run --project launcher/MEDORA.Launcher

# Tests
dotnet test MEDORA.sln
cd app && npx tsc -b && npm test
```

### Base de datos

Las migraciones en `supabase/migrations` son la fuente de verdad del esquema. Después de cualquier cambio de políticas, correr `supabase/tests/rls_aislamiento.sql` (se revierte solo) y los *advisors* de seguridad de Supabase. Las reglas para tablas nuevas están en [CLAUDE.md](CLAUDE.md).

## Publicar una versión

```bash
# 1. subir version.txt (p. ej. 1.1.0) y commitear en main
git tag v1.1.0 && git push origin v1.1.0
```

El workflow `release.yml` compila la app y el launcher, genera el instalador con Inno Setup, calcula su SHA256 y crea la GitHub Release. Localmente: `pwsh scripts/generar-instalador.ps1`.
