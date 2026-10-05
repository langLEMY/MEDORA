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

- Se inicia sesión con **nombre de usuario** (`perfiles.nombre_usuario`, único, minúsculas) a través de la Edge Function **`acceso`** (verify_jwt off): resuelve usuario→correo en el servidor con `correo_de_acceso()` (el correo nunca llega al cliente), limita intentos (`limitar()` → `consumir_limite`, tabla `privado.limite_tasa`, solo service_role), migra contraseñas heredadas y devuelve los tokens; la app hace `setSession`. Recuperar contraseña igual, con la Edge Function `recuperar`. Si se escribe un correo, se usa tal cual. El correo no se descarta: es la identidad en Auth y el contacto futuro; quien no tiene correo recibe uno interno `<usuario>@usuarios.medora.invalid` (`correoVisible()` los oculta en la UI).
- **Superadmin discreto**: el personal de un hospital no ve a los superadmins (RLS con `privado.superadmins()`) ni puede tocar sus membresías o contraseñas; en Auditoría sus acciones aparecen como "Soporte MEDORA". Soporte (diagnóstico, respaldo, bitácora, caché), "Asignar contraseña", Sistema y sedes (RLS `sistemas_update`/`sedes_*`) y los permisos por módulo (`membresias.permisos`, trigger `tg_permisos_solo_superadmin`) son exclusivos del superadmin. El admin del hospital asigna roles a su personal.
- **Solo superadmin (normativa)**: los parámetros de TSS e ISR (`parametros_nomina`: RLS `parametros_update` + `importar_parametros_nomina`/`importar_escala_isr` exigen `es_superadmin()`); la pestaña se oculta al resto. La calificación de médicos (estrellas/puntos en `directorio_medicos`) solo se devuelve al rol admin. El catálogo de cuentas y las cuentas por concepto solo los edita el rol contabilidad o el superadmin (`editaConfigContable`); el admin los ve en modo lectura.
- **Restablecer contraseñas en bloque** (Mi perfil → "Restablecer contraseñas", solo superadmin): `plataforma-usuarios` acción `restablecer_sistema` exige sesión aal2 (2FA) y la frase RESTABLECER; da una temporal de 8 dígitos al azar y distinta a cada persona del sistema (`pinTemporal`) (fuera superadmins, quioscos e inactivos), marca `debe_cambiar_password` y `cerrar_acceso_restablecido` cierra sus sesiones, borra su credencial heredada y lo audita. Nunca una contraseña común para todos.
- **Quitar personal**: `eliminar_miembro` borra la membresía; si tiene historial (FKs de citas/turnos de caja) la marca `eliminado_en` y sin acceso (`usePersonal` las excluye). Empleados: `eliminar_empleado` borra o desactiva si ya cobró nómina. El candado de horario de citas (`ex_citas_medico_sin_solape`) solo aplica a `programada`/`confirmada`: los turnos de pacientes que ya llegaron pueden coincidir.
- **Verificación en dos pasos (2FA, TOTP de Supabase Auth)**: opcional por cuenta, se activa en Mi perfil (`components/DosPasos.tsx`). Con un factor verificado, la sesión aal1 no pasa de la Puerta (`VerificarDosPasos.tsx`, `requiereSegundoPaso` en `SesionProvider`) y en Postgres `privado.mfa_ok()` es falso: `es_superadmin()` solo vale en aal2 y las acciones críticas de plataforma llaman `privado.exigir_mfa()`. En Edge Functions el espejo es `cumpleMfa()` (`_shared/comun.ts`, usa `cuenta_tiene_mfa`, solo service_role). Eventos de auditoría `LOGIN_2FA`/`ACTIVAR_2FA`/`DESACTIVAR_2FA`.
- **Auditoría solo de lo importante**: sin trigger de auditoría en catálogos y tablas operativas ruidosas (sedes, aseguradoras, servicios, coberturas, pacientes, citas, inventario_items, proveedores, secuencias_ncf, resumenes_diarios); los accesos a expedientes se registran aparte. Tabla nueva de dinero/permisos/personal/clínica → sí lleva `trg_<tabla>_auditoria`.
- **Permisos por módulo**: `membresias.permisos` ({modulo: true|false}) gana sobre el rol en Postgres (`mis_sistemas_con_rol(roles, modulo)`) y en la UI (`puede(roles, modulo, esSuperadmin, permisos)`).
- **Vista del médico**: quien solo tiene roles de consulta (medico/psicologia/nutricion/terapia) ve únicamente sus citas y pacientes (`privado.sistemas_vista_completa()` + `privado.mis_pacientes()` en RLS); la UI lo refleja con `soloPropio` ("Mi agenda", "Mi consulta", "Mis pacientes").
- **Turnos y quiosco**: el turno (`citas.turno`, prefijo por especialidad) se numera al llegar (`privado.numerar_turno`); con `sistemas.cobro_antes_consulta` pasa a `en_espera` al cobrar (`trg_cobros_activa_turno`) o al exonerar. El rol `quiosco` no ve nada por RLS: solo usa `quiosco_*` y `pantalla_llamados`. **El quiosco nunca crea pacientes**: sin ficha, la cita nace `por_identificar` (con `cedula_llegada`) y se enlaza al cobrar (`trg_cobros_activa_turno` → `privado.identificar_cita`) o con `identificar_turno`; exonerar exige paciente. Rutas a pantalla completa `/quiosco` y `/pantalla`; el launcher las abre con `--quiosco` (sin salida salvo contraseña, TV en el 2.º monitor, ticket con `imprimir-directo`) y `--pantalla`.
- **Integraciones** (e-CF DGII, SENASA, laboratorio, JCE, WhatsApp, Azul): cada hospital conecta sus cuentas en `/integraciones` (admin); campos por proveedor en `privado.campos_integracion` y el catálogo de `Integraciones.tsx`. Las claves van a **Supabase Vault**; `integraciones.secretos` guarda solo `{id, pista}`. Se escriben con `guardar_integracion` y solo el service_role las descifra (`integracion_secreto`), dentro de la Edge Function `integraciones` (prueba de conexión). `integracion_eventos` es append-only. Nunca devolver una clave al cliente.
- **Códigos de invitación solo para administradores** (`generar_codigo_invitacion` lo exige). El resto del personal lo crea un admin desde Personal (`gestion-usuarios`) con usuario y contraseña temporal. Excepción histórica: los usuarios de FUNBIDE se migraron con sus logins exactos. Las contraseñas bcrypt se copiaron tal cual; las de ASP.NET Identity (PBKDF2) viven en `privado.credenciales_legado` y la Edge Function `acceso` las verifica (`_shared/legado.ts`) y pasa a Auth en el primer acceso (`acceso-legado` queda por compatibilidad con versiones viejas de la app).

