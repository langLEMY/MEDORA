-- ============================================================================
-- MEDORA · 0011 · Facturación, pagos combinados, anticipos, CxC y comisiones
--
-- - NCF (comprobantes fiscales DGII) por secuencias autorizadas.
-- - Un cobro admite varios pagos, sin repetir método (unique cobro+método).
--   Lo que no se paga queda a crédito (CxC paciente); la cobertura del seguro
--   queda como CxC a la aseguradora.
-- - Anticipos del paciente (aplicables luego como método "anticipo") y abonos a
--   cuentas por cobrar, ambos con fecha registrable hacia atrás.
-- - Cada cobro genera su asiento con el ingreso separado por categoría de
--   servicio, y sus comisiones según reglas.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Comprobantes fiscales (NCF)
-- ---------------------------------------------------------------------------
create table public.secuencias_ncf (
  id          uuid primary key default gen_random_uuid(),
  sistema_id  uuid not null references public.sistemas(id) on delete restrict,
  tipo        text not null check (tipo in ('B01', 'B02', 'B14', 'B15')),
  desde       bigint not null check (desde >= 1),
  hasta       bigint not null,
  siguiente   bigint not null,
  vence_en    date,
  activo      boolean not null default true,
  creado_en   timestamptz not null default now(),
  creado_por  uuid default auth.uid(),
  actualizado_en  timestamptz not null default now(),
  actualizado_por uuid,
  check (hasta >= desde and siguiente between desde and hasta + 1 and hasta <= 99999999)
);
create unique index ux_ncf_activa on public.secuencias_ncf (sistema_id, tipo) where activo;
create trigger trg_ncf_actualizacion before update on public.secuencias_ncf
  for each row execute function privado.tg_marcar_actualizacion();
create trigger trg_secuencias_ncf_auditoria after insert or update or delete on public.secuencias_ncf
  for each row execute function privado.tg_auditar();

create or replace function privado.siguiente_ncf(p_sistema uuid, p_tipo text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.secuencias_ncf;
begin
  select * into s from public.secuencias_ncf where sistema_id = p_sistema and tipo = p_tipo and activo for update;
  if s.id is null then
    raise exception 'No hay una secuencia de NCF % activa (Contabilidad → Comprobantes fiscales).', p_tipo using errcode = 'P0001';
  end if;
  if s.siguiente > s.hasta then
    raise exception 'La secuencia de NCF % se agotó. Registra el nuevo rango autorizado por la DGII.', p_tipo using errcode = 'P0001';
  end if;
  if s.vence_en is not null and s.vence_en < current_date then
    raise exception 'La secuencia de NCF % venció el %.', p_tipo, s.vence_en using errcode = 'P0001';
  end if;
  update public.secuencias_ncf set siguiente = siguiente + 1 where id = s.id;
  return p_tipo || lpad(s.siguiente::text, 8, '0');
end;
$$;

-- ---------------------------------------------------------------------------
-- Cobros: nuevas columnas
-- ---------------------------------------------------------------------------
alter table public.cobros
  add column tipo_ncf       text check (tipo_ncf in ('B01', 'B02', 'B14', 'B15')),
  add column ncf            text,
  add column cliente_rnc    text,
  add column cliente_nombre text,
  add column profesional_id uuid,
  add column vendedor_id    uuid,
  add column monto_credito  numeric(12, 2) not null default 0 check (monto_credito >= 0),
  add constraint cobros_profesional_fk foreign key (sistema_id, profesional_id) references public.membresias (sistema_id, usuario_id),
  add constraint cobros_vendedor_fk foreign key (sistema_id, vendedor_id) references public.membresias (sistema_id, usuario_id),
  add constraint cobros_profesional_perfil_fk foreign key (profesional_id) references public.perfiles(id),
  add constraint cobros_vendedor_perfil_fk foreign key (vendedor_id) references public.perfiles(id);
create unique index ux_cobros_ncf on public.cobros (sistema_id, ncf) where ncf is not null;
create index ix_fk_cobros_profesional on public.cobros (sistema_id, profesional_id);
create index ix_fk_cobros_vendedor on public.cobros (sistema_id, vendedor_id);
create index ix_fk_cobros_profesional_perfil on public.cobros (profesional_id);
create index ix_fk_cobros_vendedor_perfil on public.cobros (vendedor_id);

alter table public.cobro_detalles add column categoria text not null default 'otro';
alter table public.cobro_detalles add constraint cobro_detalles_sistema_id_unique unique (sistema_id, id);

-- Pagos de un cobro (append-only). Sin repetir método dentro del mismo cobro.
create table public.cobro_pagos (
  id          uuid primary key default gen_random_uuid(),
  sistema_id  uuid not null references public.sistemas(id) on delete restrict,
  cobro_id    uuid not null,
  metodo      public.metodo_pago not null check (metodo not in ('credito', 'seguro')),
  monto       numeric(12, 2) not null check (monto > 0),
  referencia  text,
  unique (cobro_id, metodo),
  foreign key (sistema_id, cobro_id) references public.cobros (sistema_id, id)
);
create index ix_fk_cobro_pagos_cobro on public.cobro_pagos (sistema_id, cobro_id);
create trigger trg_cobro_pagos_append_only before update or delete on public.cobro_pagos
  for each row execute function privado.tg_bloquear_append_only();

-- Anticipos (append-only) -------------------------------------------------
create table public.anticipos (
  id          uuid primary key default gen_random_uuid(),
  sistema_id  uuid not null references public.sistemas(id) on delete restrict,
  numero      text not null,
  paciente_id uuid not null,
  monto       numeric(12, 2) not null check (monto > 0),
  metodo      public.metodo_pago not null check (metodo not in ('credito', 'seguro', 'anticipo')),
  referencia  text,
  fecha       date not null default current_date check (fecha <= current_date),
  notas       text,
  turno_id    uuid,
  creado_por  uuid not null default auth.uid() references public.perfiles(id),
  creado_en   timestamptz not null default now(),
  unique (sistema_id, numero),
  foreign key (sistema_id, paciente_id) references public.pacientes (sistema_id, id),
  foreign key (sistema_id, turno_id) references public.turnos_caja (sistema_id, id)
);
create index ix_anticipos_paciente on public.anticipos (sistema_id, paciente_id);
create index ix_fk_anticipos_turno on public.anticipos (sistema_id, turno_id);
create index ix_fk_anticipos_creado_por on public.anticipos (creado_por);
create trigger trg_anticipos_append_only before update or delete on public.anticipos
  for each row execute function privado.tg_bloquear_append_only();
create trigger trg_anticipos_auditoria after insert on public.anticipos
  for each row execute function privado.tg_auditar();

-- Abonos a cuentas por cobrar (append-only) --------------------------------
create table public.abonos (
  id          uuid primary key default gen_random_uuid(),
  sistema_id  uuid not null references public.sistemas(id) on delete restrict,
  numero      text not null,
  cobro_id    uuid not null,
  deudor      text not null check (deudor in ('paciente', 'aseguradora')),
  monto       numeric(12, 2) not null check (monto > 0),
  metodo      public.metodo_pago not null check (metodo not in ('credito', 'seguro', 'anticipo')),
  referencia  text,
  fecha       date not null default current_date check (fecha <= current_date),
  turno_id    uuid,
  creado_por  uuid not null default auth.uid() references public.perfiles(id),
  creado_en   timestamptz not null default now(),
  unique (sistema_id, numero),
  foreign key (sistema_id, cobro_id) references public.cobros (sistema_id, id),
  foreign key (sistema_id, turno_id) references public.turnos_caja (sistema_id, id)
);
create index ix_abonos_cobro on public.abonos (sistema_id, cobro_id);
create index ix_fk_abonos_turno on public.abonos (sistema_id, turno_id);
create index ix_fk_abonos_creado_por on public.abonos (creado_por);
create trigger trg_abonos_append_only before update or delete on public.abonos
  for each row execute function privado.tg_bloquear_append_only();
create trigger trg_abonos_auditoria after insert on public.abonos
  for each row execute function privado.tg_auditar();

-- Saldos --------------------------------------------------------------------
create or replace function privado.saldo_anticipo(p_sistema uuid, p_paciente uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select sum(monto) from public.anticipos where sistema_id = p_sistema and paciente_id = p_paciente), 0)
       - coalesce((select sum(cp.monto)
                     from public.cobro_pagos cp
                     join public.cobros c on c.id = cp.cobro_id
                    where c.sistema_id = p_sistema and c.paciente_id = p_paciente and cp.metodo = 'anticipo'
                      and not exists (select 1 from public.anulaciones_cobro x where x.cobro_id = c.id)), 0);
