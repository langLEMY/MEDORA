-- ============================================================================
-- MEDORA · 0003 · Caja, cobros, movimientos financieros e inventario
--
-- Los registros de dinero son append-only (como Cobro/MovimientoFinanciero en
-- FUNBIDE): no se editan ni se borran. Un cobro se anula con una fila en
-- anulaciones_cobro + un egreso compensatorio. Las escrituras de caja pasan por
-- funciones RPC transaccionales que calculan los totales en el servidor: el
-- cliente nunca envía un "total" en el que haya que confiar.
-- ============================================================================

create type public.metodo_pago as enum ('efectivo', 'tarjeta', 'transferencia', 'cheque', 'seguro', 'otro');

-- Turnos de caja -------------------------------------------------------------
create table public.turnos_caja (
  id               uuid primary key default gen_random_uuid(),
  sistema_id       uuid not null references public.sistemas(id) on delete restrict,
  sede_id          uuid,
  cajero_id        uuid not null default auth.uid(),
  estado           text not null default 'abierto' check (estado in ('abierto', 'cerrado')),
  abierto_en       timestamptz not null default now(),
  monto_apertura   numeric(12, 2) not null default 0 check (monto_apertura >= 0),
  cerrado_en       timestamptz,
  monto_esperado   numeric(12, 2),
  monto_declarado  numeric(12, 2),
  notas_cierre     text,
  unique (sistema_id, id),
  foreign key (sistema_id, sede_id) references public.sedes (sistema_id, id),
  foreign key (sistema_id, cajero_id) references public.membresias (sistema_id, usuario_id)
);
create unique index ux_turno_abierto_por_cajero on public.turnos_caja (sistema_id, cajero_id)
  where estado = 'abierto';
create index ix_turnos_sistema_abierto on public.turnos_caja (sistema_id, abierto_en desc);

-- Cobros (append-only) -------------------------------------------------------
create table public.cobros (
  id                  uuid primary key default gen_random_uuid(),
  sistema_id          uuid not null references public.sistemas(id) on delete restrict,
  sede_id             uuid,
  turno_id            uuid not null,
  paciente_id         uuid not null,
  cita_id             uuid,
  numero              text not null,
  subtotal            numeric(12, 2) not null check (subtotal >= 0),
  cobertura_seguro    numeric(12, 2) not null default 0 check (cobertura_seguro >= 0),
  descuento           numeric(12, 2) not null default 0 check (descuento >= 0),
  total               numeric(12, 2) not null check (total >= 0),
  metodo              public.metodo_pago not null,
  aseguradora_id      uuid,
  numero_autorizacion text,
  referencia          text,
  notas               text,
  cajero_id           uuid not null default auth.uid(),
  creado_en           timestamptz not null default now(),
  unique (sistema_id, numero),
  unique (sistema_id, id),
  foreign key (sistema_id, sede_id) references public.sedes (sistema_id, id),
  foreign key (sistema_id, turno_id) references public.turnos_caja (sistema_id, id),
  foreign key (sistema_id, paciente_id) references public.pacientes (sistema_id, id),
  foreign key (sistema_id, cita_id) references public.citas (sistema_id, id),
  foreign key (sistema_id, aseguradora_id) references public.aseguradoras (sistema_id, id)
);
create index ix_cobros_sistema_fecha on public.cobros (sistema_id, creado_en desc);
create index ix_cobros_paciente on public.cobros (paciente_id, creado_en desc);
create index ix_cobros_turno on public.cobros (turno_id);

create table public.cobro_detalles (
  id               uuid primary key default gen_random_uuid(),
  sistema_id       uuid not null references public.sistemas(id) on delete restrict,
  cobro_id         uuid not null,
  servicio_id      uuid,
  descripcion      text not null,
  cantidad         numeric(10, 2) not null check (cantidad > 0),
  precio_unitario  numeric(12, 2) not null check (precio_unitario >= 0),
  cobertura        numeric(12, 2) not null default 0 check (cobertura >= 0),
  total            numeric(12, 2) not null check (total >= 0),
  foreign key (sistema_id, cobro_id) references public.cobros (sistema_id, id),
  foreign key (sistema_id, servicio_id) references public.servicios (sistema_id, id)
);
create index ix_cobro_detalles_cobro on public.cobro_detalles (cobro_id);

create table public.anulaciones_cobro (
  id          uuid primary key default gen_random_uuid(),
  sistema_id  uuid not null references public.sistemas(id) on delete restrict,
  cobro_id    uuid not null unique,
  motivo      text not null check (char_length(motivo) between 5 and 500),
  anulado_por uuid not null default auth.uid(),
  creado_en   timestamptz not null default now(),
  foreign key (sistema_id, cobro_id) references public.cobros (sistema_id, id)
);

