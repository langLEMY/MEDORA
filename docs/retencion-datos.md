# Retención de datos en MEDORA

Cuánto tiempo se guarda cada tipo de dato, por qué y quién lo borra. Aplica a todos los
hospitales de la plataforma. Si cambia una regla aquí, cambia también la migración o la
tarea que la ejecuta.

## Datos de negocio: no se borran

| Dato | Tablas | Plazo | Base |
|---|---|---|---|
| Historia clínica, recetas, documentos y anexos | `historial_clinico` (incluye recetas, certificados, referimientos y órdenes), `resultados_laboratorio`, bucket `anexos-clinicos` | Mínimo 10 años desde la última atención | Ley General de Salud 42-01 y su reglamento de expediente clínico |
| Cobros, anulaciones, comprobantes (NCF / e-CF) | `cobros`, `cobro_*`, `anulaciones_cobro`, `ecf_documentos` | 10 años | Código Tributario (Ley 11-92, art. 50) y Ley 32-23 de facturación electrónica |
| Contabilidad y movimientos | `asientos`, `asiento_lineas`, `movimientos_*`, `pagos_liquidacion`, `comisiones` | 10 años | Código de Comercio y Código Tributario |
| Nómina y retenciones | `nominas`, `nomina_lineas`, parámetros de TSS e ISR | 10 años | Ley 87-01 y Código de Trabajo |
| Auditoría de acciones | `auditoria` | 10 años (igual que lo que audita) | Trazabilidad de los anteriores |

Son tablas append-only. Las correcciones son registros nuevos (adendas, anulaciones,
reversos). Solo `plataforma_eliminar_sistema()` las borra, cuando un hospital deja la
plataforma y después de entregarle su respaldo.

## Datos técnicos: se limpian solos

| Dato | Plazo | Quién lo borra |
|---|---|---|
| Corridas de pg_cron (`cron.job_run_details`) | 30 días | Tarea `medora-limpieza-tecnica` (diaria, 06:23 UTC) |
| Errores de la app (`errores_cliente`) | 90 días | Misma tarea. También a mano desde Mi perfil → Soporte |
| Respuestas de pg_net (`net._http_response`) | 6 horas | pg_net (configuración por defecto) |
| Respaldos cifrados (bucket `respaldos`) | Los últimos 30 | Edge Function `respaldo` |
| Contadores de intentos (`privado.limite_tasa`) | 1 día | Tarea `medora-limpieza-tecnica` |
| Copia sin conexión (IndexedDB del equipo) | 24 horas, y siempre al cerrar sesión | `lib/sinConexion.ts` |

## Datos de uso y costo

| Dato | Plazo | Nota |
|---|---|---|
| Uso de IA (`ia_eventos`) | 2 años | Solo tokens y costo, nunca el contenido. Es la base de lo que se le factura a cada hospital |
| Bitácora de integraciones (`integracion_eventos`) | 2 años | Append-only. Sin claves ni datos de pacientes |
| Conversaciones de soporte (`solicitudes_soporte`, `mensajes_soporte`) | Mientras el hospital use MEDORA | El texto pasa por `limpiar_texto_soporte` (sin cédulas ni teléfonos) |

Para `ia_eventos` e `integracion_eventos` todavía no hay purga automática: ninguna tiene
dos años. Cuando llegue la primera fecha, la purga necesita una excepción al trigger
append-only, igual que `medora.eliminando_sistema`.

## Cuándo particionar

Hoy `auditoria` pesa unos 5 MB (≈4.400 filas) y la tabla más grande es `pacientes`
(≈5,5 MB). Particionar no aporta a ese tamaño. Revisarlo cuando se cumpla cualquiera de
estas condiciones:

- `auditoria` pasa de 5 millones de filas o de 2 GB;
- las consultas de Auditoría por rango de fechas pasan de 500 ms.

Plan para ese momento: particionar `auditoria` por mes (`creado_en`) con pg_partman.
Las particiones de más de 10 años se pueden archivar en el bucket `respaldos` (cifradas)
antes de soltarlas.

## Derechos de las personas (Ley 172-13)

Un paciente puede pedir acceso a sus datos o que se corrijan. La historia clínica no se
borra a pedido mientras corra el plazo legal: se corrige con adendas. Los datos que no
son clínicos ni fiscales (teléfono, correo, foto) sí se pueden actualizar o quitar desde
la ficha del paciente.
