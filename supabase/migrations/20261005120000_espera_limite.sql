-- ============================================================================
-- MEDORA . Cuánto falta para poder reintentar (limitador de intentos)
--
-- El login muestra "Espera 4:32" en vez de "espera unos minutos": la Edge Function
-- acceso consulta los segundos que le quedan a la ventana de una clave bloqueada.
-- Solo service_role (como consumir_limite).
-- ============================================================================

create or replace function public.espera_limite(p_clave text, p_ventana_seg integer)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(0, ceil(extract(epoch from (l.ventana_inicio + make_interval(secs => p_ventana_seg) - now()))))::integer
    from privado.limite_tasa l
   where l.clave = p_clave;
$$;
revoke all on function public.espera_limite(text, integer) from public, anon, authenticated;
grant execute on function public.espera_limite(text, integer) to service_role;
