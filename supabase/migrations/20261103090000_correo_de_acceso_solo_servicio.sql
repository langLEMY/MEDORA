-- Seguridad: correo_de_acceso() resuelve usuario→correo para iniciar sesión. El
-- cliente NUNCA la llama: solo las Edge Functions `acceso` y `recuperar`, con la
-- service key. Tenía `grant execute ... to anon, authenticated`, así que cualquiera
-- con la clave publicable (va en el bundle de la app) podía POSTear a
-- /rest/v1/rpc/correo_de_acceso y (1) enumerar qué usuarios existen y (2) cosechar
-- los correos reales del personal — justo lo que el diseño quería evitar ("el correo
-- nunca llega al cliente"). La revocamos y la dejamos solo para el service_role.
--
-- Detectado por el linter de seguridad de Supabase (0028_anon_security_definer_function_executable)
-- en la revisión del 3/11/2026. Sin cambios en la app: el login sigue igual (va por la Edge Function).

revoke execute on function public.correo_de_acceso(text) from anon, authenticated;
grant execute on function public.correo_de_acceso(text) to service_role;
