<p align="center"><img src="docs/medora-256.png" width="96" alt="MEDORA" /></p>

<h1 align="center">MEDORA</h1>
<p align="center">Sistema de gestión hospitalaria multi‑sistema · aplicación de escritorio para Windows con actualización automática</p>

---

# MEDORA — Enterprise Multi-Tenant Health Operating System

> **Infraestructura unificada de gestión hospitalaria con aislamiento de datos por organización y gobierno multiorganizacional.**

---

## 🏛️ **1. RESUMEN EJECUTIVO**

**MEDORA** es una plataforma de gestión hospitalaria diseñada para operar redes de salud, grupos clínicos y consorcios médicos con varias sedes desde una sola aplicación.

Concebido bajo los estándares más exigentes de la industria **HealthTech**, MEDORA resuelve el desafío crítico de la fragmentación operativa: permite a las organizaciones administrar múltiples sistemas hospitalarios autónomos sobre una infraestructura unificada, garantizando la **independencia absoluta de datos**, la **continuidad de negocio ininterrumpida** y una **soberanía de permisos sin precedentes**.

---

## 🛡️ **2. ARQUITECTURA DE SEGURIDAD ELEVADA & SOBERANÍA DE DATOS**

La seguridad en **MEDORA** no es un módulo adicional; es el cimiento estructural sobre el cual se ejecuta cada instrucción del sistema.

### 🔹 **Aislamiento Multi-Tenant Estricto a Nivel de Base de Datos**
* **Segregación lógica a nivel de base de datos:** Cada sistema hospitalario dentro de MEDORA funciona en un entorno aislado mediante políticas de seguridad por fila (RLS) de PostgreSQL. La información médica sensible, los registros contables, el inventario de farmacia y la base de pacientes de una entidad son **completamente invisibles e inaccesibles** para otras organizaciones alojadas en la misma plataforma.
* **Sin filtración cruzada entre sistemas:** Cada consulta se evalúa con el token firmado (JWT) del usuario y sus membresías; las llaves foráneas compuestas impiden mezclar datos de sistemas distintos. Cifrado en tránsito (TLS) y en reposo provisto por la infraestructura de Supabase.

### 🔹 **Control de Acceso Granular (*Contextual RBAC*)**
* **Identidad Unificada con Permisos Contextuales:** Un profesional de la salud puede pertenecer a múltiples redes hospitalarias dentro de MEDORA utilizando una única credencial segura. Sin embargo, sus privilegios de acceso, roles (ej. *Cirujano* en Sistema A vs. *Consultor* en Sistema B) y ámbito de visibilidad se revalúan dinámicamente según el contexto de la organización en la que esté operando en tiempo real.
* **Matriz de Privilegios Minimizados (*Least Privilege Principle*):** Módulos parametrizables que aseguran que el personal administrativo, médico y financiero solo interactúe con los datos estrictamente necesarios para su función.

### 🔹 **Trazabilidad Forense & Auditoría Inmutable**
* **Bitácora de auditoría inalterable:** Cada creación, modificación o eliminación de datos (incluidos expedientes clínicos y transacciones financieras) y los eventos de sesión y exportación quedan registrados en una bitácora que la base de datos impide editar o borrar.
* **Orientado a buenas prácticas de protección de datos de salud:** Mínimo privilegio, trazabilidad y confidencialidad (p. ej. notas de psicología visibles solo para psicología). La certificación formal (HIPAA, ISO 27001) requiere contratos y auditorías aparte.

---

## ⚡ **3. DISPONIBILIDAD CRÍTICA & ALTA RESILIENCIA OPERATIVA**

En el sector salud la continuidad es crítica. **MEDORA** se apoya en Supabase (PostgreSQL gestionado) y en una app de escritorio que se actualiza sola.

* 🟢 **Infraestructura gestionada:** La disponibilidad depende del plan de Supabase contratado; para producción se recomienda el plan Pro o superior (sin pausas por inactividad y con soporte).
* 🟢 **Escalabilidad:** Índices en todas las llaves foráneas y políticas de seguridad evaluadas una vez por consulta, pensadas para crecer en pacientes, citas y movimientos.
* 🟢 **Respaldos:** Copias diarias automáticas en planes pagos de Supabase; la recuperación a un punto en el tiempo (PITR) está disponible como complemento.

---

## 📊 **4. GOBIERNO OPERATIVO, FINANCIERO Y CLÍNICO UNIFICADO**

**MEDORA** consolida todos los ejes de la gestión hospitalaria en un ecosistema cohesivo:

* **Ecosistema Financiero Aislado:** Cada red de salud mantiene su propia contabilidad, centros de costos, ciclos de facturación, aranceles de aseguradoras y nómina de personal sin interferencias financieras externas.
* **Gestión de Expediente Clínico Electrónico (*ECE*):** Centralización del historial médico con controles de privacidad avanzados para garantizar la confidencialidad del paciente.
* **Gestión de Sedes y Logística:** Control centralizado o distribuido de camas, quirófanos, citas médicas, inventario farmacéutico y suministros quirúrgicos en tiempo real.

### Roles (por sistema)

`admin` · `gerencia` · `contabilidad` · `medico` · `enfermeria` · `psicologia` · `nutricion` · `terapia` · `recepcion` · `caja` · `farmacia` · `auditor` — una persona puede tener varios, y roles distintos en sistemas distintos. El **superadmin** de la plataforma administra sistemas, personal y configuración, pero **no ve datos clínicos ni financieros** de un sistema salvo que tenga membresía explícita en él.

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

**Más cuentas:** desde *Plataforma → Códigos de invitación* se generan códigos (para un sistema con ciertos roles, o para otro superadmin) con vigencia y usos máximos; la persona elige "Crear cuenta" en el login y escribe el código. También se pueden crear cuentas directamente (con contraseña temporal) desde *Plataforma → Usuarios* o *Personal*.

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
