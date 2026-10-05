# MEDORA â€” reglas de trabajo

Sistema de gestiÃ³n hospitalaria **multiâ€‘sistema** (multiâ€‘tenant). Todo en espaÃ±ol: cÃ³digo de dominio, tablas, columnas, comentarios y UI.

**Solo RepÃºblica Dominicana**: pesos dominicanos (`moneda()` formatea RD$; `sistemas.moneda` fijo en DOP), hora de Santo Domingo, normativa dominicana (DGII: NCF, ITBIS, RNC; TSS: AFP/SFS/SRL/INFOTEP; ISR; ARS de la Ley 87â€‘01). CÃ©dula = 11 dÃ­gitos guardada `000-0000000-0`, RNC = 9 dÃ­gitos (u 11 si es cÃ©dula) solo dÃ­gitos: lo valida `privado.tg_identificacion_rd` y su espejo `cedula()`/`rnc()` en `lib/utils.ts`. No agregar selectores de paÃ­s, moneda ni zona horaria.

## Estructura

- `app/` â€” React 19 + TS + Vite + Tailwind 4 + Motion + TanStack Query. Hash router (se sirve desde disco).
- `launcher/MEDORA.Launcher` â€” WinForms + WebView2; sirve `app/dist` en `https://app.medora.local`. Sin API local.
- `launcher/MEDORA.Actualizacion(.Tests)` â€” lÃ³gica de autoâ€‘update (net9.0 puro, testeable en CI).
- `supabase/migrations` â€” fuente de verdad del esquema. `supabase/functions` â€” Edge Functions.
- `instalacion/MEDORA.iss` + `scripts/generar-instalador.ps1` â€” Ãºnico mÃ©todo de instalaciÃ³n.
- `version.txt` â€” fuente Ãºnica de la versiÃ³n (launcher, instalador, tag de release).

## Reglas de base de datos (no negociables)

1. **Toda tabla de negocio lleva `sistema_id`** y RLS habilitado. Las polÃ­ticas usan los helpers de `privado`:
   - lectura: `sistema_id in (select privado.mis_sistemas())`
   - escritura por rol: `sistema_id in (select privado.mis_sistemas_con_rol('{admin,...}'))`
   - gestiÃ³n (personal/config): `privado.sistemas_administrables()` (incluye superadmin)
   Siempre con `(select ...)` para que Postgres lo evalÃºe una vez por consulta.
2. **FKs compuestas** `(sistema_id, x_id) references tabla (sistema_id, id)` entre tablas de negocio: Postgres impide mezclar datos de sistemas distintos. La tabla padre necesita `unique (sistema_id, id)`.
3. **Appendâ€‘only** (historial clÃ­nico, cobros y detalles, anulaciones, movimientos financieros e inventario, auditorÃ­a): trigger `privado.tg_bloquear_append_only` + `revoke update, delete`. Las correcciones son registros nuevos (adendas, anulaciones, ajustes). Ãšnica excepciÃ³n: `plataforma_eliminar_sistema()` (superadmin) fija `medora.eliminando_sistema` en la transacciÃ³n y los triggers dejan pasar solo los DELETE de ese sistema; todo trigger nuevo que bloquee DELETE debe respetar `privado.eliminando_sistema(old.sistema_id)`.
4. **AuditorÃ­a automÃ¡tica**: cada tabla nueva lleva `trg_<tabla>_auditoria` con `privado.tg_auditar()` (contenido clÃ­nico con argumento `'sin_datos'`).
5. **Contabilidad**: todo movimiento de dinero genera su asiento con `privado.crear_asiento()` (exige que cuadre) usando `privado.cuenta(sistema, clave)`; nunca cÃ³digos de cuenta fijos. Anulaciones = `privado.revertir_asientos()`.
6. **Dinero y stock se calculan en el servidor** (RPC `security definer` que validan rol con `privado.tiene_rol`). El cliente nunca envÃ­a totales confiables.
7. `revoke all ... from anon` en cada tabla nueva; `grant execute` explÃ­cito en cada RPC nueva (los privilegios por defecto ya estÃ¡n revocados).
8. Funciones: `set search_path = ''` y nombres calificados con esquema.
9. El superadmin **no** ve datos clÃ­nicos/financieros sin membresÃ­a: no agregar `es_superadmin()` a polÃ­ticas de esas tablas.
10. Tras cambiar polÃ­ticas: correr `supabase/tests/rls_aislamiento.sql` y `get_advisors` (security + performance). Regenerar `app/src/lib/database.types.ts`.
11. **Concurrencia**: todo lo que gaste un saldo o cree algo Ãºnico por perÃ­odo se serializa con `pg_advisory_xact_lock` (adelantos por paciente en `registrar_cobro`, `generar_nomina` por sistema). NumeraciÃ³n con `privado.siguiente_numero` (ya atÃ³mica).
12. Antes de publicar: `supabase/tests/funcional_roles.sql` (baterÃ­a por roles, nÃ³mina/ISR/TSS, caja, ARS, gastos/ITBIS, contabilidad; termina en rollback) debe salir todo OK.

