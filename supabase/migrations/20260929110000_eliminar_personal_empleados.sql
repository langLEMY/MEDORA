-- ============================================================================
-- MEDORA · Quitar personal del sistema y eliminar empleados de nómina
--
-- · eliminar_miembro: el admin del hospital (o el superadmin) quita a una
--   persona del sistema. Su historial (citas, cobros, notas, auditoría) queda,
--   porque apunta a su perfil y no a la membresía. No se puede quitar uno a sí
--   mismo, ni al último administrador, ni a un superadmin (salvo otro
--   superadmin). Si tiene historial (citas, turnos de caja…) la membresía no se
--   puede borrar (FKs compuestas): queda marcada `eliminado_en`, sin acceso y
--   fuera de la lista de Personal. Si la persona no queda activa en ningún otro
--   sistema, su perfil se desactiva y ya no puede entrar.
-- · eliminar_empleado: borra un empleado que nunca ha estado en una nómina; si
--   ya tiene nóminas, solo se desactiva (sus pagos son historial contable).
-- ============================================================================

alter table public.membresias add column if not exists eliminado_en timestamptz;

create or replace function public.eliminar_miembro(p_sistema uuid, p_usuario uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.membresias;
  v_es_super boolean;
begin
  if p_sistema not in (select privado.sistemas_administrables()) then
    raise exception 'Solo la administración del hospital puede quitar personal.' using errcode = '42501';
  end if;
  if p_usuario = auth.uid() then
    raise exception 'No puedes quitarte a ti mismo del sistema.' using errcode = 'P0001';
  end if;
  select * into v_m from public.membresias where sistema_id = p_sistema and usuario_id = p_usuario for update;
  if v_m.id is null then
    raise exception 'Esa persona no pertenece a este sistema.' using errcode = 'P0001';
  end if;
  select coalesce(es_superadmin, false) into v_es_super from public.perfiles where id = p_usuario;
  if v_es_super and not privado.es_superadmin() then
    raise exception 'Esa persona no pertenece a este sistema.' using errcode = 'P0001';
  end if;
  if 'admin' = any(v_m.roles) and v_m.activo and not exists (
       select 1 from public.membresias m
        where m.sistema_id = p_sistema and m.usuario_id <> p_usuario and m.activo and 'admin' = any(m.roles)) then
    raise exception 'Es el único administrador del sistema: asigna otro antes de quitarlo.' using errcode = 'P0001';
  end if;

  begin
    delete from public.membresias where id = v_m.id;
  exception when foreign_key_violation then
    -- Tiene historial en este sistema: se conserva la fila, sin acceso.
    update public.membresias
       set activo = false, atiende_agenda = false, eliminado_en = now()
     where id = v_m.id;
  end;

  if not v_es_super and not exists (
       select 1 from public.membresias where usuario_id = p_usuario and activo and eliminado_en is null) then
    update public.perfiles set activo = false where id = p_usuario;
  end if;
  return 'eliminado';
end;
$$;

create or replace function public.eliminar_empleado(p_empleado uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e public.empleados;
begin
  select * into v_e from public.empleados where id = p_empleado for update;
  if v_e.id is null or not privado.tiene_rol(v_e.sistema_id, '{admin,contabilidad,gerencia}', 'nomina') then
    raise exception 'Empleado no encontrado o sin permiso.' using errcode = '42501';
  end if;
  if exists (select 1 from public.nomina_lineas where empleado_id = p_empleado) then
    update public.empleados set activo = false where id = p_empleado;
    return 'desactivado';
  end if;
  delete from public.empleados where id = p_empleado;
  return 'eliminado';
end;
$$;

revoke all on function public.eliminar_miembro(uuid, uuid) from public, anon;
revoke all on function public.eliminar_empleado(uuid) from public, anon;
grant execute on function public.eliminar_miembro(uuid, uuid) to authenticated;
grant execute on function public.eliminar_empleado(uuid) to authenticated;
