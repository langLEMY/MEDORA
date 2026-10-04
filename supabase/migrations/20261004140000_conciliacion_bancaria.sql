-- ============================================================================
-- MEDORA . Conciliación bancaria
--
-- Se importa el estado de cuenta del banco (Excel/CSV de Popular, BHD,
-- Banreservas…) y cada movimiento se empareja con lo registrado en MEDORA:
--   + créditos: pagos con tarjeta/transferencia/cheque de cobros, abonos y donaciones
--   − débitos: gastos pagados por banco y egresos no en efectivo
-- Conciliación automática:
--   1) monto exacto con una sola partida posible (±5 días antes, 1 después);
--   2) lote de tarjeta: el banco deposita la suma de un día menos la comisión
--      (hasta 6 %); la diferencia queda como "comisión bancaria".
-- Lo demás se concilia a mano (con ajuste si hay diferencia) y se puede deshacer.
-- Los movimientos del banco son append-only; las conciliaciones son vínculos
-- (no mueven dinero) y se pueden deshacer, quedando en la auditoría.
-- ============================================================================

create table public.cuentas_bancarias (
  id              uuid primary key default gen_random_uuid(),
  sistema_id      uuid not null references public.sistemas(id) on delete restrict,
  banco           text not null check (char_length(banco) between 2 and 60),
  nombre          text not null check (char_length(nombre) between 2 and 80),
  numero          text check (char_length(numero) <= 40),
  activo          boolean not null default true,
  creado_en       timestamptz not null default now(),
  creado_por      uuid default auth.uid(),
  unique (sistema_id, id)
);
create trigger trg_cuentas_bancarias_auditoria after insert or update or delete on public.cuentas_bancarias
  for each row execute function privado.tg_auditar();

create table public.movimientos_bancarios (
  id              uuid primary key default gen_random_uuid(),
  sistema_id      uuid not null references public.sistemas(id) on delete restrict,
  cuenta_id       uuid not null,
  fecha           date not null,
  descripcion     text not null default '',
  referencia      text,
  monto           numeric(14, 2) not null check (monto <> 0),
  huella          text not null,
  creado_por      uuid default auth.uid(),
  creado_en       timestamptz not null default now(),
  unique (sistema_id, id),
  unique (sistema_id, cuenta_id, huella),
  foreign key (sistema_id, cuenta_id) references public.cuentas_bancarias (sistema_id, id)
);
create index ix_mov_bancarios on public.movimientos_bancarios (sistema_id, cuenta_id, fecha desc);
create trigger trg_movimientos_bancarios_append_only before update or delete on public.movimientos_bancarios
  for each row execute function privado.tg_bloquear_append_only();

create table public.conciliaciones_bancarias (
  id              uuid primary key default gen_random_uuid(),
  sistema_id      uuid not null references public.sistemas(id) on delete restrict,
  movimiento_id   uuid not null,
  tipo            text not null check (tipo in ('cobro_pago', 'abono', 'donacion', 'compra', 'movimiento', 'comision', 'otro')),
  origen_id       uuid,
  monto           numeric(14, 2) not null,
  nota            text,
  automatica      boolean not null default false,
  creado_por      uuid default auth.uid(),
  creado_en       timestamptz not null default now(),
  foreign key (sistema_id, movimiento_id) references public.movimientos_bancarios (sistema_id, id),
  check ((tipo in ('comision', 'otro')) = (origen_id is null))
);
create unique index ux_conciliacion_origen on public.conciliaciones_bancarias (tipo, origen_id) where origen_id is not null;
create index ix_conciliacion_mov on public.conciliaciones_bancarias (movimiento_id);
create trigger trg_conciliaciones_bancarias_auditoria after insert or delete on public.conciliaciones_bancarias
  for each row execute function privado.tg_auditar();

alter table public.cuentas_bancarias enable row level security;
alter table public.movimientos_bancarios enable row level security;
alter table public.conciliaciones_bancarias enable row level security;
revoke all on public.cuentas_bancarias, public.movimientos_bancarios, public.conciliaciones_bancarias from anon, authenticated;
grant select on public.cuentas_bancarias, public.movimientos_bancarios, public.conciliaciones_bancarias to authenticated;
create policy cuentas_bancarias_select on public.cuentas_bancarias for select to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{admin,contabilidad,gerencia,auditor}', 'contabilidad')));
create policy movimientos_bancarios_select on public.movimientos_bancarios for select to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{admin,contabilidad,gerencia,auditor}', 'contabilidad')));
create policy conciliaciones_bancarias_select on public.conciliaciones_bancarias for select to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{admin,contabilidad,gerencia,auditor}', 'contabilidad')));