## Acceso

- Se inicia sesiÃ³n con **nombre de usuario** (`perfiles.nombre_usuario`, Ãºnico, minÃºsculas) a travÃ©s de la Edge Function **`acceso`** (verify_jwt off): resuelve usuarioâ†’correo en el servidor con `correo_de_acceso()` (el correo nunca llega al cliente), limita intentos (`limitar()` â†’ `consumir_limite`, tabla `privado.limite_tasa`, solo service_role), migra contraseÃ±as heredadas y devuelve los tokens; la app hace `setSession`. Recuperar contraseÃ±a igual, con la Edge Function `recuperar`. Si se escribe un correo, se usa tal cual. El correo no se descarta: es la identidad en Auth y el contacto futuro; quien no tiene correo recibe uno interno `<usuario>@usuarios.medora.invalid` (`correoVisible()` los oculta en la UI).
- **Superadmin discreto**: el personal de un hospital no ve a los superadmins (RLS con `privado.superadmins()`) ni puede tocar sus membresÃ­as o contraseÃ±as; en AuditorÃ­a sus acciones aparecen como "Soporte MEDORA". Soporte (diagnÃ³stico, respaldo, bitÃ¡cora, cachÃ©), "Asignar contraseÃ±a", Sistema y sedes (RLS `sistemas_update`/`sedes_*`) y los permisos por mÃ³dulo (`membresias.permisos`, trigger `tg_permisos_solo_superadmin`) son exclusivos del superadmin. El admin del hospital asigna roles a su personal.
- **Solo superadmin (normativa)**: los parÃ¡metros de TSS e ISR (`parametros_nomina`: RLS `parametros_update` + `importar_parametros_nomina`/`importar_escala_isr` exigen `es_superadmin()`); la pestaÃ±a se oculta al resto. La calificaciÃ³n de mÃ©dicos (estrellas/puntos en `directorio_medicos`) solo se devuelve al rol admin. El catÃ¡logo de cuentas y las cuentas por concepto solo los edita el rol contabilidad o el superadmin (`editaConfigContable`); el admin los ve en modo lectura.
- **Restablecer contraseÃ±as en bloque** (Mi perfil â†’ "Restablecer contraseÃ±as", solo superadmin): `plataforma-usuarios` acciÃ³n `restablecer_sistema` exige sesiÃ³n aal2 (2FA) y la frase RESTABLECER; da una temporal de 8 dígitos al azar y distinta a cada persona del sistema (`pinTemporal`) (fuera superadmins, quioscos e inactivos), marca `debe_cambiar_password` y `cerrar_acceso_restablecido` cierra sus sesiones, borra su credencial heredada y lo audita. Nunca una contraseÃ±a comÃºn para todos.
- **Quitar personal**: `eliminar_miembro` borra la membresÃ­a; si tiene historial (FKs de citas/turnos de caja) la marca `eliminado_en` y sin acceso (`usePersonal` las excluye). Empleados: `eliminar_empleado` borra o desactiva si ya cobrÃ³ nÃ³mina. El candado de horario de citas (`ex_citas_medico_sin_solape`) solo aplica a `programada`/`confirmada`: los turnos de pacientes que ya llegaron pueden coincidir.
- **VerificaciÃ³n en dos pasos (2FA, TOTP de Supabase Auth)**: opcional por cuenta, se activa en Mi perfil (`components/DosPasos.tsx`). Con un factor verificado, la sesiÃ³n aal1 no pasa de la Puerta (`VerificarDosPasos.tsx`, `requiereSegundoPaso` en `SesionProvider`) y en Postgres `privado.mfa_ok()` es falso: `es_superadmin()` solo vale en aal2 y las acciones crÃ­ticas de plataforma llaman `privado.exigir_mfa()`. En Edge Functions el espejo es `cumpleMfa()` (`_shared/comun.ts`, usa `cuenta_tiene_mfa`, solo service_role). Eventos de auditorÃ­a `LOGIN_2FA`/`ACTIVAR_2FA`/`DESACTIVAR_2FA`.
- **AuditorÃ­a solo de lo importante**: sin trigger de auditorÃ­a en catÃ¡logos y tablas operativas ruidosas (sedes, aseguradoras, servicios, coberturas, pacientes, citas, inventario_items, proveedores, secuencias_ncf, resumenes_diarios); los accesos a expedientes se registran aparte. Tabla nueva de dinero/permisos/personal/clÃ­nica â†’ sÃ­ lleva `trg_<tabla>_auditoria`.
- **Permisos por mÃ³dulo**: `membresias.permisos` ({modulo: true|false}) gana sobre el rol en Postgres (`mis_sistemas_con_rol(roles, modulo)`) y en la UI (`puede(roles, modulo, esSuperadmin, permisos)`).
- **Vista del mÃ©dico**: quien solo tiene roles de consulta (medico/psicologia/nutricion/terapia) ve Ãºnicamente sus citas y pacientes (`privado.sistemas_vista_completa()` + `privado.mis_pacientes()` en RLS); la UI lo refleja con `soloPropio` ("Mi agenda", "Mi consulta", "Mis pacientes").
- **Turnos y quiosco**: el turno (`citas.turno`, prefijo por especialidad) se numera al llegar (`privado.numerar_turno`); con `sistemas.cobro_antes_consulta` pasa a `en_espera` al cobrar (`trg_cobros_activa_turno`) o al exonerar. El rol `quiosco` no ve nada por RLS: solo usa `quiosco_*` y `pantalla_llamados`. **El quiosco nunca crea pacientes**: sin ficha, la cita nace `por_identificar` (con `cedula_llegada`) y se enlaza al cobrar (`trg_cobros_activa_turno` â†’ `privado.identificar_cita`) o con `identificar_turno`; exonerar exige paciente. Rutas a pantalla completa `/quiosco` y `/pantalla`; el launcher las abre con `--quiosco` (sin salida salvo contraseÃ±a, TV en el 2.Âº monitor, ticket con `imprimir-directo`) y `--pantalla`.
- **Integraciones** (e-CF DGII, SENASA, laboratorio, JCE, WhatsApp, Azul): cada hospital conecta sus cuentas en `/integraciones` (admin); campos por proveedor en `privado.campos_integracion` y el catÃ¡logo de `Integraciones.tsx`. Las claves van a **Supabase Vault**; `integraciones.secretos` guarda solo `{id, pista}`. Se escriben con `guardar_integracion` y solo el service_role las descifra (`integracion_secreto`), dentro de la Edge Function `integraciones` (prueba de conexiÃ³n). `integracion_eventos` es append-only. Nunca devolver una clave al cliente.
- **CÃ³digos de invitaciÃ³n solo para administradores** (`generar_codigo_invitacion` lo exige). El resto del personal lo crea un admin desde Personal (`gestion-usuarios`) con usuario y contraseÃ±a temporal. ExcepciÃ³n histÃ³rica: los usuarios de FUNBIDE se migraron con sus logins exactos. Las contraseÃ±as bcrypt se copiaron tal cual; las de ASP.NET Identity (PBKDF2) viven en `privado.credenciales_legado` y la Edge Function `acceso` las verifica (`_shared/legado.ts`) y pasa a Auth en el primer acceso (`acceso-legado` queda por compatibilidad con versiones viejas de la app).