-- Movimientos financieros (append-only) --------------------------------------
create table public.movimientos_financieros (
  id           uuid primary key default gen_random_uuid(),
  sistema_id   uuid not null references public.sistemas(id) on delete restrict,
  sede_id      uuid,
  turno_id     uuid,
  tipo         text not null check (tipo in ('ingreso', 'egreso')),
  categoria    text not null default 'general',
  concepto     text not null check (char_length(concepto) between 2 and 300),
  monto        numeric(12, 2) not null check (monto > 0),
  metodo       public.metodo_pago not null default 'efectivo',
  cobro_id     uuid,
  creado_por   uuid not null default auth.uid(),
  creado_en    timestamptz not null default now(),
  foreign key (sistema_id, sede_id) references public.sedes (sistema_id, id),
  foreign key (sistema_id, turno_id) references public.turnos_caja (sistema_id, id),
  foreign key (sistema_id, cobro_id) references public.cobros (sistema_id, id)
);
create index ix_movimientos_sistema_fecha on public.movimientos_financieros (sistema_id, creado_en desc);
create index ix_movimientos_turno on public.movimientos_financieros (turno_id);

create trigger trg_cobros_append_only before update or delete on public.cobros
  for each row execute function privado.tg_bloquear_append_only();
create trigger trg_cobro_detalles_append_only before update or delete on public.cobro_detalles
  for each row execute function privado.tg_bloquear_append_only();
create trigger trg_anulaciones_append_only before update or delete on public.anulaciones_cobro
  for each row execute function privado.tg_bloquear_append_only();
create trigger trg_movimientos_append_only before update or delete on public.movimientos_financieros
  for each row execute function privado.tg_bloquear_append_only();

-- Inventario -----------------------------------------------------------------
create table public.inventario_items (
  id               uuid primary key default gen_random_uuid(),
  sistema_id       uuid not null references public.sistemas(id) on delete restrict,
  sede_id          uuid,
  codigo           text,
  nombre           text not null check (char_length(nombre) between 2 and 160),
  descripcion      text,
  categoria        text not null default 'medicamento'
                   check (categoria in ('medicamento', 'insumo', 'reactivo', 'equipo', 'otro')),
  unidad           text not null default 'unidad',
  stock_actual     numeric(12, 2) not null default 0 check (stock_actual >= 0),
  stock_minimo     numeric(12, 2) not null default 0 check (stock_minimo >= 0),
  costo_unitario   numeric(12, 2) check (costo_unitario >= 0),
  precio_venta     numeric(12, 2) check (precio_venta >= 0),
  requiere_receta  boolean not null default false,
  activo           boolean not null default true,
  creado_en        timestamptz not null default now(),
  creado_por       uuid default auth.uid(),
  actualizado_en   timestamptz not null default now(),
  actualizado_por  uuid,
  unique (sistema_id, id),
  foreign key (sistema_id, sede_id) references public.sedes (sistema_id, id)
);
create unique index ux_inventario_codigo on public.inventario_items (sistema_id, codigo) where codigo is not null;
create index ix_inventario_sistema_nombre on public.inventario_items (sistema_id, nombre);

create trigger trg_inventario_actualizacion before update on public.inventario_items
  for each row execute function privado.tg_marcar_actualizacion();

-- El stock inicial siempre es 0: solo cambia con movimientos (trazabilidad).
create or replace function privado.tg_stock_inicial_cero()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.stock_actual := 0;
  return new;
end;
$$;
create trigger trg_inventario_stock_inicial before insert on public.inventario_items
  for each row execute function privado.tg_stock_inicial_cero();

create table public.movimientos_inventario (
  id           uuid primary key default gen_random_uuid(),
  sistema_id   uuid not null references public.sistemas(id) on delete restrict,
  item_id      uuid not null,
  tipo         text not null check (tipo in ('entrada', 'salida', 'ajuste')),
  -- Entradas/salidas: cantidad positiva. Ajustes: delta con signo.
  cantidad     numeric(12, 2) not null check (cantidad <> 0),
  lote         text,
  vence_en     date,
  motivo       text,
  paciente_id  uuid,
  creado_por   uuid not null default auth.uid(),
  creado_en    timestamptz not null default now(),
  check (tipo = 'ajuste' or cantidad > 0),
  foreign key (sistema_id, item_id) references public.inventario_items (sistema_id, id),
  foreign key (sistema_id, paciente_id) references public.pacientes (sistema_id, id)
);
create index ix_mov_inventario_item on public.movimientos_inventario (item_id, creado_en desc);

