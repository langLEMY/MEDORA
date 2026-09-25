# MEDORA — reglas de trabajo

Sistema de gestión hospitalaria **multi‑sistema** (multi‑tenant). Todo en español: código de dominio, tablas, columnas, comentarios y UI.

## Estructura

- `app/` — React 19 + TS + Vite + Tailwind 4 + Motion + TanStack Query. Hash router (se sirve desde disco).
- `launcher/MEDORA.Launcher` — WinForms + WebView2; sirve `app/dist` en `https://app.medora.local`. Sin API local.
- `launcher/MEDORA.Actualizacion(.Tests)` — lógica de auto‑update (net9.0 puro, testeable en CI).
- `supabase/migrations` — fuente de verdad del esquema. `supabase/functions` — Edge Functions.
- `instalacion/MEDORA.iss` + `scripts/generar-instalador.ps1` — único método de instalación.
- `version.txt` — fuente única de la versión (launcher, instalador, tag de release).

## Reglas de base de datos (no negociables)

1. **Toda tabla de negocio lleva `sistema_id`** y RLS habilitado. Las políticas usan los helpers de `privado`:
   - lectura: `sistema_id in (select privado.mis_sistemas())`
   - escritura por rol: `sistema_id in (select privado.mis_sistemas_con_rol('{admin,...}'))`
   - gestión (personal/config): `privado.sistemas_administrables()` (incluye superadmin)
   Siempre con `(select ...)` para que Postgres lo evalúe una vez por consulta.
2. **FKs compuestas** `(sistema_id, x_id) references tabla (sistema_id, id)` entre tablas de negocio: Postgres impide mezclar datos de sistemas distintos. La tabla padre necesita `unique (sistema_id, id)`.
3. **Append‑only** (historial clínico, cobros y detalles, anulaciones, movimientos financieros e inventario, auditoría): trigger `privado.tg_bloquear_append_only` + `revoke update, delete`. Las correcciones son registros nuevos (adendas, anulaciones, ajustes). Única excepción: `plataforma_eliminar_sistema()` (superadmin) fija `medora.eliminando_sistema` en la transacción y los triggers dejan pasar solo los DELETE de ese sistema; todo trigger nuevo que bloquee DELETE debe respetar `privado.eliminando_sistema(old.sistema_id)`.
4. **Auditoría automática**: cada tabla nueva lleva `trg_<tabla>_auditoria` con `privado.tg_auditar()` (contenido clínico con argumento `'sin_datos'`).
5. **Contabilidad**: todo movimiento de dinero genera su asiento con `privado.crear_asiento()` (exige que cuadre) usando `privado.cuenta(sistema, clave)`; nunca códigos de cuenta fijos. Anulaciones = `privado.revertir_asientos()`.
6. **Dinero y stock se calculan en el servidor** (RPC `security definer` que validan rol con `privado.tiene_rol`). El cliente nunca envía totales confiables.
7. `revoke all ... from anon` en cada tabla nueva; `grant execute` explícito en cada RPC nueva (los privilegios por defecto ya están revocados).
8. Funciones: `set search_path = ''` y nombres calificados con esquema.
9. El superadmin **no** ve datos clínicos/financieros sin membresía: no agregar `es_superadmin()` a políticas de esas tablas.
10. Tras cambiar políticas: correr `supabase/tests/rls_aislamiento.sql` y `get_advisors` (security + performance). Regenerar `app/src/lib/database.types.ts`.

## Reglas de app

- Permisos de UI en `app/src/lib/permisos.ts`: espejo de las políticas (solo para ocultar lo que Postgres igual negaría).
- Claves de TanStack Query siempre incluyen el `sistemaId` (`lib/consultas.ts#claves`).
- Errores de Postgres → `mensajeError()` (español legible).
- **Soporte** (`components/Soporte.tsx`, en Mi perfil): estado del sistema, respaldo, bitácora, caché, cierre global de sesiones y modo mantenimiento (`plataforma.mantenimiento` corta el acceso en los helpers de RLS, salvo superadmin).
- **Datos (Excel / impresión)**: cada listado usa `components/AccionesDatos` con un arreglo de `ColumnaDatos` (el mismo sirve para Excel y para imprimir/PDF). Importaciones nuevas: definición en `lib/importaciones.ts` (columnas + sinónimos) y RPC `importar_<entidad>(p_sistema, p_filas)` que reconcilia duplicados y usa una subtransacción por fila.
- **Movimiento**: seguir `components/ui/movimiento.ts` y las skills de `.claude/skills` (emil‑design‑eng, apple‑design). Solo transform/opacity, entradas ≤ 300 ms con curva de salida, nunca escalar desde 0, `MotionConfig reducedMotion="user"`. Revisar animaciones nuevas con la skill `review-animations`.
- Colores siempre por tokens (`bg-superficie`, `text-texto-2`, `bg-marca`…): la marca la define cada sistema y existe tema oscuro.

## Launcher / releases

- El launcher nunca bloquea el arranque por la red; el chequeo de versión corre en segundo plano.
- Release = tag `vX.Y.Z` igual a `version.txt`; el workflow publica `.exe` + `.exe.sha256`. Sin hash no se ofrece la actualización.
- Nada secreto en el instalador ni en el repo: solo URL y clave **publicable** de Supabase.