## Reglas de app

- Permisos de UI en `app/src/lib/permisos.ts`: espejo de las polÃ­ticas (solo para ocultar lo que Postgres igual negarÃ­a).
- Claves de TanStack Query siempre incluyen el `sistemaId` (`lib/consultas.ts#claves`).
- Errores de Postgres â†’ `mensajeError()` (espaÃ±ol legible).
- **Entorno de pruebas**: `sistemas.es_pruebas` (copia de configuraciÃ³n de un sistema real vÃ­a `plataforma_crear_sistema_pruebas`, franja "PRUEBAS" en la app, se reinicia eliminando y recreando). Las pruebas se hacen ahÃ­, nunca en el sistema real; para limpiar movimientos de prueba en un sistema real: `plataforma_limpiar_operaciones` (vista previa sin confirmaciÃ³n).
- **Soporte** (`components/Soporte.tsx`, en Mi perfil): estado del sistema, respaldo, bitÃ¡cora, cachÃ©, cierre global de sesiones y modo mantenimiento (`plataforma.mantenimiento` corta el acceso en los helpers de RLS, salvo superadmin).
- **Datos (Excel / impresiÃ³n)**: cada listado usa `components/AccionesDatos` con un arreglo de `ColumnaDatos` (el mismo sirve para Excel y para imprimir/PDF). Importaciones nuevas: definiciÃ³n en `lib/importaciones.ts` (columnas + sinÃ³nimos) y RPC `importar_<entidad>(p_sistema, p_filas)` que reconcilia duplicados y usa una subtransacciÃ³n por fila.
- **Movimiento**: seguir `components/ui/movimiento.ts` y las skills de `.claude/skills` (emilâ€‘designâ€‘eng, appleâ€‘design). Solo transform/opacity, entradas â‰¤ 300 ms con curva de salida, nunca escalar desde 0, `MotionConfig reducedMotion="user"`. Revisar animaciones nuevas con la skill `review-animations`.
- Colores siempre por tokens (`bg-superficie`, `text-texto-2`, `bg-marca`â€¦): la marca la define cada sistema y existe tema oscuro.

