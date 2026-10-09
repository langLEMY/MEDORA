-- Aplicada en producción el 7/10/2026 desde otra máquina sin subirla al repo ni guardar su texto;
-- reconstruida el 9/10/2026 desde las definiciones vivas (pg_get_functiondef y permisos).
-- Soporte → "Cajas abiertas": el superadmin ve en vivo los turnos abiertos de todos los sistemas
-- (sin montos) y puede cerrar el de un cajero que se fue; el cierre queda como "Cierre de soporte".

create or replace function public.plataforma_cajas_abiertas()
returns table(turno_id uuid, sistema_id uuid, sistema text, sede text, cajero text, abierto_en timestamptz, movimientos bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.sistema_id, s.nombre, sd.nombre,
         coalesce(p.nombre_completo, 'Cajero'),
         t.abierto_en,
         (select count(*) from public.movimientos_financieros m where m.turno_id = t.id)
  from public.turnos_caja t
  join public.sistemas s on s.id = t.sistema_id
  left join public.sedes sd on sd.id = t.sede_id
  left join public.perfiles p on p.id = t.cajero_id
  where t.estado = 'abierto'
    and (select privado.es_superadmin())
  order by t.abierto_en;
$$;

create or replace function public.plataforma_cerrar_caja(p_turno uuid, p_notas text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno    public.turnos_caja;
  v_esperado numeric;
begin
  if not (select privado.es_superadmin()) then
    raise exception 'Solo la superadministración.' using errcode = '42501';
  end if;

  select * into v_turno from public.turnos_caja where id = p_turno for update;
  if v_turno.id is null then
    raise exception 'Turno no encontrado.' using errcode = 'P0001';
  end if;
  if v_turno.estado <> 'abierto' then
    raise exception 'El turno ya está cerrado.' using errcode = 'P0001';
  end if;

  select v_turno.monto_apertura
         + coalesce(sum(case when m.tipo = 'ingreso' then m.monto else -m.monto end), 0)
    into v_esperado
    from public.movimientos_financieros m
   where m.turno_id = v_turno.id and m.metodo = 'efectivo';

  update public.turnos_caja
     set estado = 'cerrado', cerrado_en = now(), monto_esperado = v_esperado,
         monto_declarado = v_esperado,
         notas_cierre = trim(both from 'Cierre de soporte (MEDORA). ' || coalesce(p_notas, ''))
   where id = v_turno.id;
end;
$$;

revoke all on function public.plataforma_cajas_abiertas() from public, anon;
revoke all on function public.plataforma_cerrar_caja(uuid, text) from public, anon;
grant execute on function public.plataforma_cajas_abiertas() to authenticated;
grant execute on function public.plataforma_cerrar_caja(uuid, text) to authenticated;
