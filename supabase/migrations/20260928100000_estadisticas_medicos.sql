-- ============================================================================
-- MEDORA · Estadísticas de médicos y cierre de huecos en el pago por paciente
--
-- En FUNBIDE el médico cobra por paciente (reglas de comisión), no salario.
-- Para que nunca se pierda ni se duplique un pago:
--
-- 1. Anular un cobro revierte la comisión CON su retención (antes solo el
--    bruto: el neto del médico quedaba descontado de más).
-- 2. El médico de un cobro puede fijarse DESPUÉS del cobro:
--    - al llamar el turno (cola por especialidad: caja cobra antes de saber
--      quién lo atenderá), automáticamente;
--    - con asignar_medico_cobro(), para médicos que no usan MEDORA o turnos
--      atendidos sin «Llamar siguiente».
--    Si el cobro ya tenía otro médico y su comisión no se liquidó, se revierte
--    y se calcula para el nuevo. Lo liquidado no se toca.
--    cobros sigue inalterable salvo ese campo y solo desde privado.fijar_profesional
--    (GUC medora.asignando_profesional).
-- 3. estadisticas_medico() y cobros_sin_medico(): todo calculado en el
--    servidor con numeric exacto, por fecha local de Santo Domingo.
-- ============================================================================

-- 1. Anulación con retención (y sin duplicar reversos) ---------------------------
do $$
declare
  v_def text := pg_get_functiondef('public.anular_cobro(uuid, text)'::regprocedure);
  v_nueva text;