## Continuidad, finanzas y trazabilidad

- **Respaldos**: Edge Function `respaldo` (cifra con AES-256-GCM; clave `RESPALDO_CLAVE` y token `RESPALDO_TOKEN` como secretos de la funciÃ³n, token tambiÃ©n en Vault `respaldo_cron`) â†’ bucket privado `respaldos`, tabla `respaldos` (solo superadmin). pg_cron `medora-respaldo-diario` 07:00 UTC; conserva 30. Nunca poner esas claves en el repo.
- **Cierres diarios**: `resumenes_diarios` (pg_cron `medora-cierre-diario`, `privado.generar_resumen_diario`).
- **Finanzas** (`/finanzas`, hub en `Secciones.tsx`): `resumen_financiero` y `movimientos_importantes` salen de la contabilidad; Donaciones (`registrar_donacion`/`anular_donacion`, cuenta `ingreso_donaciones` 4.4).
- **Accesos a expedientes**: `registrar_acceso_expediente` (auditorÃ­a acciÃ³n `VER`, 1 cada 10 min) y `accesos_expediente` (admin/gerencia/auditor). Foto de cÃ©dula: `pacientes.foto_documento` en bucket `documentos-pacientes`.
- **Presencia** (`lib/presencia.ts`, Realtime Presence; el superadmin no se anuncia). **Sin conexiÃ³n** (`lib/sinConexion.ts`): copia en IndexedDB solo de claves operativas (nunca historia clÃ­nica, pacientes ni finanzas), 24 h, se borra al cerrar sesiÃ³n; las mutaciones fallan al instante sin conexiÃ³n.
- **Recuperar contraseÃ±a**: cÃ³digo de 6 dÃ­gitos por la Edge Function `recuperar` (`verifyOtp` tipo recovery en el servidor; el correo vuelve enmascarado). Requiere SMTP propio en Supabase y la plantilla "Reset password" con `{{ .Token }}`.
- **ImpresiÃ³n**: el launcher guarda `impresion.json` (recibos, tickets, preguntar); la app lo edita en Mi perfil (`components/Impresion.tsx`).
- **Cobro sin duplicados**: `registrar_cobro` acepta `p_idempotencia`; la app manda una clave por intento (`clave_idempotencia`, Ã­ndice Ãºnico por sistema). Doble clic o reintento de red no cobra dos veces.
- **Recetas y documentos clÃ­nicos**: tipos `receta` (renglones en `datos.items`), `certificado`, `referimiento`, `orden`; cada uno guarda `datos.medico` (nombre/especialidad/exequÃ¡tur) e imprime con membrete (`DocumentoClinico.tsx`).
- **Bloqueo por inactividad** (`components/BloqueoSesion.tsx`, montado en AppShell): preferencia `bloqueo` (nunca/15/25/30 min) en Mi perfil; cubre la pantalla y revalida la contraseÃ±a sin cerrar la sesiÃ³n. Ãšltima actividad en localStorage (`medora.ultima-actividad`), asÃ­ recargar no lo evade.
- **Pruebas**: `npm test` (vitest, en CI) + `supabase/tests/funcional_roles.sql`.