$$;

create view public.saldos_anticipo with (security_invoker = true) as
select a.sistema_id, a.paciente_id,
       sum(a.monto) as anticipado,
       coalesce((select sum(cp.monto)
                   from public.cobro_pagos cp
                   join public.cobros c on c.id = cp.cobro_id
                  where c.sistema_id = a.sistema_id and c.paciente_id = a.paciente_id and cp.metodo = 'anticipo'
                    and not exists (select 1 from public.anulaciones_cobro x where x.cobro_id = c.id)), 0) as aplicado
  from public.anticipos a
 group by a.sistema_id, a.paciente_id;

create view public.cuentas_por_cobrar with (security_invoker = true) as
select c.id as cobro_id, c.sistema_id, c.numero, c.ncf, c.creado_en, c.paciente_id, c.aseguradora_id, c.numero_autorizacion,
       c.monto_credito, c.cobertura_seguro,
       c.monto_credito - coalesce((select sum(b.monto) from public.abonos b where b.cobro_id = c.id and b.deudor = 'paciente'), 0)
         as pendiente_paciente,
       c.cobertura_seguro - coalesce((select sum(b.monto) from public.abonos b where b.cobro_id = c.id and b.deudor = 'aseguradora'), 0)
         as pendiente_aseguradora
  from public.cobros c
 where (c.monto_credito > 0 or c.cobertura_seguro > 0)
   and not exists (select 1 from public.anulaciones_cobro x where x.cobro_id = c.id);

-- ---------------------------------------------------------------------------
-- Comisiones
-- ---------------------------------------------------------------------------
create table public.reglas_comision (
  id              uuid primary key default gen_random_uuid(),
  sistema_id      uuid not null references public.sistemas(id) on delete restrict,
  nombre          text not null check (char_length(nombre) between 2 and 120),
  aplica_a        text not null default 'profesional' check (aplica_a in ('profesional', 'vendedor')),
  beneficiario_id uuid,
  rol             public.rol_sistema,
  servicio_id     uuid,
  categoria       text,
  tipo            text not null check (tipo in ('porcentaje', 'fijo')),
  valor           numeric(12, 2) not null check (valor > 0),
  base            text not null default 'bruto' check (base in ('bruto', 'neto')),
  vigente_desde   date,
  vigente_hasta   date,
  activo          boolean not null default true,
  creado_en       timestamptz not null default now(),
  creado_por      uuid default auth.uid(),
  actualizado_en  timestamptz not null default now(),
  actualizado_por uuid,
  check (beneficiario_id is not null or rol is not null),
  check (tipo = 'fijo' or valor <= 100),
  foreign key (sistema_id, beneficiario_id) references public.membresias (sistema_id, usuario_id),
  foreign key (sistema_id, servicio_id) references public.servicios (sistema_id, id)
);
create index ix_reglas_sistema on public.reglas_comision (sistema_id) where activo;
create index ix_fk_reglas_beneficiario on public.reglas_comision (sistema_id, beneficiario_id);
create index ix_fk_reglas_servicio on public.reglas_comision (sistema_id, servicio_id);
create trigger trg_reglas_actualizacion before update on public.reglas_comision
  for each row execute function privado.tg_marcar_actualizacion();
