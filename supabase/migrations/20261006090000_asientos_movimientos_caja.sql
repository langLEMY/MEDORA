-- Los egresos e ingresos manuales de caja (registrar_movimiento) generan su asiento.
-- Antes solo quedaba la salida en el turno: la contabilidad (y Finanzas) no los veía.
--   egreso  → debe: cuenta de gasto según la categoría (o Banco si es un depósito) · haber: caja/banco según el método
--   ingreso → debe: caja/banco según el método · haber: Otros ingresos (4.2)
-- Categoría nueva "deposito": efectivo de la caja que se lleva al banco (no es gasto).

-- 1. Origen nuevo para los asientos.
alter table public.asientos drop constraint if exists asientos_origen_check;
alter table public.asientos add constraint asientos_origen_check
  check (origen in ('manual', 'cobro', 'anulacion', 'anticipo', 'abono', 'compra', 'nomina', 'comision', 'reverso', 'donacion', 'movimiento'));

-- 2. Cuentas por concepto de los gastos de caja (las cuentas ya existen en el catálogo base).
insert into public.cuentas_predeterminadas (sistema_id, clave, cuenta_codigo)
select c.sistema_id, d.clave, d.codigo
  from (values ('gasto_suministros', '6.2.01'), ('gasto_servicios', '6.2.02'), ('gasto_mantenimiento', '6.2.03'),
               ('otros_ingresos', '4.2')) as d(clave, codigo)
  join public.cuentas_contables c on c.codigo = d.codigo and c.acepta_movimiento
on conflict (sistema_id, clave) do nothing;

do $$
declare
  v_def text := pg_get_functiondef('privado.sembrar_catalogo(uuid)'::regprocedure);
  v_ancla text := '(''ingreso_donaciones'', ''4.4'')';
begin
  if position(v_ancla in v_def) = 0 then
    raise exception 'privado.sembrar_catalogo cambió: no encuentro %', v_ancla;
  end if;
  if position('gasto_suministros' in v_def) = 0 then
    execute replace(v_def, v_ancla, v_ancla || ', (''gasto_suministros'', ''6.2.01''), (''gasto_servicios'', ''6.2.02''), '
                                      || '(''gasto_mantenimiento'', ''6.2.03''), (''otros_ingresos'', ''4.2'')');
  end if;
end $$;

-- 3. Asiento de un movimiento manual de caja.
create or replace function privado.asentar_movimiento(p_mov public.movimientos_financieros)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s      uuid := p_mov.sistema_id;
  v_metodo text := privado.cuenta_metodo(v_s, p_mov.metodo::text);
  v_otra   text;
  v_desc   text;
begin
  if p_mov.tipo = 'egreso' then
    if p_mov.categoria = 'deposito' then
      v_otra := privado.cuenta(v_s, 'banco');
      v_desc := 'Depósito al banco';
    else
      v_otra := privado.cuenta(v_s, case p_mov.categoria
                                      when 'suministros'   then 'gasto_suministros'
                                      when 'servicios'     then 'gasto_servicios'
                                      when 'mantenimiento' then 'gasto_mantenimiento'
                                      else 'gasto_general' end);
      v_desc := 'Gasto de caja · ' || p_mov.categoria;
    end if;
    return privado.crear_asiento(v_s, (p_mov.creado_en at time zone 'America/Santo_Domingo')::date, p_mov.concepto,
      'movimiento', p_mov.id, jsonb_build_array(
        jsonb_build_object('cuenta', v_otra, 'debe', p_mov.monto, 'descripcion', v_desc),
        jsonb_build_object('cuenta', v_metodo, 'haber', p_mov.monto, 'descripcion', 'Salida · ' || p_mov.metodo)));
  end if;

  return privado.crear_asiento(v_s, (p_mov.creado_en at time zone 'America/Santo_Domingo')::date, p_mov.concepto,
    'movimiento', p_mov.id, jsonb_build_array(
      jsonb_build_object('cuenta', v_metodo, 'debe', p_mov.monto, 'descripcion', 'Entrada · ' || p_mov.metodo),
      jsonb_build_object('cuenta', privado.cuenta(v_s, 'otros_ingresos'), 'haber', p_mov.monto, 'descripcion', 'Ingreso de caja · ' || p_mov.categoria)));
end;
$$;

revoke all on function privado.asentar_movimiento(public.movimientos_financieros) from public, anon, authenticated;

-- 4. registrar_movimiento valida y asienta.
create or replace function public.registrar_movimiento(
  p_sistema uuid, p_tipo text, p_concepto text, p_monto numeric,
  p_metodo public.metodo_pago default 'efectivo', p_categoria text default 'general'
)
returns public.movimientos_financieros
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mov public.movimientos_financieros;
  v_turno uuid := privado.turno_abierto(p_sistema);
  v_cat text := coalesce(nullif(lower(trim(p_categoria)), ''), 'general');
