# MEDORA — reglas de trabajo

Sistema de gestión hospitalaria **multi‑sistema** (multi‑tenant). Todo en español: código de dominio, tablas, columnas, comentarios y UI.

**Solo República Dominicana**: pesos dominicanos (`moneda()` formatea RD$; `sistemas.moneda` fijo en DOP), hora de Santo Domingo, normativa dominicana (DGII: NCF, ITBIS, RNC; TSS: AFP/SFS/SRL/INFOTEP; ISR; ARS de la Ley 87‑01). Cédula = 11 dígitos guardada `000-0000000-0`, RNC = 9 dígitos (u 11 si es cédula) solo dígitos: lo valida `privado.tg_identificacion_rd` y su espejo `cedula()`/`rnc()` en `lib/utils.ts`. No agregar selectores de país, moneda ni zona horaria.

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
11. **Concurrencia**: todo lo que gaste un saldo o cree algo único por período se serializa con `pg_advisory_xact_lock` (adelantos por paciente en `registrar_cobro`, `generar_nomina` por sistema). Numeración con `privado.siguiente_numero` (ya atómica).
12. Antes de publicar: `supabase/tests/funcional_roles.sql` (batería por roles, nómina/ISR/TSS, caja, ARS, gastos/ITBIS, contabilidad; termina en rollback) debe salir todo OK.

## Acceso

- Se inicia sesión con **nombre de usuario** (`perfiles.nombre_usuario`, único, minúsculas). `correo_de_acceso()` lo traduce al correo de Auth; si se escribe un correo, se usa tal cual. El correo no se descarta: es la identidad en Auth y el contacto futuro; quien no tiene correo recibe uno interno `<usuario>@usuarios.medora.invalid` (`correoVisible()` los oculta en la UI).
- **Superadmin discreto**: el personal de un hospital no ve a los superadmins (RLS con `privado.superadmins()`) ni puede tocar sus membresías o contraseñas; en Auditoría sus acciones aparecen como "Soporte MEDORA". Soporte (diagnóstico, respaldo, bitácora, caché), "Asignar contraseña", Sistema y sedes (RLS `sistemas_update`/`sedes_*`) y los permisos por módulo (`membresias.permisos`, trigger `tg_permisos_solo_superadmin`) son exclusivos del superadmin. El admin del hospital asigna roles a su personal.
- **Solo superadmin (normativa)**: los parámetros de TSS e ISR (`parametros_nomina`: RLS `parametros_update` + `importar_parametros_nomina`/`importar_escala_isr` exigen `es_superadmin()`); la pestaña se oculta al resto. La calificación de médicos (estrellas/puntos en `directorio_medicos`) solo se devuelve al rol admin. El catálogo de cuentas y las cuentas por concepto solo los edita el rol contabilidad o el superadmin (`editaConfigContable`); el admin los ve en modo lectura.
- **Quitar personal**: `eliminar_miembro` borra la membresía; si tiene historial (FKs de citas/turnos de caja) la marca `eliminado_en` y sin acceso (`usePersonal` las excluye). Empleados: `eliminar_empleado` borra o desactiva si ya cobró nómina. El candado de horario de citas (`ex_citas_medico_sin_solape`) solo aplica a `programada`/`confirmada`: los turnos de pacientes que ya llegaron pueden coincidir.
- **Permisos por módulo**: `membresias.permisos` ({modulo: true|false}) gana sobre el rol en Postgres (`mis_sistemas_con_rol(roles, modulo)`) y en la UI (`puede(roles, modulo, esSuperadmin, permisos)`).
- **Vista del médico**: quien solo tiene roles de consulta (medico/psicologia/nutricion/terapia) ve únicamente sus citas y pacientes (`privado.sistemas_vista_completa()` + `privado.mis_pacientes()` en RLS); la UI lo refleja con `soloPropio` ("Mi agenda", "Mi consulta", "Mis pacientes").
- **Turnos y quiosco**: el turno (`citas.turno`, prefijo por especialidad) se numera al llegar (`privado.numerar_turno`); con `sistemas.cobro_antes_consulta` pasa a `en_espera` al cobrar (`trg_cobros_activa_turno`) o al exonerar. El rol `quiosco` no ve nada por RLS: solo usa `quiosco_*` y `pantalla_llamados`. **El quiosco nunca crea pacientes**: sin ficha, la cita nace `por_identificar` (con `cedula_llegada`) y se enlaza al cobrar (`trg_cobros_activa_turno` → `privado.identificar_cita`) o con `identificar_turno`; exonerar exige paciente. Rutas a pantalla completa `/quiosco` y `/pantalla`; el launcher las abre con `--quiosco` (sin salida salvo contraseña, TV en el 2.º monitor, ticket con `imprimir-directo`) y `--pantalla`.
- **Integraciones** (WhatsApp, Azul, correo, SMS): cada hospital conecta sus cuentas en `/integraciones` (admin). Las claves van a **Supabase Vault**; `integraciones.secretos` guarda solo `{id, pista}`. Se escriben con `guardar_integracion` y solo el service_role las descifra (`integracion_secreto`), dentro de la Edge Function `integraciones` (prueba de conexión). `integracion_eventos` es append-only. Nunca devolver una clave al cliente.
- **Códigos de invitación solo para administradores** (`generar_codigo_invitacion` lo exige). El resto del personal lo crea un admin desde Personal (`gestion-usuarios`) con usuario y contraseña temporal. Excepción histórica: los usuarios de FUNBIDE se migraron con sus logins exactos. Las contraseñas bcrypt se copiaron tal cual; las de ASP.NET Identity (PBKDF2) viven en `privado.credenciales_legado` y la Edge Function `acceso-legado` las verifica y pasa a Auth en el primer acceso (el Login la llama si Supabase responde `invalid_credentials`).

