-- Privilegios por defecto del esquema public, explícitos.
--
-- Producción se creó cuando Supabase daba por defecto permisos de tabla, secuencia y
-- función a authenticated y service_role en public (anon se quitó en
-- 20260925120300_auditoria_rpc). Los proyectos y bases locales nuevos ya no lo hacen,
-- así que una base creada solo con las migraciones quedaba sin permisos y todo fallaba
-- con "permission denied". Esto deja escrito el estado de producción (pg_default_acl del
-- rol postgres en public): authenticated y service_role, nunca anon. El acceso real
-- lo siguen decidiendo el RLS y los revoke de cada migración.
-- En producción no cambia nada (ya lo tiene); se registra como aplicada.

grant usage on schema public to authenticated, service_role;

alter default privileges for role postgres in schema public grant all on tables to authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to authenticated, service_role;
alter default privileges for role postgres in schema public grant execute on functions to authenticated, service_role;