begin
  if not privado.tiene_rol(p_sistema, '{caja,admin}', 'caja') then
    raise exception 'No tienes permiso para registrar movimientos.' using errcode = '42501';
  end if;
  if v_cat in ('cobro', 'anulacion', 'compra') then
    raise exception 'Categoría reservada.' using errcode = 'P0001';
  end if;
  if p_tipo not in ('ingreso', 'egreso') then
    raise exception 'El movimiento debe ser ingreso o egreso.' using errcode = 'P0001';
  end if;
  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El monto debe ser mayor que cero.' using errcode = 'P0001';
  end if;
  if p_metodo not in ('efectivo', 'tarjeta', 'transferencia', 'cheque') then
    raise exception 'Método no válido para un movimiento de caja.' using errcode = 'P0001';
  end if;
  if v_cat = 'deposito' and (p_tipo <> 'egreso' or p_metodo <> 'efectivo') then
    raise exception 'Un depósito al banco es una salida de efectivo de la caja.' using errcode = 'P0001';
  end if;

  insert into public.movimientos_financieros (sistema_id, sede_id, turno_id, tipo, categoria, concepto, monto, metodo, creado_por)
  values (p_sistema, (select sede_id from public.turnos_caja where id = v_turno), v_turno, p_tipo,
    v_cat, p_concepto, p_monto, p_metodo, auth.uid())
  returning * into v_mov;

  perform privado.asentar_movimiento(v_mov);
  return v_mov;
end;
$$;

revoke all on function public.registrar_movimiento(uuid, text, text, numeric, public.metodo_pago, text) from public, anon;
grant execute on function public.registrar_movimiento(uuid, text, text, numeric, public.metodo_pago, text) to authenticated;

-- 5. Conciliación: el depósito de efectivo es una entrada al banco.
create or replace function privado.partidas_banco(p_sistema uuid, p_desde date, p_hasta date)
returns table(tipo text, origen_id uuid, fecha date, monto numeric, metodo text, descripcion text)
language sql
stable
security definer
set search_path = ''
as $$
  select 'cobro_pago', cp.id, (k.creado_en at time zone 'America/Santo_Domingo')::date, cp.monto, cp.metodo::text,
         k.numero || ' · ' || p.nombres || ' ' || p.apellidos
    from public.cobro_pagos cp
    join public.cobros k on k.id = cp.cobro_id
    join public.pacientes p on p.id = k.paciente_id
   where cp.sistema_id = p_sistema and cp.metodo in ('tarjeta', 'transferencia', 'cheque')
     and (k.creado_en at time zone 'America/Santo_Domingo')::date between p_desde and p_hasta
     and not exists (select 1 from public.anulaciones_cobro x where x.cobro_id = k.id)
  union all
  select 'abono', a.id, a.fecha, a.monto, a.metodo::text, a.numero || ' · abono ' || a.deudor
    from public.abonos a
   where a.sistema_id = p_sistema and a.metodo in ('tarjeta', 'transferencia', 'cheque') and a.fecha between p_desde and p_hasta
  union all
  select 'donacion', d.id, d.fecha, d.monto, d.metodo::text, d.numero || ' · donación ' || coalesce(d.donante_nombre, 'anónima')
    from public.donaciones d
   where d.sistema_id = p_sistema and d.metodo in ('tarjeta', 'transferencia', 'cheque') and d.fecha between p_desde and p_hasta
     and not exists (select 1 from public.anulaciones_donacion x where x.donacion_id = d.id)
  union all
  select 'compra', c.id, c.fecha, -c.total, c.forma_pago, c.numero || ' · gasto'
    from public.compras c
   where c.sistema_id = p_sistema and c.forma_pago in ('tarjeta', 'transferencia', 'cheque') and c.fecha between p_desde and p_hasta
     and not exists (select 1 from public.anulaciones_compra x where x.compra_id = c.id)
  union all
  select 'movimiento', m.id, (m.creado_en at time zone 'America/Santo_Domingo')::date, -m.monto, m.metodo::text, m.concepto
    from public.movimientos_financieros m
   where m.sistema_id = p_sistema and m.tipo = 'egreso' and m.metodo in ('tarjeta', 'transferencia', 'cheque')
     and m.categoria not in ('cobro', 'anulacion', 'compra')
     and (m.creado_en at time zone 'America/Santo_Domingo')::date between p_desde and p_hasta
  union all
  -- Depósito: efectivo que sale de la caja y entra al banco (lo marca su asiento, que carga Banco).
  select 'movimiento', m.id, (m.creado_en at time zone 'America/Santo_Domingo')::date, m.monto, 'deposito', m.concepto
    from public.movimientos_financieros m
   where m.sistema_id = p_sistema and m.tipo = 'egreso' and m.metodo = 'efectivo'
     and (m.creado_en at time zone 'America/Santo_Domingo')::date between p_desde and p_hasta
     and exists (select 1 from public.asientos a join public.asiento_lineas l on l.asiento_id = a.id
                  where a.sistema_id = p_sistema and a.origen = 'movimiento' and a.origen_id = m.id
                    and l.cuenta_codigo = privado.cuenta(p_sistema, 'banco') and l.debe > 0);
$$;

-- 6. Asientos de los movimientos manuales que ya existían sin asiento.
--    (Los 5 egresos de FUNBIDE cargados desde el Excel; el "Efectivo separado para depositar" va como depósito.)
do $$
declare
  m public.movimientos_financieros;
begin
  for m in
    select * from public.movimientos_financieros x
     where x.categoria in ('general', 'suministros', 'servicios', 'mantenimiento', 'reembolso', 'otro')
       and x.cobro_id is null
       and not exists (select 1 from public.asientos a where a.sistema_id = x.sistema_id and a.origen_id = x.id)
     order by x.creado_en
  loop
    if m.tipo = 'egreso' and m.metodo = 'efectivo' and m.concepto ilike '%para depositar en el banco%' then
      m.categoria := 'deposito';
    end if;
    perform privado.asentar_movimiento(m);
  end loop;
end $$;
