-- ============================================================================
-- Retención de datos técnicos (ver docs/retencion-datos.md).
--
-- pg_cron guarda cada corrida en cron.job_run_details y nunca la borra: solo
-- «medora-ecf-pendientes» suma 144 filas al día. Se conservan 30 días (la salud de
-- la plataforma solo mira las últimas 24 h). Corre a diario para que la tarea
-- también la vigile privado.estado_tareas (tolerancia de 26 h). También: errores de la
-- app de más de 90 días y contadores de intentos (limite_tasa, una fila por usuario/IP)
-- de más de un día, que nunca se borraban.
-- Los datos de negocio (historia clínica, cobros, contabilidad, auditoría) NO se
-- tocan aquí: tienen retención legal de 10 años.
-- ============================================================================

select cron.schedule('medora-limpieza-tecnica', '23 6 * * *', $cron$
  delete from cron.job_run_details where end_time < now() - interval '30 days';
  delete from public.errores_cliente where creado_en < now() - interval '90 days';
  delete from privado.limite_tasa where ventana_inicio < now() - interval '1 day';
$cron$);
