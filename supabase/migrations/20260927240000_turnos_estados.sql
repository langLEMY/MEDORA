-- MEDORA · Turnos de pacientes (1/2): estados nuevos de la cita.
--   por_cobrar: llegó y espera pasar por caja (cobro antes de la consulta).
--   llamado:    el médico lo llamó; aún no entra al consultorio.
-- Va en su propia migración: un valor de enum nuevo no se puede usar en la
-- misma transacción que lo crea.
alter type public.estado_cita add value if not exists 'por_cobrar' before 'en_espera';
alter type public.estado_cita add value if not exists 'llamado' before 'en_consulta';
