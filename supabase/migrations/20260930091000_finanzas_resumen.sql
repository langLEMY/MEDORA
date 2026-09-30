-- ============================================================================
-- MEDORA · Finanzas: resumen para gráficos, movimientos importantes y cierres
-- diarios guardados.
--
-- · resumen_financiero: ingresos, gastos y ganancia por día/semana/mes a partir
--   de la contabilidad (misma fuente que la balanza, así nunca se contradicen),
--   comparación con el período anterior, reparto por tipo de ingreso/gasto,
--   cobros por método de pago y saldos actuales (caja, bancos, por cobrar,
--   por pagar).
-- · movimientos_importantes: cobros, donaciones, gastos, movimientos de caja,
--   nóminas y pagos a médicos en una sola lista cronológica.
-- · resumenes_diarios: foto fija de cada día (pacientes, dinero por método,
--   gastos, donaciones), generada cada noche por pg_cron.
-- ============================================================================

create or replace function public.resumen_financiero(p_sistema uuid, p_desde date, p_hasta date, p_agrupar text default 'mes')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_dias int := p_hasta - p_desde + 1;
  v_ant_desde date := p_desde - (p_hasta - p_desde + 1);
  v_ant_hasta date := p_desde - 1;
  v_trunc text := case p_agrupar when 'dia' then 'day' when 'semana' then 'week' else 'month' end;
  v_paso interval := case p_agrupar when 'dia' then interval '1 day' when 'semana' then interval '1 week' else interval '1 month' end;
  v_res jsonb;
