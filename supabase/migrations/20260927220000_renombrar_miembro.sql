-- ============================================================================
-- MEDORA · El admin del hospital puede corregir el nombre de su personal
--
-- perfiles solo se actualiza por su dueño (RLS perfiles_update_propio). Esta RPC
-- deja cambiar nombre_completo a quien administra un sistema donde esa persona
-- es miembro. Los superadmins solo los renombra otro superadmin (siguen ocultos).
-- ============================================================================
create or replace function public.renombrar_miembro(p_sistema uuid, p_usuario uuid, p_nombre text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre text := regexp_replace(trim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
begin
  if p_sistema not in (select privado.sistemas_administrables()) then
    raise exception 'No tienes permiso para editar el personal de este sistema.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.membresias where sistema_id = p_sistema and usuario_id = p_usuario)
     or (p_usuario in (select privado.superadmins()) and not privado.es_superadmin()) then
    raise exception 'Persona no encontrada en este sistema.' using errcode = 'P0001';
  end if;
  if char_length(v_nombre) < 2 then
    raise exception 'Escribe el nombre completo.' using errcode = 'P0001';
  end if;
  update public.perfiles set nombre_completo = v_nombre where id = p_usuario;
end;
$$;

revoke all on function public.renombrar_miembro(uuid, uuid, text) from public, anon;
grant execute on function public.renombrar_miembro(uuid, uuid, text) to authenticated;