create trigger trg_mov_inventario_append_only before update or delete on public.movimientos_inventario
  for each row execute function privado.tg_bloquear_append_only();

create or replace function privado.tg_aplicar_movimiento_inventario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delta numeric := case new.tipo when 'salida' then -new.cantidad else new.cantidad end;
begin
  update public.inventario_items
     set stock_actual = stock_actual + v_delta
   where id = new.item_id;
  return new;
exception when check_violation then
  raise exception 'Stock insuficiente para registrar la salida.' using errcode = 'P0001';
end;
$$;
create trigger trg_mov_inventario_aplicar after insert on public.movimientos_inventario
  for each row execute function privado.tg_aplicar_movimiento_inventario();

-- RLS ------------------------------------------------------------------------
alter table public.turnos_caja             enable row level security;
alter table public.cobros                  enable row level security;
alter table public.cobro_detalles          enable row level security;
alter table public.anulaciones_cobro       enable row level security;
alter table public.movimientos_financieros enable row level security;
alter table public.inventario_items        enable row level security;
alter table public.movimientos_inventario  enable row level security;

-- Finanzas: lectura para caja, admin y auditoría. Sin políticas de escritura:
-- todo pasa por las RPC de abajo (security definer, validan rol y turno).
create policy turnos_select on public.turnos_caja for select to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{caja,admin,auditor}')));
create policy cobros_select on public.cobros for select to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{caja,admin,auditor}')));
create policy cobro_detalles_select on public.cobro_detalles for select to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{caja,admin,auditor}')));
create policy anulaciones_select on public.anulaciones_cobro for select to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{caja,admin,auditor}')));
create policy movimientos_select on public.movimientos_financieros for select to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{caja,admin,auditor}')));

-- Inventario.
create policy inventario_select on public.inventario_items for select to authenticated
  using (sistema_id in (select privado.mis_sistemas()));
create policy inventario_insert on public.inventario_items for insert to authenticated
  with check (sistema_id in (select privado.mis_sistemas_con_rol('{farmacia,admin}')));
create policy inventario_update on public.inventario_items for update to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{farmacia,admin}')))
  with check (sistema_id in (select privado.mis_sistemas_con_rol('{farmacia,admin}')));

create policy mov_inventario_select on public.movimientos_inventario for select to authenticated
  using (sistema_id in (select privado.mis_sistemas()));
create policy mov_inventario_insert on public.movimientos_inventario for insert to authenticated
  with check (
    sistema_id in (select privado.mis_sistemas_con_rol('{farmacia,admin,enfermeria}'))
    and creado_por = (select auth.uid())
    and (tipo <> 'ajuste' or sistema_id in (select privado.mis_sistemas_con_rol('{farmacia,admin}')))
  );

revoke all on public.turnos_caja, public.cobros, public.cobro_detalles, public.anulaciones_cobro,
  public.movimientos_financieros, public.inventario_items, public.movimientos_inventario from anon;
revoke insert, update, delete, truncate on public.turnos_caja, public.cobros, public.cobro_detalles,
  public.anulaciones_cobro, public.movimientos_financieros from authenticated;
revoke update, delete, truncate on public.movimientos_inventario from authenticated;
revoke delete, update on public.inventario_items from authenticated;
grant update (sede_id, codigo, nombre, descripcion, categoria, unidad, stock_minimo, costo_unitario,
  precio_venta, requiere_receta, activo) on public.inventario_items to authenticated;

-- ---------------------------------------------------------------------------
-- RPC de caja
-- ---------------------------------------------------------------------------
create or replace function public.abrir_turno_caja(p_sistema uuid, p_monto_apertura numeric, p_sede uuid default null)
returns public.turnos_caja
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno public.turnos_caja;
begin
  if not privado.tiene_rol(p_sistema, '{caja,admin}') then
    raise exception 'No tienes permiso para operar caja en este sistema.' using errcode = '42501';
  end if;

  insert into public.turnos_caja (sistema_id, sede_id, cajero_id, monto_apertura)
  values (p_sistema, p_sede, auth.uid(), coalesce(p_monto_apertura, 0))
  returning * into v_turno;
  return v_turno;
exception when unique_violation then
  raise exception 'Ya tienes un turno de caja abierto.' using errcode = 'P0001';
end;
$$;