begin
  if not privado.tiene_rol(p_sistema, '{admin,gerencia,contabilidad,auditor}', 'reportes') then
    raise exception 'No tienes permiso para ver las finanzas.' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta or v_dias > 3700 then
    raise exception 'El período no es válido.' using errcode = 'P0001';
  end if;

  with lineas as (
    select a.fecha, c.tipo, c.codigo, c.nombre,
           case when c.tipo = 'ingreso' then l.haber - l.debe else l.debe - l.haber end as monto
      from public.asiento_lineas l
      join public.asientos a on a.id = l.asiento_id
      join public.cuentas_contables c on c.sistema_id = l.sistema_id and c.codigo = l.cuenta_codigo
     where l.sistema_id = p_sistema and a.fecha between v_ant_desde and p_hasta
       and c.tipo in ('ingreso', 'gasto', 'costo')
  ),
  actual as (select * from lineas where fecha between p_desde and p_hasta),
  periodos as (
    select generate_series(date_trunc(v_trunc, p_desde), date_trunc(v_trunc, p_hasta), v_paso)::date as inicio
  ),
  serie as (
    select p.inicio,
           coalesce(sum(a.monto) filter (where a.tipo = 'ingreso'), 0) as ingresos,
           coalesce(sum(a.monto) filter (where a.tipo in ('gasto', 'costo')), 0) as gastos
      from periodos p
      left join actual a on date_trunc(v_trunc, a.fecha)::date = p.inicio
     group by p.inicio
  ),
  saldos as (
    select k.clave, coalesce(sum(case when c.tipo in ('activo', 'gasto', 'costo') then l.debe - l.haber else l.haber - l.debe end), 0) as saldo
      from public.cuentas_predeterminadas k
      join public.cuentas_contables c on c.sistema_id = k.sistema_id and c.codigo = k.cuenta_codigo
      left join public.asiento_lineas l on l.sistema_id = k.sistema_id and l.cuenta_codigo = k.cuenta_codigo
     where k.sistema_id = p_sistema
       and k.clave in ('caja', 'banco', 'cxc_pacientes', 'cxc_aseguradoras', 'cxp', 'sueldos_por_pagar', 'comisiones_por_pagar',
                       'retenciones_tss', 'isr_por_pagar', 'aportes_por_pagar', 'anticipos_pacientes')
     group by k.clave
  )
  select jsonb_build_object(
    'desde', p_desde, 'hasta', p_hasta, 'agrupar', coalesce(p_agrupar, 'mes'),
    'ingresos', (select coalesce(sum(monto), 0) from actual where tipo = 'ingreso'),
    'gastos', (select coalesce(sum(monto), 0) from actual where tipo in ('gasto', 'costo')),
    'ingresos_anterior', (select coalesce(sum(monto), 0) from lineas where fecha between v_ant_desde and v_ant_hasta and tipo = 'ingreso'),
    'gastos_anterior', (select coalesce(sum(monto), 0) from lineas where fecha between v_ant_desde and v_ant_hasta and tipo in ('gasto', 'costo')),
    'serie', (select coalesce(jsonb_agg(jsonb_build_object('periodo', inicio, 'ingresos', ingresos, 'gastos', gastos, 'ganancia', ingresos - gastos) order by inicio), '[]') from serie),
    'por_ingreso', (select coalesce(jsonb_agg(jsonb_build_object('cuenta', codigo, 'nombre', nombre, 'monto', m) order by m desc), '[]')
                      from (select codigo, nombre, sum(monto) m from actual where tipo = 'ingreso' group by codigo, nombre having sum(monto) <> 0) x),
    'por_gasto', (select coalesce(jsonb_agg(jsonb_build_object('cuenta', codigo, 'nombre', nombre, 'monto', m) order by m desc), '[]')
                    from (select codigo, nombre, sum(monto) m from actual where tipo in ('gasto', 'costo') group by codigo, nombre having sum(monto) <> 0) x),
    'por_metodo', (select coalesce(jsonb_agg(jsonb_build_object('metodo', metodo, 'monto', m) order by m desc), '[]')
                     from (select mf.metodo::text as metodo, sum(case when mf.tipo = 'ingreso' then mf.monto else -mf.monto end) m
                             from public.movimientos_financieros mf
                            where mf.sistema_id = p_sistema and mf.categoria in ('cobro', 'anulacion', 'abono', 'anticipo', 'donacion')
                              and (mf.creado_en at time zone 'America/Santo_Domingo')::date between p_desde and p_hasta
                            group by mf.metodo having sum(case when mf.tipo = 'ingreso' then mf.monto else -mf.monto end) <> 0) x),
    'donaciones', (select coalesce(sum(d.monto), 0) from public.donaciones d
                    where d.sistema_id = p_sistema and d.fecha between p_desde and p_hasta
                      and not exists (select 1 from public.anulaciones_donacion x where x.donacion_id = d.id)),
    'pacientes', (select count(distinct k.paciente_id) from public.cobros k
                   where k.sistema_id = p_sistema and (k.creado_en at time zone 'America/Santo_Domingo')::date between p_desde and p_hasta
                     and not exists (select 1 from public.anulaciones_cobro x where x.cobro_id = k.id)),
    'cobros', (select count(*) from public.cobros k
                where k.sistema_id = p_sistema and (k.creado_en at time zone 'America/Santo_Domingo')::date between p_desde and p_hasta
                  and not exists (select 1 from public.anulaciones_cobro x where x.cobro_id = k.id)),
    'saldos', (select coalesce(jsonb_object_agg(clave, saldo), '{}') from saldos)
  ) into v_res;
  return v_res;
end;
$$;