## Conectores externos

- **e-CF (DGII, Ley 32-23), directo sin intermediario**: certificado .p12 (base64) + clave en Vault (`dgii_ecf`). Con `sistemas.ecf_activo` (`activar_facturacion_electronica`, exige integraciÃ³n conectada, secuencia E32 y RNC) `registrar_cobro` emite el e-NCF equivalente (`privado.tipo_comprobante`: B01â†’E31, B02â†’E32, B14â†’E44, B15â†’E45; 10 dÃ­gitos; un cobro en 0 no consume e-NCF) y `trg_cobros_crea_ecf` crea su fila en `ecf_documentos`. La Edge Function `ecf` (lÃ³gica en `_shared/dgii.ts`: XMLDSig RSA-SHA256, semillaâ†’token, recepciÃ³n/consulta, RFCE para E32 < RD$250,000 a fc.dgii.gov.do, QR) procesa al cobrar, con el botÃ³n de Contabilidad â†’ Comprobantes fiscales y por pg_cron `medora-ecf-pendientes` cada 10 min. Un cobro con e-CF enviado no se anula (`trg_anulaciones_respeta_ecf`): va con nota de crÃ©dito E34 (pendiente). URL de la DGII reemplazables en la config.
- **SENASA / pagos de ARS**: `importar_pagos_ars` (Caja â†’ CxC â†’ Importar pago de ARS) abona por nÃºmero de autorizaciÃ³n con `registrar_abono` (las variantes de una ARS se agrupan por la primera palabra del nombre) y registra la glosa; `ars_pagos_lotes`/`ars_pagos_items` append-only, vista `ars_pagos_resumen`. La validaciÃ³n de afiliaciÃ³n en lÃ­nea espera a que SENASA dÃ© el servicio.
- **Laboratorio**: Edge Function `laboratorio` (verify_jwt off, `?sistema=` + cabecera `x-medora-token`, limitada por IP) â†’ `resultados_laboratorio` (asigna por cÃ©dula/expediente; si no, bandeja en Pacientes; solo se modifica con `asignar_resultado_laboratorio`). PDF en `anexos-clinicos/<sistema>/laboratorio/`.
- **ConciliaciÃ³n bancaria** (Finanzas â†’ Banco): `cuentas_bancarias`, `movimientos_bancarios` (append-only, huella sin duplicar al reimportar), `conciliaciones_bancarias` (vÃ­nculos que se pueden deshacer); `privado.partidas_banco` une cobros/abonos/donaciones/gastos/egresos no en efectivo; `conciliar_automatico` (monto exacto Ãºnico o lote de tarjeta del dÃ­a con comisiÃ³n â‰¤ 6 %).
- **JCE**: conector listo (prueba con usuario/clave contra la URL que dÃ© la JCE/OGTIC); mientras tanto `cedulaVerificada()` avisa (no bloquea) si el dÃ­gito verificador no cuadra.
- **Monitoreo (Sentry)**: `lib/monitoreo.ts`, apagado sin `VITE_SENTRY_DSN`; nunca envÃ­a datos de pacientes (solo id de usuario, sistema y versiÃ³n; limpia cÃ©dulas, telÃ©fonos y correos).
- Edge Functions se despliegan con `npx supabase functions deploy <nombre> --use-api` (`--no-verify-jwt` en `acceso`, `recuperar`, `acceso-legado`, `configuracion-inicial`, `registro-invitacion`, `respaldo`, `ecf`, `laboratorio`). Migraciones grandes: `npx supabase db query --linked -f <archivo>` y registrarlas en `supabase_migrations.schema_migrations`.