## Reglas de app

- Permisos de UI en `app/src/lib/permisos.ts`: espejo de las políticas (solo para ocultar lo que Postgres igual negaría).
- Claves de TanStack Query siempre incluyen el `sistemaId` (`lib/consultas.ts#claves`).
- Errores de Postgres → `mensajeError()` (español legible).
- **Entorno de pruebas**: `sistemas.es_pruebas` (copia de configuración de un sistema real vía `plataforma_crear_sistema_pruebas`, franja "PRUEBAS" en la app, se reinicia eliminando y recreando). Las pruebas se hacen ahí, nunca en el sistema real; para limpiar movimientos de prueba en un sistema real: `plataforma_limpiar_operaciones` (vista previa sin confirmación).
- **Soporte** (`components/Soporte.tsx`, en Mi perfil): estado del sistema, respaldo, bitácora, caché, cierre global de sesiones y modo mantenimiento (`plataforma.mantenimiento` corta el acceso en los helpers de RLS, salvo superadmin).
- **Datos (Excel / impresión)**: cada listado usa `components/AccionesDatos` con un arreglo de `ColumnaDatos` (el mismo sirve para Excel y para imprimir/PDF). Importaciones nuevas: definición en `lib/importaciones.ts` (columnas + sinónimos) y RPC `importar_<entidad>(p_sistema, p_filas)` que reconcilia duplicados y usa una subtransacción por fila.
- **Movimiento**: seguir `components/ui/movimiento.ts` y las skills de `.claude/skills` (emil‑design‑eng, apple‑design). Solo transform/opacity, entradas ≤ 300 ms con curva de salida, nunca escalar desde 0, `MotionConfig reducedMotion="user"`. Revisar animaciones nuevas con la skill `review-animations`.
- **Piezas comunes de UI**: atajos de teclado con `useAtajos`/`irA` (`lib/atajos.ts`; Caja: F2 nuevo cobro, F4 paciente, F6 servicio, F9 registrar); listados largos con `useListado` + `SelectorOrden` + `Paginacion` (`components/ui/listado.tsx`); avisos de la campana en `mis_avisos(p_sistema)` (calcula según rol y permisos; aviso nuevo = otro bloque ahí) y `CentroAvisos.tsx`; "Qué hay de nuevo" lee `notas-version/v<versión>.md` (`Novedades.tsx`), así que cada release debe tener sus notas. Los cambios de estado de citas sin efectos (confirmar, cancelar, no asistió, completar) se deshacen desde el aviso (`DESHACIBLES` en `FormCita.tsx`); dinero y clínica nunca. En pantallas táctiles (`pointer: coarse`) los controles miden 44 px (`index.css`).
- Colores siempre por tokens (`bg-superficie`, `text-texto-2`, `bg-marca`…): la marca la define cada sistema y existe tema oscuro.

