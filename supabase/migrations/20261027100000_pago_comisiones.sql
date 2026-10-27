-- ============================================================================
-- Pago al médico de una liquidación de comisiones (con su asiento).
--
-- Desde 20261006 la comisión se devenga al cobrar (gasto contra comisiones por
-- pagar + ISR por pagar), pero el pago nunca se registraba: la cuenta de
-- comisiones por pagar solo crecía. Ahora:
--   pagar_liquidacion → egreso de caja/banco (movimientos_financieros, categoría
--   reservada «pago_comision») + asiento: debe comisiones_por_pagar / haber caja o banco.
-- Una liquidación se paga una sola vez (único + candado). El efectivo sale del turno
-- de caja abierto de quien paga, así que cuadra en el arqueo; transferencia y cheque
-- aparecen en la conciliación bancaria como cualquier egreso no en efectivo.
-- ============================================================================

alter table public.movimientos_financieros
  add constraint movimientos_financieros_sistema_id_id_key unique (sistema_id, id);

create table public.pagos_liquidacion (
  id              uuid primary key default gen_random_uuid(),
  sistema_id      uuid not null references public.sistemas(id) on delete restrict,
  liquidacion_id  uuid not null,
  movimiento_id   uuid not null,
  metodo          public.metodo_pago not null,
  monto           numeric(12, 2) not null check (monto > 0),
  referencia      text check (char_length(referencia) <= 120),
  creado_por      uuid not null default auth.uid() references public.perfiles(id),
  creado_en       timestamptz not null default now(),
  unique (sistema_id, liquidacion_id),
  unique (sistema_id, id),
  foreign key (sistema_id, liquidacion_id) references public.liquidaciones_comision (sistema_id, id),
  foreign key (sistema_id, movimiento_id) references public.movimientos_financieros (sistema_id, id)
);
create index ix_fk_pagos_liquidacion_movimiento on public.pagos_liquidacion (sistema_id, movimiento_id);
create index ix_fk_pagos_liquidacion_creado_por on public.pagos_liquidacion (creado_por);

create trigger trg_pagos_liquidacion_append_only before update or delete on public.pagos_liquidacion
  for each row execute function privado.tg_bloquear_append_only();
create trigger trg_pagos_liquidacion_auditoria after insert on public.pagos_liquidacion
  for each row execute function privado.tg_auditar();

alter table public.pagos_liquidacion enable row level security;
-- Misma regla que la liquidación: quien administra comisiones, o el propio médico.
create policy pagos_liquidacion_select on public.pagos_liquidacion for select to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{admin,contabilidad,gerencia,auditor}', 'comisiones'))
         or (sistema_id in (select privado.mis_sistemas())
             and liquidacion_id in (select l.id from public.liquidaciones_comision l where l.beneficiario_id = (select auth.uid()))));
revoke all on public.pagos_liquidacion from anon;
revoke insert, update, delete on public.pagos_liquidacion from authenticated;
grant select on public.pagos_liquidacion to authenticated;

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
    if p_mov.categoria = 'pago_comision' then
      -- Pago de una liquidación: salda la deuda con el médico (el gasto ya se devengó al cobrar).
      v_otra := privado.cuenta(v_s, 'comisiones_por_pagar');
      v_desc := 'Pago de comisiones';
    elsif p_mov.categoria = 'deposito' then
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

create or replace function public.registrar_movimiento(p_sistema uuid, p_tipo text, p_concepto text, p_monto numeric, p_metodo public.metodo_pago default 'efectivo'::public.metodo_pago, p_categoria text default 'general'::text)
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
  if v_cat in ('cobro', 'anulacion', 'compra', 'pago_comision') then
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