create or replace function public.movimientos_importantes(p_sistema uuid, p_desde date, p_hasta date, p_minimo numeric default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_res jsonb;
begin
  if not privado.tiene_rol(p_sistema, '{admin,gerencia,contabilidad,auditor}', 'reportes') then
    raise exception 'No tienes permiso para ver las finanzas.' using errcode = '42501';
  end if;
  with m as (
    select k.creado_en as cuando, 'ingreso' as tipo, 'Cobro' as categoria,
           k.numero || coalesce(' · ' || p.nombres || ' ' || p.apellidos, '') as concepto, k.total as monto,
           exists (select 1 from public.anulaciones_cobro x where x.cobro_id = k.id) as anulado
      from public.cobros k left join public.pacientes p on p.id = k.paciente_id
     where k.sistema_id = p_sistema and (k.creado_en at time zone 'America/Santo_Domingo')::date between p_desde and p_hasta
    union all
    select d.creado_en, 'ingreso', 'Donación', d.numero || ' · ' || case when d.anonima then 'Donante anónimo' else d.donante_nombre end
           || coalesce(' · ' || d.destino, ''), d.monto,
           exists (select 1 from public.anulaciones_donacion x where x.donacion_id = d.id)
      from public.donaciones d
     where d.sistema_id = p_sistema and d.fecha between p_desde and p_hasta
    union all
    select c.creado_en, 'egreso', 'Gasto', c.numero || coalesce(' · ' || pr.nombre, ''), c.total,
           exists (select 1 from public.anulaciones_compra x where x.compra_id = c.id)
      from public.compras c left join public.proveedores pr on pr.id = c.proveedor_id
     where c.sistema_id = p_sistema and c.fecha between p_desde and p_hasta
    union all
    select mf.creado_en, mf.tipo, case when mf.tipo = 'ingreso' then 'Ingreso de caja' else 'Salida de caja' end, mf.concepto, mf.monto, false
      from public.movimientos_financieros mf
     where mf.sistema_id = p_sistema and mf.categoria not in ('cobro', 'anulacion', 'abono', 'anticipo', 'donacion', 'compra')
       and (mf.creado_en at time zone 'America/Santo_Domingo')::date between p_desde and p_hasta
    union all
    select coalesce(n.aprobada_en, n.creado_en), 'egreso', 'Nómina', n.numero || ' · ' || n.descripcion,
           (select coalesce(sum(l.bruto), 0) from public.nomina_lineas l where l.nomina_id = n.id), false
      from public.nominas n
     where n.sistema_id = p_sistema and n.estado = 'aprobada' and n.hasta between p_desde and p_hasta
    union all
    select lq.creado_en, 'egreso', 'Pago a médicos', lq.numero || coalesce(' · ' || pf.nombre_completo, ''), coalesce(lq.neto, lq.total), false
      from public.liquidaciones_comision lq left join public.perfiles pf on pf.id = lq.beneficiario_id
     where lq.sistema_id = p_sistema and (lq.creado_en at time zone 'America/Santo_Domingo')::date between p_desde and p_hasta
  )
  select coalesce(jsonb_agg(jsonb_build_object('cuando', cuando, 'tipo', tipo, 'categoria', categoria, 'concepto', concepto,
                                               'monto', monto, 'anulado', anulado) order by cuando desc), '[]')
    into v_res
    from (select * from m where monto >= coalesce(p_minimo, 0) order by cuando desc limit 300) x;
  return v_res;
end;
$$;

revoke all on function public.resumen_financiero(uuid, date, date, text) from public, anon;
revoke all on function public.movimientos_importantes(uuid, date, date, numeric) from public, anon;
grant execute on function public.resumen_financiero(uuid, date, date, text) to authenticated;
grant execute on function public.movimientos_importantes(uuid, date, date, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- Cierres diarios guardados
create table public.resumenes_diarios (
  sistema_id        uuid not null references public.sistemas(id) on delete restrict,
  fecha             date not null,
  citas             int not null default 0,
  atendidos         int not null default 0,
  pacientes_cobrados int not null default 0,
  cobros            int not null default 0,
  facturado         numeric(14, 2) not null default 0,
  efectivo          numeric(14, 2) not null default 0,
  tarjeta           numeric(14, 2) not null default 0,
  transferencia     numeric(14, 2) not null default 0,
  otros             numeric(14, 2) not null default 0,
  cobertura_ars     numeric(14, 2) not null default 0,
  gastos            numeric(14, 2) not null default 0,
  donaciones        numeric(14, 2) not null default 0,
  generado_en       timestamptz not null default now(),
  primary key (sistema_id, fecha)
);
alter table public.resumenes_diarios enable row level security;
create policy resumenes_diarios_select on public.resumenes_diarios for select to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{admin,gerencia,contabilidad,auditor}', 'reportes')));
revoke all on public.resumenes_diarios from anon;
revoke insert, update, delete, truncate on public.resumenes_diarios from authenticated;
grant select on public.resumenes_diarios to authenticated;
create trigger trg_resumenes_diarios_auditoria after insert or update on public.resumenes_diarios
  for each row execute function privado.tg_auditar();

create or replace function privado.generar_resumen_diario(p_fecha date default ((now() at time zone 'America/Santo_Domingo')::date - 1))
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n int;
begin
  insert into public.resumenes_diarios as r (sistema_id, fecha, citas, atendidos, pacientes_cobrados, cobros, facturado,
                                             efectivo, tarjeta, transferencia, otros, cobertura_ars, gastos, donaciones, generado_en)
  select s.id, p_fecha,
         (select count(*) from public.citas c where c.sistema_id = s.id and (c.inicio at time zone 'America/Santo_Domingo')::date = p_fecha
            and c.estado not in ('cancelada')),
         (select count(*) from public.citas c where c.sistema_id = s.id and (c.inicio at time zone 'America/Santo_Domingo')::date = p_fecha
            and c.estado = 'completada'),
         (select count(distinct k.paciente_id) from public.cobros k where k.sistema_id = s.id and (k.creado_en at time zone 'America/Santo_Domingo')::date = p_fecha
            and not exists (select 1 from public.anulaciones_cobro x where x.cobro_id = k.id)),
         (select count(*) from public.cobros k where k.sistema_id = s.id and (k.creado_en at time zone 'America/Santo_Domingo')::date = p_fecha
            and not exists (select 1 from public.anulaciones_cobro x where x.cobro_id = k.id)),
         (select coalesce(sum(k.total), 0) from public.cobros k where k.sistema_id = s.id and (k.creado_en at time zone 'America/Santo_Domingo')::date = p_fecha
            and not exists (select 1 from public.anulaciones_cobro x where x.cobro_id = k.id)),
         coalesce(p.efectivo, 0), coalesce(p.tarjeta, 0), coalesce(p.transferencia, 0), coalesce(p.otros, 0),
         (select coalesce(sum(k.cobertura_seguro), 0) from public.cobros k where k.sistema_id = s.id and (k.creado_en at time zone 'America/Santo_Domingo')::date = p_fecha
            and not exists (select 1 from public.anulaciones_cobro x where x.cobro_id = k.id)),
         (select coalesce(sum(c.total), 0) from public.compras c where c.sistema_id = s.id and c.fecha = p_fecha
            and not exists (select 1 from public.anulaciones_compra x where x.compra_id = c.id))
         + (select coalesce(sum(m.monto), 0) from public.movimientos_financieros m where m.sistema_id = s.id and m.tipo = 'egreso'
              and m.categoria not in ('anulacion', 'compra') and (m.creado_en at time zone 'America/Santo_Domingo')::date = p_fecha),
         (select coalesce(sum(d.monto), 0) from public.donaciones d where d.sistema_id = s.id and d.fecha = p_fecha
            and not exists (select 1 from public.anulaciones_donacion x where x.donacion_id = d.id)),
         now()
    from public.sistemas s
    left join lateral (
      select sum(cp.monto) filter (where cp.metodo = 'efectivo') as efectivo,
             sum(cp.monto) filter (where cp.metodo = 'tarjeta') as tarjeta,
             sum(cp.monto) filter (where cp.metodo = 'transferencia') as transferencia,
             sum(cp.monto) filter (where cp.metodo in ('cheque', 'otro')) as otros
        from public.cobro_pagos cp join public.cobros k on k.id = cp.cobro_id
       where k.sistema_id = s.id and (k.creado_en at time zone 'America/Santo_Domingo')::date = p_fecha
         and not exists (select 1 from public.anulaciones_cobro x where x.cobro_id = k.id)
    ) p on true
  on conflict (sistema_id, fecha) do update set
    citas = excluded.citas, atendidos = excluded.atendidos, pacientes_cobrados = excluded.pacientes_cobrados,
    cobros = excluded.cobros, facturado = excluded.facturado, efectivo = excluded.efectivo, tarjeta = excluded.tarjeta,
    transferencia = excluded.transferencia, otros = excluded.otros, cobertura_ars = excluded.cobertura_ars,
    gastos = excluded.gastos, donaciones = excluded.donaciones, generado_en = now();
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function privado.generar_resumen_diario(date) from public, anon, authenticated;

-- Días anteriores (últimos 90) para que el historial no empiece vacío.
do $$
declare d date;
begin
  for d in select generate_series((now() at time zone 'America/Santo_Domingo')::date - 90, (now() at time zone 'America/Santo_Domingo')::date - 1, interval '1 day')::date loop
    perform privado.generar_resumen_diario(d);
  end loop;
end;
$$;