create trigger trg_reglas_comision_auditoria after insert or update or delete on public.reglas_comision
  for each row execute function privado.tg_auditar();

create table public.comisiones (
  id              uuid primary key default gen_random_uuid(),
  sistema_id      uuid not null references public.sistemas(id) on delete restrict,
  cobro_id        uuid not null,
  detalle_id      uuid,
  beneficiario_id uuid not null references public.perfiles(id),
  regla_id        uuid references public.reglas_comision(id),
  base_monto      numeric(12, 2) not null,
  monto           numeric(12, 2) not null check (monto <> 0),
  concepto        text not null,
  creado_en       timestamptz not null default now(),
  unique (sistema_id, id),
  foreign key (sistema_id, cobro_id) references public.cobros (sistema_id, id),
  foreign key (sistema_id, detalle_id) references public.cobro_detalles (sistema_id, id)
);
create index ix_comisiones_beneficiario on public.comisiones (sistema_id, beneficiario_id, creado_en);
create index ix_fk_comisiones_cobro on public.comisiones (sistema_id, cobro_id);
create index ix_fk_comisiones_detalle on public.comisiones (sistema_id, detalle_id);
create index ix_fk_comisiones_regla on public.comisiones (regla_id);
create index ix_fk_comisiones_beneficiario on public.comisiones (beneficiario_id);
create trigger trg_comisiones_append_only before update or delete on public.comisiones
  for each row execute function privado.tg_bloquear_append_only();

create table public.liquidaciones_comision (
  id              uuid primary key default gen_random_uuid(),
  sistema_id      uuid not null references public.sistemas(id) on delete restrict,
  numero          text not null,
  beneficiario_id uuid not null references public.perfiles(id),
  hasta           date not null,
  total           numeric(12, 2) not null,
  creado_por      uuid not null default auth.uid() references public.perfiles(id),
  creado_en       timestamptz not null default now(),
  unique (sistema_id, numero),
  unique (sistema_id, id)
);
create index ix_fk_liquidaciones_beneficiario on public.liquidaciones_comision (beneficiario_id);
create index ix_fk_liquidaciones_creado_por on public.liquidaciones_comision (creado_por);
create trigger trg_liquidaciones_append_only before update or delete on public.liquidaciones_comision
  for each row execute function privado.tg_bloquear_append_only();
create trigger trg_liquidaciones_comision_auditoria after insert on public.liquidaciones_comision
  for each row execute function privado.tg_auditar();

create table public.liquidacion_items (
  sistema_id     uuid not null references public.sistemas(id) on delete restrict,
  liquidacion_id uuid not null,
  comision_id    uuid not null unique,
  primary key (liquidacion_id, comision_id),
  foreign key (sistema_id, liquidacion_id) references public.liquidaciones_comision (sistema_id, id),
  foreign key (sistema_id, comision_id) references public.comisiones (sistema_id, id)
);
create index ix_fk_liq_items_liq on public.liquidacion_items (sistema_id, liquidacion_id);
create index ix_fk_liq_items_comision on public.liquidacion_items (sistema_id, comision_id);
create trigger trg_liq_items_append_only before update or delete on public.liquidacion_items
  for each row execute function privado.tg_bloquear_append_only();