create or replace function public.pagar_liquidacion(
  p_sistema uuid, p_liquidacion uuid, p_metodo public.metodo_pago default 'transferencia', p_referencia text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_liq    public.liquidaciones_comision;
  v_mov    public.movimientos_financieros;
  v_turno  uuid;
  v_nombre text;
  v_id     uuid;
begin
  if not privado.tiene_rol(p_sistema, '{admin,contabilidad,gerencia}', 'comisiones') then
    raise exception 'No tienes permiso para pagar comisiones.' using errcode = '42501';
  end if;
  if p_metodo not in ('efectivo', 'transferencia', 'cheque') then
    raise exception 'Paga en efectivo, transferencia o cheque.' using errcode = 'P0001';
  end if;

  -- Una liquidación, un pago: doble clic o dos personas a la vez no pagan dos veces.
  perform pg_advisory_xact_lock(hashtextextended('pago_liquidacion:' || p_liquidacion::text, 0));

  select * into v_liq from public.liquidaciones_comision where id = p_liquidacion and sistema_id = p_sistema;
  if v_liq.id is null then
    raise exception 'La liquidación no existe.' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.pagos_liquidacion where sistema_id = p_sistema and liquidacion_id = p_liquidacion) then
    raise exception 'La liquidación % ya está pagada.', v_liq.numero using errcode = 'P0001';
  end if;
  if coalesce(v_liq.neto, 0) <= 0 then
    raise exception 'La liquidación % no tiene monto a pagar.', v_liq.numero using errcode = 'P0001';
  end if;

  if p_metodo = 'efectivo' then
    v_turno := privado.turno_abierto(p_sistema);
    if v_turno is null then
      raise exception 'Para pagar en efectivo abre tu turno de caja (el dinero sale de ahí).' using errcode = 'P0001';
    end if;
  end if;

  select nombre_completo into v_nombre from public.perfiles where id = v_liq.beneficiario_id;

  insert into public.movimientos_financieros (sistema_id, sede_id, turno_id, tipo, categoria, concepto, monto, metodo, creado_por)
  values (p_sistema, (select sede_id from public.turnos_caja where id = v_turno), v_turno, 'egreso', 'pago_comision',
          left('Pago ' || v_liq.numero || ' · ' || coalesce(v_nombre, 'médico') || coalesce(' · ' || nullif(trim(p_referencia), ''), ''), 300),
          v_liq.neto, p_metodo, auth.uid())
  returning * into v_mov;

  perform privado.asentar_movimiento(v_mov);

  insert into public.pagos_liquidacion (sistema_id, liquidacion_id, movimiento_id, metodo, monto, referencia)
  values (p_sistema, p_liquidacion, v_mov.id, p_metodo, v_liq.neto, nullif(trim(p_referencia), ''))
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'numero', v_liq.numero, 'monto', v_liq.neto, 'metodo', p_metodo, 'movimiento_id', v_mov.id);
end;
$$;

revoke all on function public.pagar_liquidacion(uuid, uuid, public.metodo_pago, text) from public, anon;
grant execute on function public.pagar_liquidacion(uuid, uuid, public.metodo_pago, text) to authenticated;