## Continuidad, finanzas y trazabilidad

- **Respaldos**: Edge Function `respaldo` (cifra con AES-256-GCM; clave `RESPALDO_CLAVE` y token `RESPALDO_TOKEN` como secretos de la función, token también en Vault `respaldo_cron`) → bucket privado `respaldos`, tabla `respaldos` (solo superadmin). pg_cron `medora-respaldo-diario` 07:00 UTC; conserva 30. Nunca poner esas claves en el repo.
- **Cierres diarios**: `resumenes_diarios` (pg_cron `medora-cierre-diario`, `privado.generar_resumen_diario`).
- **Finanzas** (`/finanzas`, hub en `Secciones.tsx`): `resumen_financiero` y `movimientos_importantes` salen de la contabilidad; Donaciones (`registrar_donacion`/`anular_donacion`, cuenta `ingreso_donaciones` 4.4).
- **Accesos a expedientes**: `registrar_acceso_expediente` (auditoría acción `VER`, 1 cada 10 min) y `accesos_expediente` (admin/gerencia/auditor). Foto de cédula: `pacientes.foto_documento` en bucket `documentos-pacientes`.
- **Presencia** (`lib/presencia.ts`, Realtime Presence; el superadmin no se anuncia). **Sin conexión** (`lib/sinConexion.ts`): copia en IndexedDB solo de claves operativas (nunca historia clínica, pacientes ni finanzas), 24 h, se borra al cerrar sesión; las mutaciones fallan al instante sin conexión.
- **Recuperar contraseña**: código de 6 dígitos por la Edge Function `recuperar` (`verifyOtp` tipo recovery en el servidor; el correo vuelve enmascarado). Requiere SMTP propio en Supabase y la plantilla "Reset password" con `{{ .Token }}`.
- **Impresión**: el launcher guarda `impresion.json` (recibos, tickets, preguntar); la app lo edita en Mi perfil (`components/Impresion.tsx`).
- **Cobro sin duplicados**: `registrar_cobro` acepta `p_idempotencia`; la app manda una clave por intento (`clave_idempotencia`, índice único por sistema). Doble clic o reintento de red no cobra dos veces.
- **Recetas y documentos clínicos**: tipos `receta` (renglones en `datos.items`), `certificado`, `referimiento`, `orden`; cada uno guarda `datos.medico` (nombre/especialidad/exequátur) e imprime con membrete (`DocumentoClinico.tsx`).
- **Bloqueo por inactividad** (`components/BloqueoSesion.tsx`, montado en AppShell): preferencia `bloqueo` (nunca/15/25/30 min) en Mi perfil; cubre la pantalla y revalida la contraseña sin cerrar la sesión. Última actividad en localStorage (`medora.ultima-actividad`), así recargar no lo evade.
- **Pruebas**: `npm test` (vitest, en CI) + `supabase/tests/funcional_roles.sql`.

## Conectores externos