begin
  v_nueva := replace(v_def,
    'insert into public.comisiones (sistema_id, cobro_id, detalle_id, beneficiario_id, regla_id, base_monto, monto, concepto)
  select sistema_id, cobro_id, detalle_id, beneficiario_id, regla_id, -base_monto, -monto, ''Anulación · '' || concepto
    from public.comisiones where cobro_id = v_cobro.id and monto > 0;',
    'insert into public.comisiones (sistema_id, cobro_id, detalle_id, beneficiario_id, regla_id, base_monto, monto, retencion, concepto)
  select k.sistema_id, k.cobro_id, k.detalle_id, k.beneficiario_id, k.regla_id, -k.base_monto, -k.monto, -k.retencion,
         ''Anulación · '' || k.concepto
    from public.comisiones k
   where k.cobro_id = v_cobro.id and k.monto > 0
     and not exists (select 1 from public.comisiones x
                      where x.cobro_id = k.cobro_id and x.detalle_id is not distinct from k.detalle_id
                        and x.beneficiario_id = k.beneficiario_id and x.monto = -k.monto);');
  if v_nueva = v_def then
    raise exception 'anular_cobro no tiene el formato esperado.';
  end if;
  execute v_nueva;
end;
$$;

-- 2. Médico del cobro fijado después ----------------------------------------------
create or replace function privado.tg_cobros_inalterables()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if privado.eliminando_sistema(old.sistema_id) then
      return old;
    end if;
  elsif coalesce(current_setting('medora.asignando_profesional', true), '') = old.id::text
        and (to_jsonb(new) - 'profesional_id') = (to_jsonb(old) - 'profesional_id') then
    return new;
  end if;
  raise exception 'La tabla %.% es append-only: no se permiten UPDATE ni DELETE.', tg_table_schema, tg_table_name
    using errcode = '42501';
end;
$$;

drop trigger trg_cobros_append_only on public.cobros;
create trigger trg_cobros_append_only before update or delete on public.cobros
  for each row execute function privado.tg_cobros_inalterables();

-- Copia de calcular_comisiones() solo para el profesional (la del vendedor ya
-- se calculó al cobrar y no cambia).
do $$
declare
  v_def text := pg_get_functiondef('privado.calcular_comisiones(uuid)'::regprocedure);
  v_nueva text;
begin
  v_nueva := replace(v_def, 'privado.calcular_comisiones(p_cobro uuid)', 'privado.calcular_comisiones_profesional(p_cobro uuid)');
  v_nueva := replace(v_nueva,
    '    union all
    select ''vendedor'', c.vendedor_id where c.vendedor_id is not null',
    '');
  if position('calcular_comisiones_profesional' in v_nueva) = 0 or position('c.vendedor_id where' in v_nueva) > 0 then
    raise exception 'calcular_comisiones no tiene el formato esperado.';
  end if;
  execute v_nueva;
end;
$$;

create or replace function privado.fijar_profesional(p_cobro uuid, p_medico uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.cobros;
begin
  select * into c from public.cobros where id = p_cobro for update;
  if c.id is null then
    return 'no_existe';
  end if;
  if c.profesional_id is not distinct from p_medico then
    return 'sin_cambio';
  end if;
  if exists (select 1 from public.anulaciones_cobro a where a.cobro_id = c.id) then
    return 'anulado';
  end if;
  if exists (select 1 from public.comisiones k join public.liquidacion_items li on li.comision_id = k.id
              where k.cobro_id = c.id and k.monto > 0 and k.beneficiario_id = c.profesional_id) then
    return 'liquidado';
  end if;

  -- Revertir la comisión del médico anterior, con su retención.
  insert into public.comisiones (sistema_id, cobro_id, detalle_id, beneficiario_id, regla_id, base_monto, monto, retencion, concepto)
  select k.sistema_id, k.cobro_id, k.detalle_id, k.beneficiario_id, k.regla_id, -k.base_monto, -k.monto, -k.retencion,
         'Reasignado · ' || k.concepto
    from public.comisiones k
   where k.cobro_id = c.id and k.monto > 0 and k.beneficiario_id = c.profesional_id
     and not exists (select 1 from public.comisiones x
                      where x.cobro_id = k.cobro_id and x.detalle_id is not distinct from k.detalle_id
                        and x.beneficiario_id = k.beneficiario_id and x.monto = -k.monto);

  perform set_config('medora.asignando_profesional', c.id::text, true);
  update public.cobros set profesional_id = p_medico where id = c.id;
  perform set_config('medora.asignando_profesional', '', true);

  if p_medico is not null then
    perform privado.calcular_comisiones_profesional(c.id);
  end if;
  return 'ok';
end;
$$;

-- Al llamar un turno, el cobro de esa cita pasa a quien lo atiende.
do $$
declare
  v_def text := pg_get_functiondef('public.llamar_turno(uuid)'::regprocedure);
  v_nueva text;
begin
  v_nueva := replace(v_def,
    '  return jsonb_build_object(''id'', c.id, ''turno'', c.turno, ''paciente_id'', c.paciente_id);',
    '  -- Pago por paciente: el cobro de esta cita es de quien lo atiende.
  perform privado.fijar_profesional(k.id, auth.uid())
     from public.cobros k
    where k.cita_id = c.id
      and not exists (select 1 from public.anulaciones_cobro a where a.cobro_id = k.id);
  return jsonb_build_object(''id'', c.id, ''turno'', c.turno, ''paciente_id'', c.paciente_id);');
  if v_nueva = v_def then
    raise exception 'llamar_turno no tiene el formato esperado.';
  end if;
  execute v_nueva;
end;
$$;

-- Asignación manual (caja o administración).
create or replace function public.asignar_medico_cobro(p_cobro uuid, p_medico uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sistema uuid;
  v_r text;
begin
  select sistema_id into v_sistema from public.cobros where id = p_cobro;
  if v_sistema is null or not privado.tiene_rol(v_sistema, '{admin,caja}', 'caja') then
    raise exception 'Sin permiso para asignar el médico de este cobro.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.membresias m
                  where m.sistema_id = v_sistema and m.usuario_id = p_medico and m.activo
                    and m.roles && '{medico,psicologia,nutricion,terapia}') then
    raise exception 'Esa persona no es profesional de este sistema.' using errcode = 'P0001';
  end if;
  v_r := privado.fijar_profesional(p_cobro, p_medico);
  if v_r = 'anulado' then
    raise exception 'El cobro está anulado.' using errcode = 'P0001';
  elsif v_r = 'liquidado' then
    raise exception 'La comisión de ese cobro ya se pagó al médico anterior; no se puede cambiar.' using errcode = 'P0001';
  end if;
  return v_r;
end;
$$;

-- 3. Estadísticas -------------------------------------------------------------------
create or replace function public.estadisticas_medico(p_sistema uuid, p_medico uuid, p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz constant text := 'America/Santo_Domingo';
  v_ini date := date_trunc('month', p_hasta)::date - interval '11 months';
  v_res jsonb;
begin
  if not (p_medico = auth.uid() and p_sistema in (select privado.mis_sistemas()))
     and not privado.tiene_rol(p_sistema, '{admin,gerencia,contabilidad,auditor}', 'comisiones') then
    raise exception 'Sin permiso para ver estas estadísticas.' using errcode = '42501';
  end if;
  if p_desde > p_hasta then
    raise exception 'La fecha inicial es posterior a la final.' using errcode = 'P0001';
  end if;

  with
  -- Una fila por cobro del médico: los anulados/reasignados suman 0 (positivo + reverso).
  cobros_med as (
    select k.cobro_id,
           (co.creado_en at time zone v_tz)::date as dia,
           co.cita_id,
           sum(k.base_monto) as base, sum(k.monto) as bruto, sum(k.retencion) as retencion
      from public.comisiones k
      join public.cobros co on co.id = k.cobro_id
     where k.sistema_id = p_sistema and k.beneficiario_id = p_medico
     group by k.cobro_id, co.creado_en, co.cita_id
  ),
  vigentes as (select * from cobros_med where bruto > 0),
  atendidos as (
    select c.id, (coalesce(c.atendida_en, c.llamado_en, c.inicio) at time zone v_tz)::date as dia
      from public.citas c
     where c.sistema_id = p_sistema and c.medico_id = p_medico and c.estado = 'completada'
  ),
  meses as (select generate_series(v_ini, date_trunc('month', p_hasta)::date, interval '1 month')::date as mes)
  select jsonb_build_object(
    'atendidos_turno', (select count(*) from atendidos where dia between p_desde and p_hasta),
    'cobrados', (select count(*) from vigentes where dia between p_desde and p_hasta),
    'facturado', (select coalesce(sum(base), 0) from vigentes where dia between p_desde and p_hasta),
    'comision', (select coalesce(sum(bruto), 0) from vigentes where dia between p_desde and p_hasta),
    'retencion', (select coalesce(sum(retencion), 0) from vigentes where dia between p_desde and p_hasta),
    'neto', (select coalesce(sum(bruto - retencion), 0) from vigentes where dia between p_desde and p_hasta),
    -- Control: turnos terminados sin cobro a su nombre, y cobros a su nombre sin turno terminado.
    'atendidos_sin_cobro', (select count(*) from atendidos a
                             where a.dia between p_desde and p_hasta
                               and not exists (select 1 from vigentes v where v.cita_id = a.id)),
    'cobrados_sin_turno', (select count(*) from vigentes v
                            where v.dia between p_desde and p_hasta
                              and (v.cita_id is null or not exists (select 1 from atendidos a where a.id = v.cita_id))),
    -- Pagos (a la fecha, sin importar el período).
    'pagado', (select coalesce(sum(k.monto - k.retencion), 0) from public.comisiones k
                 join public.liquidacion_items li on li.comision_id = k.id
                where k.sistema_id = p_sistema and k.beneficiario_id = p_medico),
    'pendiente', (select coalesce(sum(k.monto - k.retencion), 0) from public.comisiones k
                   where k.sistema_id = p_sistema and k.beneficiario_id = p_medico
                     and not exists (select 1 from public.liquidacion_items li where li.comision_id = k.id)),
    'meses', (select coalesce(jsonb_agg(jsonb_build_object(
                'mes', to_char(m.mes, 'YYYY-MM'),
                'atendidos', (select count(*) from atendidos a where date_trunc('month', a.dia) = m.mes),
                'cobrados', (select count(*) from vigentes v where date_trunc('month', v.dia) = m.mes),
                'neto', (select coalesce(sum(v.bruto - v.retencion), 0) from vigentes v where date_trunc('month', v.dia) = m.mes)
              ) order by m.mes), '[]'::jsonb) from meses m)
  ) into v_res;
  return v_res;
end;
$$;

-- Cobros ligados a un turno que no tienen médico (nadie lo llamó en MEDORA).
create or replace function public.cobros_sin_medico(p_sistema uuid, p_desde date, p_hasta date)
returns table (cobro_id uuid, numero text, creado_en timestamptz, paciente text, especialidad text, turno text, total numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not privado.tiene_rol(p_sistema, '{admin,caja,gerencia,contabilidad,auditor}', 'caja') then
    raise exception 'Sin permiso.' using errcode = '42501';
  end if;
  return query
    select co.id, co.numero, co.creado_en,
           trim(coalesce(p.nombres, '') || ' ' || coalesce(p.apellidos, '')),
           ci.especialidad, ci.turno, co.total
      from public.cobros co
      join public.citas ci on ci.id = co.cita_id
      left join public.pacientes p on p.id = co.paciente_id
     where co.sistema_id = p_sistema and co.profesional_id is null
       and (co.creado_en at time zone 'America/Santo_Domingo')::date between p_desde and p_hasta
       and not exists (select 1 from public.anulaciones_cobro a where a.cobro_id = co.id)
     order by co.creado_en desc
     limit 500;
end;
$$;

revoke all on function privado.tg_cobros_inalterables() from public, anon, authenticated;
revoke all on function privado.fijar_profesional(uuid, uuid) from public, anon, authenticated;
revoke all on function privado.calcular_comisiones_profesional(uuid) from public, anon, authenticated;
revoke all on function public.asignar_medico_cobro(uuid, uuid) from public, anon;
revoke all on function public.estadisticas_medico(uuid, uuid, date, date) from public, anon;
revoke all on function public.cobros_sin_medico(uuid, date, date) from public, anon;
grant execute on function public.asignar_medico_cobro(uuid, uuid) to authenticated;
grant execute on function public.estadisticas_medico(uuid, uuid, date, date) to authenticated;
grant execute on function public.cobros_sin_medico(uuid, date, date) to authenticated;