-- ---------------------------------------------------------------------------
-- Partidas de MEDORA que pasan por el banco (no efectivo), con su signo.
-- ---------------------------------------------------------------------------
create or replace function privado.partidas_banco(p_sistema uuid, p_desde date, p_hasta date)
returns table (tipo text, origen_id uuid, fecha date, monto numeric, metodo text, descripcion text)
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
     and (m.creado_en at time zone 'America/Santo_Domingo')::date between p_desde and p_hasta;
$$;
revoke all on function privado.partidas_banco(uuid, date, date) from public;

-- Partidas aún sin conciliar (para la conciliación manual).
create or replace function public.partidas_sin_conciliar(p_sistema uuid, p_desde date, p_hasta date)
returns table (tipo text, origen_id uuid, fecha date, monto numeric, metodo text, descripcion text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not privado.tiene_rol(p_sistema, '{admin,contabilidad,gerencia,auditor}', 'contabilidad') then
    raise exception 'Sin permiso.' using errcode = '42501';
  end if;
  return query
    select pb.* from privado.partidas_banco(p_sistema, p_desde, p_hasta) pb
     where not exists (select 1 from public.conciliaciones_bancarias c where c.tipo = pb.tipo and c.origen_id = pb.origen_id)
     order by pb.fecha, pb.monto;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cuentas e importación del estado de cuenta
-- ---------------------------------------------------------------------------
create or replace function public.guardar_cuenta_bancaria(p_sistema uuid, p_id uuid, p_banco text, p_nombre text, p_numero text, p_activo boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := p_id;
begin
  if not privado.tiene_rol(p_sistema, '{admin,contabilidad}', 'contabilidad') then
    raise exception 'Solo administración o contabilidad gestionan cuentas bancarias.' using errcode = '42501';
  end if;
  if v_id is null then
    insert into public.cuentas_bancarias (sistema_id, banco, nombre, numero)
    values (p_sistema, trim(p_banco), trim(p_nombre), nullif(trim(p_numero), ''))
    returning id into v_id;
  else
    update public.cuentas_bancarias set banco = trim(p_banco), nombre = trim(p_nombre), numero = nullif(trim(p_numero), ''),
           activo = coalesce(p_activo, activo)
     where id = v_id and sistema_id = p_sistema;
  end if;
  return v_id;
end;
$$;

-- p_filas: [{_fila, fecha, descripcion?, referencia?, monto?} o con debito/credito]
create or replace function public.importar_movimientos_bancarios(p_sistema uuid, p_cuenta uuid, p_filas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  f jsonb;
  v_fila text;
  v_fecha date;
  v_monto numeric;
  v_desc text;
  v_ref text;
  v_base text;
  v_vistas jsonb := '{}';
  v_n int;
  v_insertado int;
  c int := 0; a int := 0; o int := 0;
  e text[] := '{}';
begin
  if not privado.tiene_rol(p_sistema, '{admin,contabilidad}', 'contabilidad') then
    raise exception 'Solo administración o contabilidad importan estados de cuenta.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.cuentas_bancarias where id = p_cuenta and sistema_id = p_sistema) then
    raise exception 'Cuenta bancaria no encontrada.' using errcode = 'P0001';
  end if;

  for f in select * from jsonb_array_elements(p_filas) loop
    v_fila := coalesce(f ->> '_fila', '?');
    begin
      v_fecha := (privado.texto(f, 'fecha'))::date;
      v_monto := coalesce(privado.numero(f, 'monto'),
                          coalesce(privado.numero(f, 'credito'), 0) - coalesce(privado.numero(f, 'debito'), 0));
      v_monto := round(v_monto, 2);
      v_desc := coalesce(privado.texto(f, 'descripcion'), '');
      v_ref := privado.texto(f, 'referencia');
      if v_fecha is null or v_monto is null or v_monto = 0 then
        o := o + 1;
        e := e || ('Fila ' || v_fila || ': sin fecha o sin monto, omitida.');
        continue;
      end if;
      -- Huella estable: líneas idénticas del mismo archivo se distinguen por su orden.
      v_base := p_cuenta || '|' || v_fecha || '|' || v_monto || '|' || coalesce(v_ref, '') || '|' || lower(v_desc);
      v_n := coalesce((v_vistas ->> v_base)::int, 0) + 1;
      v_vistas := v_vistas || jsonb_build_object(v_base, v_n);

      insert into public.movimientos_bancarios (sistema_id, cuenta_id, fecha, descripcion, referencia, monto, huella)
      values (p_sistema, p_cuenta, v_fecha, v_desc, v_ref, v_monto, md5(v_base || '|' || v_n))
      on conflict (sistema_id, cuenta_id, huella) do nothing;
      get diagnostics v_insertado = row_count;
      if v_insertado > 0 then c := c + 1; else a := a + 1; end if;
    exception when others then
      o := o + 1;
      e := e || ('Fila ' || v_fila || ': ' || sqlerrm);
    end;
  end loop;
  -- "actualizados" = ya estaban importados (se omiten sin duplicar).
  return privado.resultado_importacion(c, a, o, e);
end;
$$;

-- ---------------------------------------------------------------------------
-- Conciliación
-- ---------------------------------------------------------------------------
create or replace function public.conciliar_automatico(p_sistema uuid, p_cuenta uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.movimientos_bancarios;
  v_cand record;
  v_n int;
  v_dia date;
  v_suma numeric;
  v_dias int;
  v_exactos int := 0;
  v_lotes int := 0;
  v_desde date;
  v_hasta date;
begin
  if not privado.tiene_rol(p_sistema, '{admin,contabilidad}', 'contabilidad') then
    raise exception 'Solo administración o contabilidad concilian.' using errcode = '42501';
  end if;
  select min(fecha) - 10, max(fecha) + 2 into v_desde, v_hasta from public.movimientos_bancarios
   where sistema_id = p_sistema and cuenta_id = p_cuenta;
  if v_desde is null then
    return jsonb_build_object('exactos', 0, 'lotes_tarjeta', 0);
  end if;

  create temporary table if not exists pg_temp.partidas_libres on commit drop as
    select * from privado.partidas_banco(p_sistema, v_desde, v_hasta) pb
     where not exists (select 1 from public.conciliaciones_bancarias c where c.tipo = pb.tipo and c.origen_id = pb.origen_id);

  for m in
    select mb.* from public.movimientos_bancarios mb
     where mb.sistema_id = p_sistema and mb.cuenta_id = p_cuenta
       and not exists (select 1 from public.conciliaciones_bancarias c where c.movimiento_id = mb.id)
     order by mb.fecha, mb.monto
  loop
    -- 1) Monto exacto con una sola partida posible.
    select count(*) into v_n from pg_temp.partidas_libres pl
     where pl.monto = m.monto and pl.fecha between m.fecha - 5 and m.fecha + 1;
    if v_n = 1 then
      select * into v_cand from pg_temp.partidas_libres pl
       where pl.monto = m.monto and pl.fecha between m.fecha - 5 and m.fecha + 1;
      insert into public.conciliaciones_bancarias (sistema_id, movimiento_id, tipo, origen_id, monto, automatica)
      values (p_sistema, m.id, v_cand.tipo, v_cand.origen_id, v_cand.monto, true);
      delete from pg_temp.partidas_libres where tipo = v_cand.tipo and origen_id = v_cand.origen_id;
      v_exactos := v_exactos + 1;
      continue;
    end if;

    -- 2) Lote de tarjeta de un solo día (depósito = suma del día − comisión ≤ 6 %).
    if m.monto > 0 then
      select count(*) into v_dias from (
        select pl.fecha from pg_temp.partidas_libres pl
         where pl.tipo = 'cobro_pago' and pl.metodo = 'tarjeta' and pl.fecha between m.fecha - 4 and m.fecha
         group by pl.fecha
        having m.monto between round(sum(pl.monto) * 0.94, 2) and sum(pl.monto)
      ) x;
      if v_dias = 1 then
        select pl.fecha, sum(pl.monto) into v_dia, v_suma from pg_temp.partidas_libres pl
         where pl.tipo = 'cobro_pago' and pl.metodo = 'tarjeta' and pl.fecha between m.fecha - 4 and m.fecha
         group by pl.fecha
        having m.monto between round(sum(pl.monto) * 0.94, 2) and sum(pl.monto);
        insert into public.conciliaciones_bancarias (sistema_id, movimiento_id, tipo, origen_id, monto, automatica)
        select p_sistema, m.id, pl.tipo, pl.origen_id, pl.monto, true
          from pg_temp.partidas_libres pl
         where pl.tipo = 'cobro_pago' and pl.metodo = 'tarjeta' and pl.fecha = v_dia;
        if v_suma > m.monto then
          insert into public.conciliaciones_bancarias (sistema_id, movimiento_id, tipo, monto, nota, automatica)
          values (p_sistema, m.id, 'comision', m.monto - v_suma, 'Comisión de tarjeta del ' || to_char(v_dia, 'DD/MM/YYYY'), true);
        end if;
        delete from pg_temp.partidas_libres where tipo = 'cobro_pago' and metodo = 'tarjeta' and fecha = v_dia;
        v_lotes := v_lotes + 1;
      end if;
    end if;
  end loop;

  drop table if exists pg_temp.partidas_libres;
  return jsonb_build_object('exactos', v_exactos, 'lotes_tarjeta', v_lotes);
end;
$$;

-- p_partidas: [{tipo, origen_id}]; si no cuadra, la diferencia va como ajuste (comisión u otro) con nota.
create or replace function public.conciliar_manual(p_sistema uuid, p_movimiento uuid, p_partidas jsonb, p_ajuste text, p_nota text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.movimientos_bancarios;
  p jsonb;
  v_part record;
  v_suma numeric := 0;
begin
  if not privado.tiene_rol(p_sistema, '{admin,contabilidad}', 'contabilidad') then
    raise exception 'Solo administración o contabilidad concilian.' using errcode = '42501';
  end if;
  select * into m from public.movimientos_bancarios where id = p_movimiento and sistema_id = p_sistema;
  if m.id is null then
    raise exception 'Movimiento no encontrado.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.conciliaciones_bancarias where movimiento_id = m.id) then
    raise exception 'Ese movimiento ya está conciliado: deshazlo primero.' using errcode = 'P0001';
  end if;

  for p in select * from jsonb_array_elements(coalesce(p_partidas, '[]'::jsonb)) loop
    select * into v_part from privado.partidas_banco(p_sistema, m.fecha - 60, m.fecha + 30) pb
     where pb.tipo = p ->> 'tipo' and pb.origen_id = (p ->> 'origen_id')::uuid;
    if v_part.origen_id is null then
      raise exception 'Una de las partidas no existe o está fuera de fecha.' using errcode = 'P0001';
    end if;
    insert into public.conciliaciones_bancarias (sistema_id, movimiento_id, tipo, origen_id, monto, nota)
    values (p_sistema, m.id, v_part.tipo, v_part.origen_id, v_part.monto, nullif(trim(p_nota), ''));
    v_suma := v_suma + v_part.monto;
  end loop;

  if round(m.monto - v_suma, 2) <> 0 then
    if coalesce(p_ajuste, '') not in ('comision', 'otro') or (p_ajuste = 'otro' and nullif(trim(coalesce(p_nota, '')), '') is null) then
      raise exception 'No cuadra por RD$%: indica si la diferencia es comisión bancaria u otro motivo (con nota).', round(m.monto - v_suma, 2)
        using errcode = 'P0001';
    end if;
    insert into public.conciliaciones_bancarias (sistema_id, movimiento_id, tipo, monto, nota)
    values (p_sistema, m.id, p_ajuste, round(m.monto - v_suma, 2), nullif(trim(p_nota), ''));
  end if;
exception when unique_violation then
  raise exception 'Una de las partidas ya está conciliada con otro movimiento.' using errcode = 'P0001';
end;
$$;

create or replace function public.deshacer_conciliacion(p_sistema uuid, p_movimiento uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not privado.tiene_rol(p_sistema, '{admin,contabilidad}', 'contabilidad') then
    raise exception 'Solo administración o contabilidad concilian.' using errcode = '42501';
  end if;
  delete from public.conciliaciones_bancarias where sistema_id = p_sistema and movimiento_id = p_movimiento;
end;
$$;

revoke all on function public.partidas_sin_conciliar(uuid, date, date) from public, anon;
revoke all on function public.guardar_cuenta_bancaria(uuid, uuid, text, text, text, boolean) from public, anon;
revoke all on function public.importar_movimientos_bancarios(uuid, uuid, jsonb) from public, anon;
revoke all on function public.conciliar_automatico(uuid, uuid) from public, anon;
revoke all on function public.conciliar_manual(uuid, uuid, jsonb, text, text) from public, anon;
revoke all on function public.deshacer_conciliacion(uuid, uuid) from public, anon;
grant execute on function public.partidas_sin_conciliar(uuid, date, date) to authenticated;
grant execute on function public.guardar_cuenta_bancaria(uuid, uuid, text, text, text, boolean) to authenticated;
grant execute on function public.importar_movimientos_bancarios(uuid, uuid, jsonb) to authenticated;
grant execute on function public.conciliar_automatico(uuid, uuid) to authenticated;
grant execute on function public.conciliar_manual(uuid, uuid, jsonb, text, text) to authenticated;
grant execute on function public.deshacer_conciliacion(uuid, uuid) to authenticated;

-- Estado de cada movimiento (para la pantalla): conciliado cuando los vínculos suman su monto.
create or replace view public.movimientos_bancarios_estado
with (security_invoker = true) as
select mb.*, coalesce(c.suma, 0) as conciliado, coalesce(c.n, 0) as vinculos,
       coalesce(c.suma, 0) = mb.monto as cuadrado, coalesce(c.auto, false) as automatica
  from public.movimientos_bancarios mb
  left join lateral (
    select sum(x.monto) as suma, count(*) as n, bool_and(x.automatica) as auto
      from public.conciliaciones_bancarias x where x.movimiento_id = mb.id
  ) c on true;
revoke all on public.movimientos_bancarios_estado from anon;
grant select on public.movimientos_bancarios_estado to authenticated;