-- La regla más específica gana: persona > rol, servicio > categoría > general.
create or replace function privado.calcular_comisiones(p_cobro uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.cobros;
  d record;
  quien record;
  r public.reglas_comision;
  v_base numeric;
  v_monto numeric;
begin
  select * into c from public.cobros where id = p_cobro;
  for quien in
    select 'profesional' as aplica, c.profesional_id as persona where c.profesional_id is not null
    union all
    select 'vendedor', c.vendedor_id where c.vendedor_id is not null
  loop
    for d in select * from public.cobro_detalles where cobro_id = c.id loop
      select rc.* into r
        from public.reglas_comision rc
        left join public.membresias m on m.sistema_id = c.sistema_id and m.usuario_id = quien.persona
       where rc.sistema_id = c.sistema_id and rc.activo and rc.aplica_a = quien.aplica
         and (rc.vigente_desde is null or rc.vigente_desde <= current_date)
         and (rc.vigente_hasta is null or rc.vigente_hasta >= current_date)
         and (rc.beneficiario_id = quien.persona or (rc.beneficiario_id is null and rc.rol = any(m.roles)))
         and (rc.servicio_id is null or rc.servicio_id = d.servicio_id)
         and (rc.categoria is null or rc.categoria = d.categoria)
       order by (rc.beneficiario_id is not null) desc, (rc.servicio_id is not null) desc,
                (rc.categoria is not null) desc, rc.creado_en desc
       limit 1;
      continue when r.id is null;

      v_base := case r.base when 'neto' then d.total else round(d.precio_unitario * d.cantidad, 2) end;
      v_monto := round(case r.tipo when 'porcentaje' then v_base * r.valor / 100 else r.valor * d.cantidad end, 2);
      if v_monto > 0 then
        insert into public.comisiones (sistema_id, cobro_id, detalle_id, beneficiario_id, regla_id, base_monto, monto, concepto)
        values (c.sistema_id, c.id, d.id, quien.persona, r.id, v_base, v_monto, c.numero || ' · ' || d.descripcion);
      end if;
      r := null;
    end loop;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cobro v2
-- ---------------------------------------------------------------------------
drop function if exists public.registrar_cobro(uuid, uuid, jsonb, public.metodo_pago, uuid, text, numeric, uuid, text, text);

create or replace function privado.cuenta_metodo(p_sistema uuid, p_metodo text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select privado.cuenta(p_sistema, case p_metodo when 'efectivo' then 'caja' when 'anticipo' then 'anticipos_pacientes' else 'banco' end);
$$;

create or replace function public.registrar_cobro(
  p_sistema        uuid,
  p_paciente       uuid,
  p_items          jsonb,
  p_pagos          jsonb,
  p_aseguradora    uuid default null,
  p_autorizacion   text default null,
  p_descuento      numeric default 0,
  p_cita           uuid default null,
  p_referencia     text default null,
  p_notas          text default null,
  p_tipo_ncf       text default null,
  p_cliente_rnc    text default null,
  p_cliente_nombre text default null,
  p_profesional    uuid default null,
  p_vendedor       uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno      public.turnos_caja;
  v_cobro_id   uuid := gen_random_uuid();
  v_numero     text;
  v_ncf        text;
  v_item       jsonb;
  v_servicio   public.servicios;
  v_cantidad   numeric;
  v_precio     numeric;
  v_cubierto   numeric;
  v_linea      numeric;
  v_categoria  text;
  v_subtotal   numeric := 0;
  v_cobertura  numeric := 0;
  v_descuento  numeric := round(coalesce(p_descuento, 0), 2);
  v_total      numeric;
  v_detalles   jsonb := '[]'::jsonb;
  v_pago       jsonb;
  v_metodos    text[] := '{}';
  v_m          text;
  v_monto      numeric;
  v_pagado     numeric := 0;
  v_anticipo   numeric := 0;
  v_credito    numeric;
  v_principal  text;
  v_max        numeric := -1;
  v_lineas     jsonb;
begin
  if not privado.tiene_rol(p_sistema, '{caja,admin}') then
    raise exception 'No tienes permiso para registrar cobros en este sistema.' using errcode = '42501';
  end if;

  select * into v_turno from public.turnos_caja where id = privado.turno_abierto(p_sistema);
  if v_turno.id is null then
    raise exception 'Abre un turno de caja antes de registrar cobros.' using errcode = 'P0001';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El cobro necesita al menos un concepto.' using errcode = 'P0001';
  end if;

  -- Conceptos -----------------------------------------------------------------
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_cantidad := coalesce((v_item ->> 'cantidad')::numeric, 1);
    if v_cantidad <= 0 then
      raise exception 'Cantidad inválida.' using errcode = 'P0001';
    end if;

    v_servicio := null;
    if (v_item ->> 'servicio_id') is not null then
      select * into v_servicio from public.servicios where id = (v_item ->> 'servicio_id')::uuid and sistema_id = p_sistema;
      if v_servicio.id is null then
        raise exception 'Servicio no encontrado en este sistema.' using errcode = 'P0001';
      end if;
      v_precio := v_servicio.precio;
      v_categoria := v_servicio.categoria;
    else
      v_precio := coalesce((v_item ->> 'precio_unitario')::numeric, 0);
      v_categoria := coalesce(nullif(v_item ->> 'categoria', ''), 'otro');
      if v_precio < 0 then
        raise exception 'Precio inválido.' using errcode = 'P0001';
      end if;
    end if;

    v_cubierto := 0;
    if p_aseguradora is not null and v_servicio.id is not null then
      select round(least(c.monto_cubierto, v_precio) * v_cantidad, 2) into v_cubierto
        from public.coberturas c where c.aseguradora_id = p_aseguradora and c.servicio_id = v_servicio.id;
      v_cubierto := coalesce(v_cubierto, 0);
    end if;

    v_linea := round(v_precio * v_cantidad, 2);
    v_subtotal := v_subtotal + v_linea;
    v_cobertura := v_cobertura + v_cubierto;
    v_detalles := v_detalles || jsonb_build_object(
      'id', gen_random_uuid(),
      'servicio_id', v_servicio.id,
      'descripcion', coalesce(v_servicio.nombre, nullif(trim(v_item ->> 'descripcion'), ''), 'Concepto'),
      'categoria', v_categoria,
      'cantidad', v_cantidad,
      'precio_unitario', v_precio,
      'bruto', v_linea,
      'cobertura', v_cubierto,
      'total', v_linea - v_cubierto
    );
  end loop;

  v_total := v_subtotal - v_cobertura - v_descuento;
  if v_descuento < 0 or v_total < 0 then
    raise exception 'El descuento supera el monto a pagar.' using errcode = 'P0001';
  end if;

  -- Pagos ---------------------------------------------------------------------
  for v_pago in select * from jsonb_array_elements(coalesce(p_pagos, '[]'::jsonb)) loop
    v_m := v_pago ->> 'metodo';
    v_monto := round(coalesce((v_pago ->> 'monto')::numeric, 0), 2);
    if v_m is null or v_m not in ('efectivo', 'tarjeta', 'transferencia', 'cheque', 'otro', 'anticipo') then
      raise exception 'Método de pago inválido.' using errcode = 'P0001';
    end if;
    if v_monto <= 0 then
      raise exception 'Cada pago debe tener un monto mayor que cero.' using errcode = 'P0001';
    end if;
    if v_m = any(v_metodos) then
      raise exception 'No repitas el método de pago "%": suma los montos en una sola línea.', v_m using errcode = 'P0001';
    end if;
    v_metodos := v_metodos || v_m;
    v_pagado := v_pagado + v_monto;
    if v_m = 'anticipo' then
      v_anticipo := v_monto;
    end if;
    if v_monto > v_max then
      v_max := v_monto;
      v_principal := v_m;
    end if;
  end loop;

  if v_pagado > v_total then
    raise exception 'Los pagos (%) superan el total a cobrar (%).', v_pagado, v_total using errcode = 'P0001';
  end if;
  if v_anticipo > 0 and v_anticipo > privado.saldo_anticipo(p_sistema, p_paciente) then
    raise exception 'El paciente no tiene suficiente saldo de anticipos.' using errcode = 'P0001';
  end if;
  v_credito := v_total - v_pagado;
  v_principal := coalesce(v_principal, case when v_total = 0 and v_cobertura > 0 then 'seguro' else 'credito' end);

  -- Comprobante fiscal --------------------------------------------------------
  if p_tipo_ncf is not null then
    if p_tipo_ncf = 'B01' and nullif(trim(coalesce(p_cliente_rnc, '')), '') is null then
      raise exception 'Para crédito fiscal (B01) indica el RNC o cédula del cliente.' using errcode = 'P0001';
    end if;
    v_ncf := privado.siguiente_ncf(p_sistema, p_tipo_ncf);
  end if;

  v_numero := 'REC-' || lpad(privado.siguiente_numero(p_sistema, 'recibo')::text, 7, '0');

  insert into public.cobros (id, sistema_id, sede_id, turno_id, paciente_id, cita_id, numero, subtotal, cobertura_seguro,
    descuento, total, metodo, aseguradora_id, numero_autorizacion, referencia, notas, cajero_id,
    tipo_ncf, ncf, cliente_rnc, cliente_nombre, profesional_id, vendedor_id, monto_credito)
  values (v_cobro_id, p_sistema, v_turno.sede_id, v_turno.id, p_paciente, p_cita, v_numero, v_subtotal, v_cobertura,
    v_descuento, v_total, v_principal::public.metodo_pago, p_aseguradora, p_autorizacion, p_referencia, p_notas, auth.uid(),
    p_tipo_ncf, v_ncf, nullif(trim(p_cliente_rnc), ''), nullif(trim(p_cliente_nombre), ''), p_profesional, p_vendedor, v_credito);

  insert into public.cobro_detalles (id, sistema_id, cobro_id, servicio_id, descripcion, categoria, cantidad, precio_unitario, cobertura, total)
  select (d ->> 'id')::uuid, p_sistema, v_cobro_id, (d ->> 'servicio_id')::uuid, d ->> 'descripcion', d ->> 'categoria',
         (d ->> 'cantidad')::numeric, (d ->> 'precio_unitario')::numeric, (d ->> 'cobertura')::numeric, (d ->> 'total')::numeric
    from jsonb_array_elements(v_detalles) d;

  insert into public.cobro_pagos (sistema_id, cobro_id, metodo, monto, referencia)
  select p_sistema, v_cobro_id, (p ->> 'metodo')::public.metodo_pago, round((p ->> 'monto')::numeric, 2), nullif(p ->> 'referencia', '')
    from jsonb_array_elements(coalesce(p_pagos, '[]'::jsonb)) p;

  -- Entradas de dinero (el anticipo ya entró cuando se recibió).
  insert into public.movimientos_financieros (sistema_id, sede_id, turno_id, tipo, categoria, concepto, monto, metodo, cobro_id, creado_por)
  select p_sistema, v_turno.sede_id, v_turno.id, 'ingreso', 'cobro', 'Cobro ' || v_numero, round((p ->> 'monto')::numeric, 2),
         (p ->> 'metodo')::public.metodo_pago, v_cobro_id, auth.uid()
    from jsonb_array_elements(coalesce(p_pagos, '[]'::jsonb)) p
   where p ->> 'metodo' <> 'anticipo';

  -- Asiento: ingreso por categoría (haber) contra pagos, crédito, seguro y descuento (debe).
  select jsonb_agg(l) into v_lineas from (
    select jsonb_build_object('cuenta', privado.cuenta(p_sistema, 'ingreso_' || (d ->> 'categoria')),
                              'haber', sum((d ->> 'bruto')::numeric), 'descripcion', 'Ingresos · ' || (d ->> 'categoria')) as l
      from jsonb_array_elements(v_detalles) d
     group by d ->> 'categoria'
    union all
    select jsonb_build_object('cuenta', privado.cuenta_metodo(p_sistema, p ->> 'metodo'), 'debe', (p ->> 'monto')::numeric,
                              'descripcion', 'Pago · ' || (p ->> 'metodo'))
      from jsonb_array_elements(coalesce(p_pagos, '[]'::jsonb)) p
    union all
    select jsonb_build_object('cuenta', privado.cuenta(p_sistema, 'cxc_pacientes'), 'debe', v_credito, 'descripcion', 'Crédito al paciente')
     where v_credito > 0
    union all
    select jsonb_build_object('cuenta', privado.cuenta(p_sistema, 'cxc_aseguradoras'), 'debe', v_cobertura, 'descripcion', 'Cobertura ARS')
     where v_cobertura > 0
    union all
    select jsonb_build_object('cuenta', privado.cuenta(p_sistema, 'descuentos'), 'debe', v_descuento, 'descripcion', 'Descuento')
     where v_descuento > 0
  ) x;
  perform privado.crear_asiento(p_sistema, current_date, 'Cobro ' || v_numero, 'cobro', v_cobro_id, v_lineas);

  perform privado.calcular_comisiones(v_cobro_id);

  if p_cita is not null then
    update public.citas set estado = 'completada', atendida_en = coalesce(atendida_en, now())
     where id = p_cita and sistema_id = p_sistema and estado in ('en_consulta', 'en_espera');
  end if;

  return jsonb_build_object('id', v_cobro_id, 'numero', v_numero, 'ncf', v_ncf, 'subtotal', v_subtotal,
    'cobertura', v_cobertura, 'total', v_total, 'pagado', v_pagado, 'credito', v_credito);
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
  v_turno uuid;
begin
  select * into v_cobro from public.cobros where id = p_cobro;
  if v_cobro.id is null or not privado.tiene_rol(v_cobro.sistema_id, '{caja,admin}') then
    raise exception 'Cobro no encontrado o sin permiso.' using errcode = '42501';
  end if;
  if exists (select 1 from public.abonos where cobro_id = v_cobro.id) then
    raise exception 'El cobro tiene abonos registrados a su cuenta por cobrar; no se puede anular.' using errcode = 'P0001';
  end if;

  insert into public.anulaciones_cobro (sistema_id, cobro_id, motivo, anulado_por)
  values (v_cobro.sistema_id, v_cobro.id, p_motivo, auth.uid());

  v_turno := privado.turno_abierto(v_cobro.sistema_id);
  insert into public.movimientos_financieros (sistema_id, sede_id, turno_id, tipo, categoria, concepto, monto, metodo, cobro_id, creado_por)
  select v_cobro.sistema_id, v_cobro.sede_id, v_turno, 'egreso', 'anulacion', 'Anulación ' || v_cobro.numero, cp.monto, cp.metodo, v_cobro.id, auth.uid()
    from public.cobro_pagos cp
   where cp.cobro_id = v_cobro.id and cp.metodo <> 'anticipo';

  perform privado.revertir_asientos('cobro', v_cobro.id, 'Anulación ' || v_cobro.numero);

  -- Comisiones en negativo (si ya se liquidaron, se descuentan de la próxima).
  insert into public.comisiones (sistema_id, cobro_id, detalle_id, beneficiario_id, regla_id, base_monto, monto, concepto)
  select sistema_id, cobro_id, detalle_id, beneficiario_id, regla_id, -base_monto, -monto, 'Anulación · ' || concepto
    from public.comisiones where cobro_id = v_cobro.id and monto > 0;
exception when unique_violation then
  raise exception 'Ese cobro ya fue anulado.' using errcode = 'P0001';
end;
$$;

-- ---------------------------------------------------------------------------
-- Anticipos y abonos
-- ---------------------------------------------------------------------------
create or replace function public.registrar_anticipo(
  p_sistema uuid, p_paciente uuid, p_monto numeric, p_metodo public.metodo_pago,
  p_referencia text default null, p_fecha date default current_date, p_notas text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
  v_numero text;
  v_turno uuid := privado.turno_abierto(p_sistema);
  v_fecha date := coalesce(p_fecha, current_date);
begin
  if not privado.tiene_rol(p_sistema, '{caja,admin}') then
    raise exception 'No tienes permiso para registrar anticipos.' using errcode = '42501';
  end if;
  if v_fecha > current_date then
    raise exception 'La fecha no puede ser futura.' using errcode = 'P0001';
  end if;

  v_numero := 'ANT-' || lpad(privado.siguiente_numero(p_sistema, 'anticipo')::text, 6, '0');
  insert into public.anticipos (id, sistema_id, numero, paciente_id, monto, metodo, referencia, fecha, notas, turno_id, creado_por)
  values (v_id, p_sistema, v_numero, p_paciente, round(p_monto, 2), p_metodo, nullif(p_referencia, ''), v_fecha, nullif(p_notas, ''), v_turno, auth.uid());

  insert into public.movimientos_financieros (sistema_id, turno_id, tipo, categoria, concepto, monto, metodo, creado_por)
  values (p_sistema, v_turno, 'ingreso', 'anticipo', 'Anticipo ' || v_numero, round(p_monto, 2), p_metodo, auth.uid());

  perform privado.crear_asiento(p_sistema, v_fecha, 'Anticipo ' || v_numero, 'anticipo', v_id, jsonb_build_array(
    jsonb_build_object('cuenta', privado.cuenta_metodo(p_sistema, p_metodo::text), 'debe', p_monto),
    jsonb_build_object('cuenta', privado.cuenta(p_sistema, 'anticipos_pacientes'), 'haber', p_monto)
  ));
  return jsonb_build_object('id', v_id, 'numero', v_numero);
end;
$$;

create or replace function public.registrar_abono(
  p_sistema uuid, p_cobro uuid, p_deudor text, p_monto numeric, p_metodo public.metodo_pago,
  p_referencia text default null, p_fecha date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
  v_numero text;
  v_pendiente numeric;
  v_cobro public.cobros;
  v_turno uuid := privado.turno_abierto(p_sistema);
  v_fecha date := coalesce(p_fecha, current_date);
begin
  if not privado.tiene_rol(p_sistema, '{caja,admin,contabilidad}') then
    raise exception 'No tienes permiso para registrar abonos.' using errcode = '42501';
  end if;
  if v_fecha > current_date then
    raise exception 'La fecha no puede ser futura.' using errcode = 'P0001';
  end if;
  select * into v_cobro from public.cobros where id = p_cobro and sistema_id = p_sistema;
  if v_cobro.id is null or exists (select 1 from public.anulaciones_cobro where cobro_id = p_cobro) then
    raise exception 'Cuenta por cobrar no encontrada o anulada.' using errcode = 'P0001';
  end if;

  v_pendiente := case p_deudor when 'paciente' then v_cobro.monto_credito else v_cobro.cobertura_seguro end
               - coalesce((select sum(monto) from public.abonos where cobro_id = p_cobro and deudor = p_deudor), 0);
  if round(p_monto, 2) > v_pendiente then
    raise exception 'El abono (%) supera el saldo pendiente (%).', round(p_monto, 2), v_pendiente using errcode = 'P0001';
  end if;

  v_numero := 'ABO-' || lpad(privado.siguiente_numero(p_sistema, 'abono')::text, 6, '0');
  insert into public.abonos (id, sistema_id, numero, cobro_id, deudor, monto, metodo, referencia, fecha, turno_id, creado_por)
  values (v_id, p_sistema, v_numero, p_cobro, p_deudor, round(p_monto, 2), p_metodo, nullif(p_referencia, ''), v_fecha, v_turno, auth.uid());

  insert into public.movimientos_financieros (sistema_id, turno_id, tipo, categoria, concepto, monto, metodo, cobro_id, creado_por)
  values (p_sistema, v_turno, 'ingreso', 'abono', 'Abono ' || v_numero || ' a ' || v_cobro.numero, round(p_monto, 2), p_metodo, p_cobro, auth.uid());

  perform privado.crear_asiento(p_sistema, v_fecha, 'Abono ' || v_numero || ' a ' || v_cobro.numero, 'abono', v_id, jsonb_build_array(
    jsonb_build_object('cuenta', privado.cuenta_metodo(p_sistema, p_metodo::text), 'debe', p_monto),
    jsonb_build_object('cuenta', privado.cuenta(p_sistema, case p_deudor when 'paciente' then 'cxc_pacientes' else 'cxc_aseguradoras' end), 'haber', p_monto)
  ));
  return jsonb_build_object('id', v_id, 'numero', v_numero);
end;
$$;

-- Estado de cuenta de un contacto (paciente o aseguradora). security invoker:
-- solo lo obtiene quien puede leer cobros.
create or replace function public.estado_cuenta(p_sistema uuid, p_tipo text, p_contacto uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with cargos as (
    select c.creado_en::date as fecha, 'cargo' as tipo, coalesce(c.ncf, c.numero) as documento,
           case when p_tipo = 'paciente' then 'Servicios ' || c.numero
                else 'Cobertura · ' || p.nombres || ' ' || p.apellidos || coalesce(' · Aut. ' || c.numero_autorizacion, '') end as descripcion,
           case when p_tipo = 'paciente' then c.monto_credito else c.cobertura_seguro end as cargo,
           0::numeric as abono, c.creado_en as orden
      from public.cobros c
      join public.pacientes p on p.id = c.paciente_id
     where c.sistema_id = p_sistema
       and ((p_tipo = 'paciente' and c.paciente_id = p_contacto and c.monto_credito > 0)
         or (p_tipo = 'aseguradora' and c.aseguradora_id = p_contacto and c.cobertura_seguro > 0))
       and not exists (select 1 from public.anulaciones_cobro x where x.cobro_id = c.id)
  ), pagos as (
    select b.fecha, 'abono', b.numero, 'Abono a ' || c.numero || ' · ' || b.metodo::text, 0::numeric, b.monto, b.creado_en
      from public.abonos b
      join public.cobros c on c.id = b.cobro_id
     where b.sistema_id = p_sistema and b.deudor = p_tipo
       and ((p_tipo = 'paciente' and c.paciente_id = p_contacto) or (p_tipo = 'aseguradora' and c.aseguradora_id = p_contacto))
  ), todo as (
    select * from cargos union all select * from pagos
  )
  select jsonb_build_object(
    'movimientos', coalesce((select jsonb_agg(jsonb_build_object('fecha', fecha, 'tipo', tipo, 'documento', documento,
                     'descripcion', descripcion, 'cargo', cargo, 'abono', abono) order by fecha, orden) from todo), '[]'::jsonb),
    'saldo', coalesce((select sum(cargo) - sum(abono) from todo), 0),
    'anticipos', case when p_tipo = 'paciente' then
                   coalesce((select jsonb_agg(jsonb_build_object('fecha', fecha, 'numero', numero, 'monto', monto, 'metodo', metodo) order by fecha)
                               from public.anticipos where sistema_id = p_sistema and paciente_id = p_contacto), '[]'::jsonb)
                 else '[]'::jsonb end,
    'saldo_anticipos', case when p_tipo = 'paciente' then
                   (select coalesce(sum(anticipado - aplicado), 0) from public.saldos_anticipo where sistema_id = p_sistema and paciente_id = p_contacto)
                 else 0 end
  );
$$;

-- ---------------------------------------------------------------------------
-- Comisiones: reporte y liquidación
-- ---------------------------------------------------------------------------
create or replace function public.reporte_comisiones(p_sistema uuid, p_desde date, p_hasta date)
returns table (beneficiario_id uuid, nombre text, generado numeric, liquidado numeric, pendiente numeric, operaciones bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.beneficiario_id, p.nombre_completo,
         coalesce(sum(c.monto) filter (where c.creado_en::date between p_desde and p_hasta), 0),
         coalesce(sum(c.monto) filter (where c.creado_en::date between p_desde and p_hasta and li.comision_id is not null), 0),
         coalesce(sum(c.monto) filter (where li.comision_id is null and c.creado_en::date <= p_hasta), 0),
         count(*) filter (where c.creado_en::date between p_desde and p_hasta)
    from public.comisiones c
    join public.perfiles p on p.id = c.beneficiario_id
    left join public.liquidacion_items li on li.comision_id = c.id
   where c.sistema_id = p_sistema
   group by c.beneficiario_id, p.nombre_completo
   order by p.nombre_completo;
$$;

create or replace function public.liquidar_comisiones(p_sistema uuid, p_beneficiario uuid, p_hasta date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
  v_numero text;
  v_total numeric;
begin
  if not privado.tiene_rol(p_sistema, '{admin,contabilidad,gerencia}') then
    raise exception 'No tienes permiso para liquidar comisiones.' using errcode = '42501';
  end if;

  select coalesce(sum(c.monto), 0) into v_total
    from public.comisiones c
   where c.sistema_id = p_sistema and c.beneficiario_id = p_beneficiario and c.creado_en::date <= p_hasta
     and not exists (select 1 from public.liquidacion_items li where li.comision_id = c.id);
  if v_total <= 0 then
    raise exception 'No hay comisiones pendientes para liquidar.' using errcode = 'P0001';
  end if;

  v_numero := 'LIQ-' || lpad(privado.siguiente_numero(p_sistema, 'liquidacion')::text, 5, '0');
  insert into public.liquidaciones_comision (id, sistema_id, numero, beneficiario_id, hasta, total, creado_por)
  values (v_id, p_sistema, v_numero, p_beneficiario, p_hasta, v_total, auth.uid());

  insert into public.liquidacion_items (sistema_id, liquidacion_id, comision_id)
  select p_sistema, v_id, c.id
    from public.comisiones c
   where c.sistema_id = p_sistema and c.beneficiario_id = p_beneficiario and c.creado_en::date <= p_hasta
     and not exists (select 1 from public.liquidacion_items li where li.comision_id = c.id);

  perform privado.crear_asiento(p_sistema, current_date, 'Liquidación de comisiones ' || v_numero, 'comision', v_id, jsonb_build_array(
    jsonb_build_object('cuenta', privado.cuenta(p_sistema, 'gasto_comisiones'), 'debe', v_total),
    jsonb_build_object('cuenta', privado.cuenta(p_sistema, 'comisiones_por_pagar'), 'haber', v_total)
  ));
  return jsonb_build_object('id', v_id, 'numero', v_numero, 'total', v_total);
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.secuencias_ncf         enable row level security;
alter table public.cobro_pagos            enable row level security;
alter table public.anticipos              enable row level security;
alter table public.abonos                 enable row level security;
alter table public.reglas_comision        enable row level security;
alter table public.comisiones             enable row level security;
alter table public.liquidaciones_comision enable row level security;
alter table public.liquidacion_items      enable row level security;

create policy ncf_select on public.secuencias_ncf for select to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{caja,admin,contabilidad,gerencia,auditor}')));
create policy ncf_insert on public.secuencias_ncf for insert to authenticated
  with check (sistema_id in (select privado.mis_sistemas_con_rol('{admin,contabilidad}')));
create policy ncf_update on public.secuencias_ncf for update to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{admin,contabilidad}')))
  with check (sistema_id in (select privado.mis_sistemas_con_rol('{admin,contabilidad}')));

create policy cobro_pagos_select on public.cobro_pagos for select to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{caja,admin,contabilidad,gerencia,auditor}')));
create policy anticipos_select on public.anticipos for select to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{caja,admin,contabilidad,gerencia,auditor}')));
create policy abonos_select on public.abonos for select to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{caja,admin,contabilidad,gerencia,auditor}')));

create policy reglas_select on public.reglas_comision for select to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{admin,contabilidad,gerencia,caja}')));
create policy reglas_insert on public.reglas_comision for insert to authenticated
  with check (sistema_id in (select privado.mis_sistemas_con_rol('{admin,contabilidad,gerencia}')));
create policy reglas_update on public.reglas_comision for update to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{admin,contabilidad,gerencia}')))
  with check (sistema_id in (select privado.mis_sistemas_con_rol('{admin,contabilidad,gerencia}')));

-- Cada profesional ve sus propias comisiones.
create policy comisiones_select on public.comisiones for select to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{admin,contabilidad,gerencia,auditor}'))
         or (beneficiario_id = (select auth.uid()) and sistema_id in (select privado.mis_sistemas())));
create policy liquidaciones_select on public.liquidaciones_comision for select to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{admin,contabilidad,gerencia,auditor}'))
         or (beneficiario_id = (select auth.uid()) and sistema_id in (select privado.mis_sistemas())));
create policy liq_items_select on public.liquidacion_items for select to authenticated
  using (sistema_id in (select privado.mis_sistemas()));

-- Caja: gerencia y contabilidad también leen finanzas.
drop policy turnos_select on public.turnos_caja;
drop policy cobros_select on public.cobros;
drop policy cobro_detalles_select on public.cobro_detalles;
drop policy anulaciones_select on public.anulaciones_cobro;
drop policy movimientos_select on public.movimientos_financieros;
create policy turnos_select on public.turnos_caja for select to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{caja,admin,auditor,gerencia,contabilidad}')));
create policy cobros_select on public.cobros for select to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{caja,admin,auditor,gerencia,contabilidad}')));
create policy cobro_detalles_select on public.cobro_detalles for select to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{caja,admin,auditor,gerencia,contabilidad}')));
create policy anulaciones_select on public.anulaciones_cobro for select to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{caja,admin,auditor,gerencia,contabilidad}')));
create policy movimientos_select on public.movimientos_financieros for select to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{caja,admin,auditor,gerencia,contabilidad}')));

revoke all on public.secuencias_ncf, public.cobro_pagos, public.anticipos, public.abonos, public.reglas_comision,
  public.comisiones, public.liquidaciones_comision, public.liquidacion_items, public.saldos_anticipo, public.cuentas_por_cobrar from anon;
revoke insert, update, delete, truncate on public.cobro_pagos, public.anticipos, public.abonos, public.comisiones,
  public.liquidaciones_comision, public.liquidacion_items from authenticated;
revoke delete, truncate on public.secuencias_ncf, public.reglas_comision from authenticated;
grant select on public.cobro_pagos, public.anticipos, public.abonos, public.comisiones, public.liquidaciones_comision,
  public.liquidacion_items, public.saldos_anticipo, public.cuentas_por_cobrar to authenticated;
grant select, insert, update on public.secuencias_ncf, public.reglas_comision to authenticated;

revoke all on function public.registrar_cobro(uuid, uuid, jsonb, jsonb, uuid, text, numeric, uuid, text, text, text, text, text, uuid, uuid) from public, anon;
revoke all on function public.registrar_anticipo(uuid, uuid, numeric, public.metodo_pago, text, date, text) from public, anon;
revoke all on function public.registrar_abono(uuid, uuid, text, numeric, public.metodo_pago, text, date) from public, anon;
revoke all on function public.estado_cuenta(uuid, text, uuid) from public, anon;
revoke all on function public.reporte_comisiones(uuid, date, date) from public, anon;
revoke all on function public.liquidar_comisiones(uuid, uuid, date) from public, anon;
grant execute on function public.registrar_cobro(uuid, uuid, jsonb, jsonb, uuid, text, numeric, uuid, text, text, text, text, text, uuid, uuid) to authenticated;
grant execute on function public.registrar_anticipo(uuid, uuid, numeric, public.metodo_pago, text, date, text) to authenticated;
grant execute on function public.registrar_abono(uuid, uuid, text, numeric, public.metodo_pago, text, date) to authenticated;
grant execute on function public.estado_cuenta(uuid, text, uuid) to authenticated;
grant execute on function public.reporte_comisiones(uuid, date, date) to authenticated;
grant execute on function public.liquidar_comisiones(uuid, uuid, date) to authenticated;
revoke all on function privado.siguiente_ncf(uuid, text) from public, anon, authenticated;
revoke all on function privado.saldo_anticipo(uuid, uuid) from public, anon, authenticated;
revoke all on function privado.calcular_comisiones(uuid) from public, anon, authenticated;
revoke all on function privado.cuenta_metodo(uuid, text) from public, anon, authenticated;
revoke all on function privado.cuenta(uuid, text) from public, anon, authenticated;