## Multiplataforma (open source)

- **Windows**: launcher WinForms/WebView2 (Ãºnico con auto-update, quiosco y TV).
- **Linux/macOS**: `desktop/` (Tauri 2) envuelve la misma `app/dist` en una ventana nativa; sin bridge de impresiÃ³n/quiosco (cae al comportamiento de navegador). Los binarios (.AppImage/.deb/.dmg) los compila `release.yml` en runners ubuntu/macos y se suben a la misma Release. macOS va **sin firmar**. Ãconos en `desktop/src-tauri/icons` (regenerar con `npx @tauri-apps/cli icon <png-1024>`).
- **Licencia MIT** (`LICENSE`); self-host con `app/.env.example` + migraciones.

## Launcher / releases

- El launcher nunca bloquea el arranque por la red; el chequeo de versiÃ³n corre en segundo plano.
- Release = tag `vX.Y.Z` igual a `version.txt`; el workflow publica `.exe` + `.exe.sha256`. Sin hash no se ofrece la actualizaciÃ³n.
- **Notas de la versiÃ³n**: `notas-version/vX.Y.Z.md` (en espaÃ±ol, para el personal del hospital; secciones con Ã­conos: seguridad, novedades, correcciones, descargas). Si no existe, GitHub las genera de los commits.
- **Todo cambio de base o Edge Function va al repo en el mismo momento en que se aplica**: el 2/10/2026 se aplicaron migraciones y funciones desde otra mÃ¡quina sin subirlas y hubo que reconstruirlas desde producciÃ³n.
- **NumeraciÃ³n**: `1.1.0`, `1.2.0` â€¦ `1.99.0`, luego `2.0.0`, `2.1.0` â€¦ `2.99.0`, y asÃ­. Cada release sube el nÃºmero del medio; el Ãºltimo queda en `0` (solo para un arreglo urgente sobre una release ya publicada). Nunca publicar un tag menor que uno existente: el autoâ€‘update ofrece siempre el mayor.
- Nada secreto en el instalador ni en el repo: solo URL y clave **publicable** de Supabase.
