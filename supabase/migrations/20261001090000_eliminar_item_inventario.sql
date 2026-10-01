-- ============================================================================
-- MEDORA · Eliminar artículo de inventario
--
-- Si el artículo nunca tuvo movimientos, se borra; si ya tiene historial de
-- entradas/salidas (append-only), se desactiva para no perder la trazabilidad.
-- Solo admin o farmacia (módulo inventario).
-- ============================================================================

create or replace function public.eliminar_item(p_item uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.inventario_items;
begin
  select * into v from public.inventario_items where id = p_item for update;
  if v.id is null or not privado.tiene_rol(v.sistema_id, '{admin,farmacia}', 'inventario') then
    raise exception 'Artículo no encontrado o sin permiso.' using errcode = '42501';
  end if;
  if exists (select 1 from public.movimientos_inventario where item_id = p_item) then
    update public.inventario_items set activo = false where id = p_item;
    return 'desactivado';
  end if;
  delete from public.inventario_items where id = p_item;
  return 'eliminado';
end;
$$;

revoke all on function public.eliminar_item(uuid) from public, anon;
grant execute on function public.eliminar_item(uuid) to authenticated;