create or replace function public.plataforma_limpiar_operaciones(p_sistema uuid, p_alcance text[], p_confirmacion text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre   text;
  v_caja     boolean := 'caja' = any (p_alcance);
  v_citas    boolean := 'citas' = any (p_alcance);
  v_hist     boolean := 'historial' = any (p_alcance);
  v_conteos  jsonb;
  v_bloqueos text[] := '{}';
  v_n        bigint;
begin
  if not privado.es_superadmin() then
    raise exception 'Solo la superadministración puede limpiar operaciones.' using errcode = '42501';
  end if;
  if p_alcance is null or cardinality(p_alcance) = 0
     or exists (select 1 from unnest(p_alcance) a where a not in ('caja', 'citas', 'historial')) then
    raise exception 'Alcance inválido: usa caja, citas y/o historial.' using errcode = 'P0001';
  end if;
  select nombre into v_nombre from public.sistemas where id = p_sistema;
  if v_nombre is null then
    raise exception 'El sistema no existe.' using errcode = 'P0002';
  end if;

  -- Qué se borraría ---------------------------------------------------------
  drop table if exists _cobros;
  create temp table _cobros on commit drop as
    select id from public.cobros where v_caja and sistema_id = p_sistema;
  drop table if exists _comisiones;
  create temp table _comisiones on commit drop as
    select id from public.comisiones where sistema_id = p_sistema and cobro_id in (select id from _cobros);
  drop table if exists _liquidaciones;
  create temp table _liquidaciones on commit drop as
    select l.id from public.liquidaciones_comision l
     where l.sistema_id = p_sistema
       and exists (select 1 from public.liquidacion_items i where i.liquidacion_id = l.id and i.comision_id in (select id from _comisiones));
  drop table if exists _asientos;
  create temp table _asientos on commit drop as
    select a.id from public.asientos a
     where a.sistema_id = p_sistema and v_caja
       and (   (a.origen = 'cobro' and a.origen_id in (select id from _cobros))
            or (a.origen in ('anticipo', 'abono'))
            or (a.origen = 'comision' and a.origen_id in (select id from _liquidaciones)) or (a.origen = 'comision' and a.origen_id in (select id from _comisiones)) or (a.origen = 'movimiento'));
  insert into _asientos
    select a.id from public.asientos a
     where a.sistema_id = p_sistema and a.origen = 'reverso' and a.origen_id in (select id from _asientos);

  v_conteos := jsonb_build_object(
    'cobros', (select count(*) from _cobros),
    'anticipos', (select count(*) from public.anticipos where v_caja and sistema_id = p_sistema),
    'abonos', (select count(*) from public.abonos where v_caja and sistema_id = p_sistema),
    'movimientos_caja', (select count(*) from public.movimientos_financieros where v_caja and sistema_id = p_sistema),
    'turnos_caja', (select count(*) from public.turnos_caja where v_caja and sistema_id = p_sistema),
    'comisiones', (select count(*) from _comisiones),
    'liquidaciones', (select count(*) from _liquidaciones),
    'asientos', (select count(*) from _asientos),
    'citas_y_turnos', (select count(*) from public.citas where v_citas and sistema_id = p_sistema),
    'historial', (select count(*) from public.historial_clinico where v_hist and sistema_id = p_sistema)
  );

  -- Cosas que NO se tocan y que impedirían borrar -----------------------------
  if v_caja and exists (select 1 from public.compras where sistema_id = p_sistema and turno_id is not null) then
    v_bloqueos := v_bloqueos || 'Hay compras pagadas desde la caja: se conservan, así que los turnos de caja no se pueden borrar.';
  end if;
  if v_caja and exists (
       select 1 from public.liquidacion_items i
        where i.liquidacion_id in (select id from _liquidaciones) and i.comision_id not in (select id from _comisiones)) then
    v_bloqueos := v_bloqueos || 'Hay liquidaciones de comisiones que mezclan cobros reales y de prueba.';
  end if;
  if v_citas and not v_caja and exists (select 1 from public.cobros where sistema_id = p_sistema and cita_id is not null) then
    v_bloqueos := v_bloqueos || 'Hay cobros ligados a citas: incluye también la caja.';
  end if;
  if v_citas and not v_hist and exists (select 1 from public.historial_clinico where sistema_id = p_sistema and cita_id is not null) then
    v_bloqueos := v_bloqueos || 'Hay notas de historial ligadas a citas: incluye también el historial.';
  end if;

  if p_confirmacion is null or cardinality(v_bloqueos) > 0 then
    return jsonb_build_object('sistema', v_nombre, 'vista_previa', true, 'registros', v_conteos, 'bloqueos', to_jsonb(v_bloqueos));
  end if;
  if trim(p_confirmacion) <> v_nombre then
    raise exception 'Para confirmar, escribe exactamente el nombre del sistema.' using errcode = 'P0001';
  end if;

  -- Ejecutar (orden de dependencias) -----------------------------------------
  perform set_config('medora.eliminando_sistema', p_sistema::text, true);

  if v_caja then
    -- Los pagos cuelgan del movimiento de caja, que en este alcance se borra entero.
    delete from public.pagos_liquidacion where sistema_id = p_sistema;
    delete from public.liquidacion_items where sistema_id = p_sistema and liquidacion_id in (select id from _liquidaciones);
    delete from public.liquidaciones_comision where id in (select id from _liquidaciones);
    delete from public.comisiones where id in (select id from _comisiones);
    delete from public.abonos where sistema_id = p_sistema;
    delete from public.cobro_pagos where sistema_id = p_sistema and cobro_id in (select id from _cobros);
    delete from public.anulaciones_cobro where sistema_id = p_sistema and cobro_id in (select id from _cobros);
    delete from public.movimientos_financieros where sistema_id = p_sistema;
    delete from public.cobro_detalles where sistema_id = p_sistema and cobro_id in (select id from _cobros);
    delete from public.cobros where id in (select id from _cobros);
    delete from public.anticipos where sistema_id = p_sistema;
    delete from public.turnos_caja where sistema_id = p_sistema;
    delete from public.asiento_lineas where sistema_id = p_sistema and asiento_id in (select id from _asientos);
    delete from public.asientos where id in (select id from _asientos);
  end if;
  if v_hist then
    delete from public.historial_clinico where sistema_id = p_sistema;
  end if;
  if v_citas then
    delete from public.citas where sistema_id = p_sistema;
  end if;

  perform set_config('medora.eliminando_sistema', '', true);

  insert into public.auditoria (sistema_id, usuario_id, accion, tabla, cambios)
  values (p_sistema, auth.uid(), 'LIMPIAR_OPERACIONES', 'sistemas',
          jsonb_build_object('alcance', to_jsonb(p_alcance), 'registros', v_conteos));

  return jsonb_build_object('sistema', v_nombre, 'vista_previa', false, 'registros', v_conteos, 'bloqueos', '[]'::jsonb);
end;
$$;