create or replace function privado.turno_abierto(p_sistema uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.id from public.turnos_caja t
  where t.sistema_id = p_sistema and t.cajero_id = auth.uid() and t.estado = 'abierto'
  limit 1;
$$;

create or replace function public.registrar_cobro(
  p_sistema        uuid,
  p_paciente       uuid,
  p_items          jsonb,
  p_metodo         public.metodo_pago,
  p_aseguradora    uuid default null,
  p_autorizacion   text default null,
  p_descuento      numeric default 0,
  p_cita           uuid default null,
  p_referencia     text default null,
  p_notas          text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno       public.turnos_caja;
  v_cobro_id    uuid := gen_random_uuid();
  v_numero      text;
  v_item        jsonb;
  v_servicio    public.servicios;
  v_cantidad    numeric;
  v_precio      numeric;
  v_cubierto    numeric;
  v_linea       numeric;
  v_subtotal    numeric := 0;
  v_cobertura   numeric := 0;
  v_total       numeric;
  v_detalles    jsonb := '[]'::jsonb;
begin
  if not privado.tiene_rol(p_sistema, '{caja,admin}') then
    raise exception 'No tienes permiso para registrar cobros en este sistema.' using errcode = '42501';
  end if;

  select * into v_turno from public.turnos_caja
   where id = privado.turno_abierto(p_sistema);
  if v_turno.id is null then
    raise exception 'Abre un turno de caja antes de registrar cobros.' using errcode = 'P0001';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El cobro necesita al menos un concepto.' using errcode = 'P0001';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_cantidad := coalesce((v_item ->> 'cantidad')::numeric, 1);
    if v_cantidad <= 0 then
      raise exception 'Cantidad inválida.' using errcode = 'P0001';
    end if;

    v_servicio := null;
    if v_item ? 'servicio_id' and (v_item ->> 'servicio_id') is not null then
      select * into v_servicio from public.servicios
       where id = (v_item ->> 'servicio_id')::uuid and sistema_id = p_sistema;
      if v_servicio.id is null then
        raise exception 'Servicio no encontrado en este sistema.' using errcode = 'P0001';
      end if;
      -- El precio sale del catálogo, no del cliente.
      v_precio := v_servicio.precio;
    else
      v_precio := coalesce((v_item ->> 'precio_unitario')::numeric, 0);
      if v_precio < 0 then
        raise exception 'Precio inválido.' using errcode = 'P0001';
      end if;
    end if;

    v_cubierto := 0;
    if p_aseguradora is not null and v_servicio.id is not null then
      select least(c.monto_cubierto, v_precio) * v_cantidad into v_cubierto
        from public.coberturas c
       where c.aseguradora_id = p_aseguradora and c.servicio_id = v_servicio.id;
      v_cubierto := coalesce(v_cubierto, 0);
    end if;

    v_linea := round(v_precio * v_cantidad, 2);
    v_subtotal := v_subtotal + v_linea;
    v_cobertura := v_cobertura + v_cubierto;

    v_detalles := v_detalles || jsonb_build_object(
      'servicio_id', v_servicio.id,
      'descripcion', coalesce(v_servicio.nombre, nullif(trim(v_item ->> 'descripcion'), ''), 'Concepto'),
      'cantidad', v_cantidad,
      'precio_unitario', v_precio,
      'cobertura', v_cubierto,
      'total', v_linea - v_cubierto
    );
  end loop;

  v_total := v_subtotal - v_cobertura - coalesce(p_descuento, 0);
  if v_total < 0 then
    raise exception 'El descuento supera el monto a pagar.' using errcode = 'P0001';
  end if;

  v_numero := 'REC-' || lpad(privado.siguiente_numero(p_sistema, 'recibo')::text, 7, '0');

  insert into public.cobros (id, sistema_id, sede_id, turno_id, paciente_id, cita_id, numero, subtotal,
    cobertura_seguro, descuento, total, metodo, aseguradora_id, numero_autorizacion, referencia, notas, cajero_id)
  values (v_cobro_id, p_sistema, v_turno.sede_id, v_turno.id, p_paciente, p_cita, v_numero, v_subtotal,
    v_cobertura, coalesce(p_descuento, 0), v_total, p_metodo, p_aseguradora, p_autorizacion, p_referencia, p_notas, auth.uid());

  insert into public.cobro_detalles (sistema_id, cobro_id, servicio_id, descripcion, cantidad, precio_unitario, cobertura, total)
  select p_sistema, v_cobro_id, (d ->> 'servicio_id')::uuid, d ->> 'descripcion', (d ->> 'cantidad')::numeric,
         (d ->> 'precio_unitario')::numeric, (d ->> 'cobertura')::numeric, (d ->> 'total')::numeric
    from jsonb_array_elements(v_detalles) d;

  if v_total > 0 then
    insert into public.movimientos_financieros (sistema_id, sede_id, turno_id, tipo, categoria, concepto, monto, metodo, cobro_id, creado_por)
    values (p_sistema, v_turno.sede_id, v_turno.id, 'ingreso', 'cobro', 'Cobro ' || v_numero, v_total, p_metodo, v_cobro_id, auth.uid());
  end if;

  if p_cita is not null then
    update public.citas set estado = 'completada', atendida_en = coalesce(atendida_en, now())
     where id = p_cita and sistema_id = p_sistema and estado in ('en_consulta', 'en_espera');
  end if;

  return jsonb_build_object('id', v_cobro_id, 'numero', v_numero, 'subtotal', v_subtotal,
    'cobertura', v_cobertura, 'total', v_total);
end;
$$;

create or replace function public.anular_cobro(p_cobro uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cobro public.cobros;
begin
  select * into v_cobro from public.cobros where id = p_cobro;
  if v_cobro.id is null or not privado.tiene_rol(v_cobro.sistema_id, '{caja,admin}') then
    raise exception 'Cobro no encontrado o sin permiso.' using errcode = '42501';
  end if;

  insert into public.anulaciones_cobro (sistema_id, cobro_id, motivo, anulado_por)
  values (v_cobro.sistema_id, v_cobro.id, p_motivo, auth.uid());

  if v_cobro.total > 0 then
    insert into public.movimientos_financieros (sistema_id, sede_id, turno_id, tipo, categoria, concepto, monto, metodo, cobro_id, creado_por)
    values (v_cobro.sistema_id, v_cobro.sede_id, privado.turno_abierto(v_cobro.sistema_id), 'egreso', 'anulacion',
      'Anulación ' || v_cobro.numero, v_cobro.total, v_cobro.metodo, v_cobro.id, auth.uid());
  end if;
exception when unique_violation then
  raise exception 'Ese cobro ya fue anulado.' using errcode = 'P0001';
end;
$$;

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
begin
  if not privado.tiene_rol(p_sistema, '{caja,admin}') then
    raise exception 'No tienes permiso para registrar movimientos.' using errcode = '42501';
  end if;
  if p_categoria in ('cobro', 'anulacion') then
    raise exception 'Categoría reservada.' using errcode = 'P0001';
  end if;

  insert into public.movimientos_financieros (sistema_id, sede_id, turno_id, tipo, categoria, concepto, monto, metodo, creado_por)
  values (p_sistema, (select sede_id from public.turnos_caja where id = v_turno), v_turno, p_tipo,
    coalesce(nullif(trim(p_categoria), ''), 'general'), p_concepto, p_monto, p_metodo, auth.uid())
  returning * into v_mov;
  return v_mov;
end;
$$;

create or replace function public.cerrar_turno_caja(p_turno uuid, p_monto_declarado numeric, p_notas text default null)
returns public.turnos_caja
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno public.turnos_caja;
  v_esperado numeric;
begin
  select * into v_turno from public.turnos_caja where id = p_turno for update;
  if v_turno.id is null
     or not (v_turno.cajero_id = auth.uid() or privado.tiene_rol(v_turno.sistema_id, '{admin}')) then
    raise exception 'Turno no encontrado o sin permiso.' using errcode = '42501';
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
         monto_declarado = p_monto_declarado, notas_cierre = p_notas
   where id = v_turno.id
  returning * into v_turno;
  return v_turno;
end;
$$;

revoke all on function public.abrir_turno_caja(uuid, numeric, uuid) from public, anon;
revoke all on function public.registrar_cobro(uuid, uuid, jsonb, public.metodo_pago, uuid, text, numeric, uuid, text, text) from public, anon;
revoke all on function public.anular_cobro(uuid, text) from public, anon;
revoke all on function public.registrar_movimiento(uuid, text, text, numeric, public.metodo_pago, text) from public, anon;
revoke all on function public.cerrar_turno_caja(uuid, numeric, text) from public, anon;
revoke all on function privado.turno_abierto(uuid) from public, anon;
grant execute on function public.abrir_turno_caja(uuid, numeric, uuid) to authenticated;
grant execute on function public.registrar_cobro(uuid, uuid, jsonb, public.metodo_pago, uuid, text, numeric, uuid, text, text) to authenticated;
grant execute on function public.anular_cobro(uuid, text) to authenticated;
grant execute on function public.registrar_movimiento(uuid, text, text, numeric, public.metodo_pago, text) to authenticated;
grant execute on function public.cerrar_turno_caja(uuid, numeric, text) to authenticated;
grant execute on function privado.turno_abierto(uuid) to authenticated;