## Reglas de app

- Permisos de UI en `app/src/lib/permisos.ts`: espejo de las políticas (solo para ocultar lo que Postgres igual negaría).
- Claves de TanStack Query siempre incluyen el `sistemaId` (`lib/consultas.ts#claves`).
- Errores de Postgres → `mensajeError()` (español legible).
- **Entorno de pruebas**: `sistemas.es_pruebas` (copia de configuración de un sistema real vía `plataforma_crear_sistema_pruebas`, franja "PRUEBAS" en la app, se reinicia eliminando y recreando). Las pruebas se hacen ahí, nunca en el sistema real; para limpiar movimientos de prueba en un sistema real: `plataforma_limpiar_operaciones` (vista previa sin confirmación).
- **Soporte** (`components/Soporte.tsx`, en Mi perfil): estado del sistema, respaldo, bitácora, caché, cierre global de sesiones y modo mantenimiento (`plataforma.mantenimiento` corta el acceso en los helpers de RLS, salvo superadmin).
- **Datos (Excel / impresión)**: cada listado usa `components/AccionesDatos` con un arreglo de `ColumnaDatos` (el mismo sirve para Excel y para imprimir/PDF). Importaciones nuevas: definición en `lib/importaciones.ts` (columnas + sinónimos) y RPC `importar_<entidad>(p_sistema, p_filas)` que reconcilia duplicados y usa una subtransacción por fila.
- **Movimiento**: seguir `components/ui/movimiento.ts` y las skills de `.claude/skills` (emil‑design‑eng, apple‑design). Solo transform/opacity, entradas ≤ 300 ms con curva de salida, nunca escalar desde 0, `MotionConfig reducedMotion="user"`. Revisar animaciones nuevas con la skill `review-animations`.
- Colores siempre por tokens (`bg-superficie`, `text-texto-2`, `bg-marca`…): la marca la define cada sistema y existe tema oscuro.

## Launcher / releases

- El launcher nunca bloquea el arranque por la red; el chequeo de versión corre en segundo plano.
- Release = tag `vX.Y.Z` igual a `version.txt`; el workflow publica `.exe` + `.exe.sha256`. Sin hash no se ofrece la actualización.
- **Numeración**: `1.1.0`, `1.2.0` … `1.99.0`, luego `2.0.0`, `2.1.0` … `2.99.0`, y así. Cada release sube el número del medio; el último queda en `0` (solo para un arreglo urgente sobre una release ya publicada). Nunca publicar un tag menor que uno existente: el auto‑update ofrece siempre el mayor.
- Nada secreto en el instalador ni en el repo: solo URL y clave **publicable** de Supabase.