- **e-CF (DGII, Ley 32-23), directo sin intermediario**: certificado .p12 (base64) + clave en Vault (`dgii_ecf`). Con `sistemas.ecf_activo` (`activar_facturacion_electronica`, exige integración conectada, secuencia E32 y RNC) `registrar_cobro` emite el e-NCF equivalente (`privado.tipo_comprobante`: B01→E31, B02→E32, B14→E44, B15→E45; 10 dígitos; un cobro en 0 no consume e-NCF) y `trg_cobros_crea_ecf` crea su fila en `ecf_documentos`. La Edge Function `ecf` (lógica en `_shared/dgii.ts`: XMLDSig RSA-SHA256, semilla→token, recepción/consulta, RFCE para E32 < RD$250,000 a fc.dgii.gov.do, QR) procesa al cobrar, con el botón de Contabilidad → Comprobantes fiscales y por pg_cron `medora-ecf-pendientes` cada 10 min. Un cobro con e-CF enviado no se anula (`trg_anulaciones_respeta_ecf`): va con nota de crédito E34 (pendiente). URL de la DGII reemplazables en la config.
- **SENASA / pagos de ARS**: `importar_pagos_ars` (Caja → CxC → Importar pago de ARS) abona por número de autorización con `registrar_abono` (las variantes de una ARS se agrupan por la primera palabra del nombre) y registra la glosa; `ars_pagos_lotes`/`ars_pagos_items` append-only, vista `ars_pagos_resumen`. La validación de afiliación en línea espera a que SENASA dé el servicio.
- **Laboratorio**: Edge Function `laboratorio` (verify_jwt off, `?sistema=` + cabecera `x-medora-token`, limitada por IP) → `resultados_laboratorio` (asigna por cédula/expediente; si no, bandeja en Pacientes; solo se modifica con `asignar_resultado_laboratorio`). PDF en `anexos-clinicos/<sistema>/laboratorio/`.
- **Conciliación bancaria** (Finanzas → Banco): `cuentas_bancarias`, `movimientos_bancarios` (append-only, huella sin duplicar al reimportar), `conciliaciones_bancarias` (vínculos que se pueden deshacer); `privado.partidas_banco` une cobros/abonos/donaciones/gastos/egresos no en efectivo; `conciliar_automatico` (monto exacto único o lote de tarjeta del día con comisión ≤ 6 %).
- **JCE**: conector listo (prueba con usuario/clave contra la URL que dé la JCE/OGTIC); mientras tanto `cedulaVerificada()` avisa (no bloquea) si el dígito verificador no cuadra.
- **Monitoreo (Sentry)**: `lib/monitoreo.ts`, apagado sin `VITE_SENTRY_DSN`; nunca envía datos de pacientes (solo id de usuario, sistema y versión; limpia cédulas, teléfonos y correos).
- **IA (Claude)**: Edge Function `ia` + `_shared/claude.ts` (Haiku para mapear/clasificar, Sonnet para redactar; salida estructurada con herramienta forzada). Clave `ANTHROPIC_API_KEY` como secreto de la función. La paga MEDORA: solo el superadmin la activa por hospital (`sistemas.ia_activa`, `ia_tope_mensual_usd`, en Sistema y sedes → `AjustesIa`). Cada uso va a `ia_eventos` (append-only, tokens y costo, nunca el contenido). La IA propone y una persona confirma; nunca escribe datos ni recibe historia clínica. **Pregúntale a MEDORA** (Ctrl+K, `PreguntaMedora.tsx`; acción `preguntar`, `ia/preguntar.ts`): Haiku solo elige una consulta del catálogo cerrado y sus filtros (Sonnet si Haiku no la entiende); la consulta corre con el JWT del usuario (RLS) y a la IA no llega ningún dato. Consulta nueva = agregarla al enum y a `ejecutar()`.
- Edge Functions se despliegan con `npx supabase functions deploy <nombre> --use-api` (`--no-verify-jwt` en `acceso`, `recuperar`, `acceso-legado`, `configuracion-inicial`, `registro-invitacion`, `respaldo`, `ecf`, `laboratorio`). Migraciones grandes: `npx supabase db query --linked -f <archivo>` y registrarlas en `supabase_migrations.schema_migrations`.

## Multiplataforma (open source)

- **Windows**: launcher WinForms/WebView2 (único con auto-update, quiosco y TV).
- **Linux/macOS**: `desktop/` (Tauri 2) envuelve la misma `app/dist` en una ventana nativa; sin bridge de impresión/quiosco (cae al comportamiento de navegador). Los binarios (.AppImage/.deb/.dmg) los compila `release.yml` en runners ubuntu/macos y se suben a la misma Release. macOS va **sin firmar**. Íconos en `desktop/src-tauri/icons` (regenerar con `npx @tauri-apps/cli icon <png-1024>`).
- **Licencia MIT** (`LICENSE`); self-host con `app/.env.example` + migraciones.

## Launcher / releases

- El launcher nunca bloquea el arranque por la red; el chequeo de versión corre en segundo plano.
- Release = tag `vX.Y.Z` igual a `version.txt`; el workflow publica `.exe` + `.exe.sha256`. Sin hash no se ofrece la actualización.
- **Notas de la versión**: `notas-version/vX.Y.Z.md` (en español, para el personal del hospital; secciones con íconos: seguridad, novedades, correcciones, descargas). Si no existe, GitHub las genera de los commits.
- **Todo cambio de base o Edge Function va al repo en el mismo momento en que se aplica**: el 2/10/2026 se aplicaron migraciones y funciones desde otra máquina sin subirlas y hubo que reconstruirlas desde producción.
- **Numeración**: `1.1.0`, `1.2.0` … `1.99.0`, luego `2.0.0`, `2.1.0` … `2.99.0`, y así. Cada release sube el número del medio; el último queda en `0` (solo para un arreglo urgente sobre una release ya publicada). Nunca publicar un tag menor que uno existente: el auto‑update ofrece siempre el mayor.
- Nada secreto en el instalador ni en el repo: solo URL y clave **publicable** de Supabase.
