-- MEDORA · Rol "quiosco": la cuenta de la pantalla táctil donde los pacientes toman
-- su turno. Va en su propia migración (un valor de enum nuevo no se puede usar en
-- la misma transacción que lo crea).
alter type public.rol_sistema add value if not exists 'quiosco';
