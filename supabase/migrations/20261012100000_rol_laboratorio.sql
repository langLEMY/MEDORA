-- Rol de laboratorio (bioanalista/técnico). En su propia migración: un valor de
-- enum no puede agregarse y usarse en la misma transacción.
alter type public.rol_sistema add value if not exists 'laboratorio';
