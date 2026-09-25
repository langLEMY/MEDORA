-- ============================================================================
-- MEDORA · 0012 · Compras a proveedores y nómina con retenciones
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Proveedores y compras
-- ---------------------------------------------------------------------------
create table public.proveedores (
  id              uuid primary key default gen_random_uuid(),
  sistema_id      uuid not null references public.sistemas(id) on delete restrict,
  nombre          text not null check (char_length(nombre) between 2 and 160),
  rnc             text,
  telefono        text,
  email           text,
  contacto        text,
  direccion       text,
  activo          boolean not null default true,
  creado_en       timestamptz not null default now(),
  creado_por      uuid default auth.uid(),
  actualizado_en  timestamptz not null default now(),
  actualizado_por uuid,
  unique (sistema_id, id)
);
create unique index ux_proveedores_rnc on public.proveedores (sistema_id, rnc) where rnc is not null;
create index ix_proveedores_sistema on public.proveedores (sistema_id, nombre);
create trigger trg_proveedores_actualizacion before update on public.proveedores
  for each row execute function privado.tg_marcar_actualizacion();
create trigger trg_proveedores_auditoria after insert or update or delete on public.proveedores
  for each row execute function privado.tg_auditar();

create table public.compras (
  id            uuid primary key default gen_random_uuid(),
  sistema_id    uuid not null references public.sistemas(id) on delete restrict,
  numero        text not null,
  proveedor_id  uuid,
  fecha         date not null default current_date check (fecha <= current_date),
  ncf_proveedor text,
  forma_pago    text not null check (forma_pago in ('efectivo', 'transferencia', 'tarjeta', 'cheque', 'credito')),
  subtotal      numeric(12, 2) not null check (subtotal >= 0),
  itbis         numeric(12, 2) not null default 0 check (itbis >= 0),
  total         numeric(12, 2) not null check (total >= 0),
  notas         text,
  turno_id      uuid,
  creado_por    uuid not null default auth.uid() references public.perfiles(id),
  creado_en     timestamptz not null default now(),
  -- Proveedor obligatorio salvo compras 100% en efectivo.
  check (proveedor_id is not null or forma_pago = 'efectivo'),
  unique (sistema_id, numero),
  unique (sistema_id, id),
  foreign key (sistema_id, proveedor_id) references public.proveedores (sistema_id, id),
  foreign key (sistema_id, turno_id) references public.turnos_caja (sistema_id, id)
);
create index ix_compras_sistema_fecha on public.compras (sistema_id, fecha desc);
create index ix_fk_compras_proveedor on public.compras (sistema_id, proveedor_id);
create index ix_fk_compras_turno on public.compras (sistema_id, turno_id);
create index ix_fk_compras_creado_por on public.compras (creado_por);

create table public.compra_items (
  id             uuid primary key default gen_random_uuid(),
  sistema_id     uuid not null references public.sistemas(id) on delete restrict,
  compra_id      uuid not null,
  item_id        uuid,
  descripcion    text not null,
  cantidad       numeric(12, 2) not null check (cantidad > 0),
  costo_unitario numeric(12, 2) not null check (costo_unitario >= 0),
  itbis          numeric(12, 2) not null default 0 check (itbis >= 0),
  total          numeric(12, 2) not null check (total >= 0),
  cuenta_codigo  text,
  foreign key (sistema_id, compra_id) references public.compras (sistema_id, id),
  foreign key (sistema_id, item_id) references public.inventario_items (sistema_id, id),
  foreign key (sistema_id, cuenta_codigo) references public.cuentas_contables (sistema_id, codigo) on update cascade
);
create index ix_fk_compra_items_compra on public.compra_items (sistema_id, compra_id);
create index ix_fk_compra_items_item on public.compra_items (sistema_id, item_id);
create index ix_fk_compra_items_cuenta on public.compra_items (sistema_id, cuenta_codigo);

create table public.anulaciones_compra (
  id          uuid primary key default gen_random_uuid(),
  sistema_id  uuid not null references public.sistemas(id) on delete restrict,
  compra_id   uuid not null unique,
  motivo      text not null check (char_length(motivo) between 5 and 500),
  anulado_por uuid not null default auth.uid() references public.perfiles(id),
  creado_en   timestamptz not null default now(),
  foreign key (sistema_id, compra_id) references public.compras (sistema_id, id)
);
create index ix_fk_anul_compra_compra on public.anulaciones_compra (sistema_id, compra_id);
create index ix_fk_anul_compra_autor on public.anulaciones_compra (anulado_por);

create trigger trg_compras_append_only before update or delete on public.compras
  for each row execute function privado.tg_bloquear_append_only();
create trigger trg_compra_items_append_only before update or delete on public.compra_items
  for each row execute function privado.tg_bloquear_append_only();
create trigger trg_anul_compra_append_only before update or delete on public.anulaciones_compra
  for each row execute function privado.tg_bloquear_append_only();
create trigger trg_compras_auditoria after insert on public.compras
  for each row execute function privado.tg_auditar();
create trigger trg_anulaciones_compra_auditoria after insert on public.anulaciones_compra
  for each row execute function privado.tg_auditar();

-- p_items: [{ item_id?, descripcion, cantidad, costo_unitario, itbis, cuenta? }]
create or replace function public.registrar_compra(
  p_sistema uuid, p_proveedor uuid, p_fecha date, p_ncf text, p_forma_pago text, p_items jsonb, p_notas text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id      uuid := gen_random_uuid();
  v_numero  text;
  v_fecha   date := coalesce(p_fecha, current_date);
  v_turno   uuid := privado.turno_abierto(p_sistema);
  v_sub     numeric;
  v_itbis   numeric;
  v_lineas  jsonb;
  v_it      jsonb;
begin
  if not privado.tiene_rol(p_sistema, '{admin,farmacia,contabilidad,gerencia}') then
    raise exception 'No tienes permiso para registrar compras.' using errcode = '42501';
  end if;
  if p_proveedor is null and p_forma_pago <> 'efectivo' then
    raise exception 'El proveedor es obligatorio si la compra no es 100%% en efectivo.' using errcode = 'P0001';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'La compra necesita al menos una línea.' using errcode = 'P0001';
  end if;

  for v_it in select * from jsonb_array_elements(p_items) loop
    if coalesce((v_it ->> 'cantidad')::numeric, 0) <= 0 or coalesce((v_it ->> 'costo_unitario')::numeric, -1) < 0 then
      raise exception 'Cantidad o costo inválido en "%".', v_it ->> 'descripcion' using errcode = 'P0001';
    end if;
    if (v_it ->> 'item_id') is null and (v_it ->> 'cuenta') is null then
      raise exception 'La línea "%" necesita un artículo de inventario o una cuenta de gasto.', v_it ->> 'descripcion' using errcode = 'P0001';
    end if;
  end loop;

  select round(sum((i ->> 'cantidad')::numeric * (i ->> 'costo_unitario')::numeric), 2),
         round(sum(coalesce((i ->> 'itbis')::numeric, 0)), 2)
    into v_sub, v_itbis
    from jsonb_array_elements(p_items) i;

  v_numero := 'COM-' || lpad(privado.siguiente_numero(p_sistema, 'compra')::text, 6, '0');
  insert into public.compras (id, sistema_id, numero, proveedor_id, fecha, ncf_proveedor, forma_pago, subtotal, itbis, total, notas, turno_id, creado_por)
  values (v_id, p_sistema, v_numero, p_proveedor, v_fecha, nullif(trim(p_ncf), ''), p_forma_pago, v_sub, v_itbis, v_sub + v_itbis,
          nullif(p_notas, ''), v_turno, auth.uid());

  insert into public.compra_items (sistema_id, compra_id, item_id, descripcion, cantidad, costo_unitario, itbis, total, cuenta_codigo)
  select p_sistema, v_id, (i ->> 'item_id')::uuid, coalesce(nullif(i ->> 'descripcion', ''), 'Artículo'),
         (i ->> 'cantidad')::numeric, (i ->> 'costo_unitario')::numeric, coalesce((i ->> 'itbis')::numeric, 0),
         round((i ->> 'cantidad')::numeric * (i ->> 'costo_unitario')::numeric + coalesce((i ->> 'itbis')::numeric, 0), 2),
         case when (i ->> 'item_id') is null then i ->> 'cuenta' end
    from jsonb_array_elements(p_items) i;

  -- Entrada a inventario y costo actualizado.
  insert into public.movimientos_inventario (sistema_id, item_id, tipo, cantidad, lote, vence_en, motivo, creado_por)
  select p_sistema, (i ->> 'item_id')::uuid, 'entrada', (i ->> 'cantidad')::numeric, nullif(i ->> 'lote', ''),
         (nullif(i ->> 'vence_en', ''))::date, 'Compra ' || v_numero, auth.uid()
    from jsonb_array_elements(p_items) i
   where (i ->> 'item_id') is not null;
  update public.inventario_items it set costo_unitario = (i ->> 'costo_unitario')::numeric
    from jsonb_array_elements(p_items) i
   where (i ->> 'item_id') is not null and it.id = (i ->> 'item_id')::uuid and it.sistema_id = p_sistema;

  if p_forma_pago <> 'credito' then
    insert into public.movimientos_financieros (sistema_id, turno_id, tipo, categoria, concepto, monto, metodo, creado_por)
    values (p_sistema, v_turno, 'egreso', 'compra', 'Compra ' || v_numero, v_sub + v_itbis, p_forma_pago::public.metodo_pago, auth.uid());
  end if;

  select jsonb_agg(l) into v_lineas from (
    select jsonb_build_object('cuenta', privado.cuenta(p_sistema, 'inventario'),
                              'debe', sum((i ->> 'cantidad')::numeric * (i ->> 'costo_unitario')::numeric), 'descripcion', 'Inventario') as l
      from jsonb_array_elements(p_items) i where (i ->> 'item_id') is not null
    having count(*) > 0
    union all
    select jsonb_build_object('cuenta', i ->> 'cuenta', 'debe', sum((i ->> 'cantidad')::numeric * (i ->> 'costo_unitario')::numeric),
                              'descripcion', min(i ->> 'descripcion'))
      from jsonb_array_elements(p_items) i where (i ->> 'item_id') is null
     group by i ->> 'cuenta'
    union all
    select jsonb_build_object('cuenta', privado.cuenta(p_sistema, 'itbis_compras'), 'debe', v_itbis, 'descripcion', 'ITBIS') where v_itbis > 0
    union all
    select jsonb_build_object('cuenta', privado.cuenta(p_sistema, case p_forma_pago when 'efectivo' then 'caja' when 'credito' then 'cxp' else 'banco' end),
                              'haber', v_sub + v_itbis, 'descripcion', 'Pago · ' || p_forma_pago)
  ) x;
  perform privado.crear_asiento(p_sistema, v_fecha, 'Compra ' || v_numero, 'compra', v_id, v_lineas);

  return jsonb_build_object('id', v_id, 'numero', v_numero, 'total', v_sub + v_itbis);
end;
$$;

create or replace function public.anular_compra(p_compra uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.compras;
begin
  select * into c from public.compras where id = p_compra;
  if c.id is null or not privado.tiene_rol(c.sistema_id, '{admin,contabilidad,gerencia}') then
    raise exception 'Compra no encontrada o sin permiso.' using errcode = '42501';
  end if;

  insert into public.anulaciones_compra (sistema_id, compra_id, motivo, anulado_por)
  values (c.sistema_id, c.id, p_motivo, auth.uid());

  insert into public.movimientos_inventario (sistema_id, item_id, tipo, cantidad, motivo, creado_por)
  select c.sistema_id, item_id, 'salida', cantidad, 'Anulación ' || c.numero, auth.uid()
    from public.compra_items where compra_id = c.id and item_id is not null;

  if c.forma_pago <> 'credito' then
    insert into public.movimientos_financieros (sistema_id, turno_id, tipo, categoria, concepto, monto, metodo, creado_por)
    values (c.sistema_id, privado.turno_abierto(c.sistema_id), 'ingreso', 'anulacion', 'Anulación ' || c.numero, c.total, c.forma_pago::public.metodo_pago, auth.uid());
  end if;

  perform privado.revertir_asientos('compra', c.id, 'Anulación ' || c.numero);
exception when unique_violation then
  raise exception 'Esa compra ya fue anulada.' using errcode = 'P0001';
end;
$$;

-- ---------------------------------------------------------------------------
-- Nómina
-- ---------------------------------------------------------------------------
create table public.empleados (
  id              uuid primary key default gen_random_uuid(),
  sistema_id      uuid not null references public.sistemas(id) on delete restrict,
  usuario_id      uuid references public.perfiles(id),
  nombres         text not null,
  apellidos       text not null,
  cedula          text,
  cargo           text,
  departamento    text,
  fecha_ingreso   date,
  salario_mensual numeric(12, 2) not null default 0 check (salario_mensual >= 0),
  frecuencia      text not null default 'mensual' check (frecuencia in ('mensual', 'quincenal')),
  banco           text,
  cuenta_bancaria text,
  activo          boolean not null default true,
  creado_en       timestamptz not null default now(),
  creado_por      uuid default auth.uid(),
  actualizado_en  timestamptz not null default now(),
  actualizado_por uuid,
  unique (sistema_id, id)
);
create unique index ux_empleados_cedula on public.empleados (sistema_id, cedula) where cedula is not null;
create index ix_fk_empleados_usuario on public.empleados (usuario_id);
create trigger trg_empleados_actualizacion before update on public.empleados
  for each row execute function privado.tg_marcar_actualizacion();
create trigger trg_empleados_auditoria after insert or update or delete on public.empleados
  for each row execute function privado.tg_auditar();

-- Tasas vigentes en RD (TSS y DGII); editables por sistema.
create table public.parametros_nomina (
  sistema_id      uuid primary key references public.sistemas(id) on delete restrict,
  afp_empleado    numeric(5, 2) not null default 2.87,
  sfs_empleado    numeric(5, 2) not null default 3.04,
  afp_empleador   numeric(5, 2) not null default 7.10,
  sfs_empleador   numeric(5, 2) not null default 7.09,
  srl_empleador   numeric(5, 2) not null default 1.10,
  infotep         numeric(5, 2) not null default 1.00,
  tope_afp_mensual numeric(12, 2),
  tope_sfs_mensual numeric(12, 2),
  escala_isr      jsonb not null default '[
    {"hasta": 416220.00, "exceso_de": 0,         "tasa": 0,  "fijo": 0},
    {"hasta": 624329.00, "exceso_de": 416220.01, "tasa": 15, "fijo": 0},
    {"hasta": 867123.00, "exceso_de": 624329.01, "tasa": 20, "fijo": 31216.00},
    {"hasta": null,      "exceso_de": 867123.01, "tasa": 25, "fijo": 79776.00}
  ]'::jsonb,
  actualizado_en  timestamptz not null default now(),
  actualizado_por uuid
);
create trigger trg_parametros_actualizacion before update on public.parametros_nomina
  for each row execute function privado.tg_marcar_actualizacion();
create trigger trg_parametros_nomina_auditoria after insert or update on public.parametros_nomina
  for each row execute function privado.tg_auditar();

create table public.nominas (
  id           uuid primary key default gen_random_uuid(),
  sistema_id   uuid not null references public.sistemas(id) on delete restrict,
  numero       text not null,
  descripcion  text not null,
  desde        date not null,
  hasta        date not null check (hasta >= desde),
  frecuencia   text not null check (frecuencia in ('mensual', 'quincenal')),
  estado       text not null default 'borrador' check (estado in ('borrador', 'aprobada')),
  aprobada_en  timestamptz,
  aprobada_por uuid references public.perfiles(id),
  creado_por   uuid default auth.uid() references public.perfiles(id),
  creado_en    timestamptz not null default now(),
  unique (sistema_id, numero),
  unique (sistema_id, id)
);
create index ix_nominas_sistema on public.nominas (sistema_id, desde desc);
create index ix_fk_nominas_aprobada_por on public.nominas (aprobada_por);
create index ix_fk_nominas_creado_por on public.nominas (creado_por);

create table public.nomina_lineas (
  id                uuid primary key default gen_random_uuid(),
  sistema_id        uuid not null references public.sistemas(id) on delete restrict,
  nomina_id         uuid not null,
  empleado_id       uuid not null,
  salario           numeric(12, 2) not null default 0,
  horas_extra       numeric(12, 2) not null default 0 check (horas_extra >= 0),
  bonos             numeric(12, 2) not null default 0 check (bonos >= 0),
  otros_ingresos    numeric(12, 2) not null default 0 check (otros_ingresos >= 0),
  bruto             numeric(12, 2) not null default 0,
  afp               numeric(12, 2) not null default 0,
  sfs               numeric(12, 2) not null default 0,
  isr               numeric(12, 2) not null default 0,
  otras_deducciones numeric(12, 2) not null default 0 check (otras_deducciones >= 0),
  neto              numeric(12, 2) not null default 0,
  afp_patronal      numeric(12, 2) not null default 0,
  sfs_patronal      numeric(12, 2) not null default 0,
  srl_patronal      numeric(12, 2) not null default 0,
  infotep           numeric(12, 2) not null default 0,
  unique (nomina_id, empleado_id),
  foreign key (sistema_id, nomina_id) references public.nominas (sistema_id, id) on delete cascade,
  foreign key (sistema_id, empleado_id) references public.empleados (sistema_id, id)
);
create index ix_fk_nomina_lineas_nomina on public.nomina_lineas (sistema_id, nomina_id);
create index ix_fk_nomina_lineas_empleado on public.nomina_lineas (sistema_id, empleado_id);

create trigger trg_nominas_auditoria after insert or update or delete on public.nominas
  for each row execute function privado.tg_auditar();

-- Una nómina aprobada queda congelada.
create or replace function privado.tg_nomina_congelada()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_estado text;
begin
  if tg_table_name = 'nominas' then
    if old.estado = 'aprobada' then
      raise exception 'La nómina % ya está aprobada y no puede modificarse.', old.numero using errcode = '42501';
    end if;
  else
    select estado into v_estado from public.nominas where id = coalesce(new.nomina_id, old.nomina_id);
    if v_estado = 'aprobada' then
      raise exception 'La nómina ya está aprobada y no puede modificarse.' using errcode = '42501';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;
create trigger trg_nominas_congelada before update or delete on public.nominas
  for each row execute function privado.tg_nomina_congelada();
create trigger trg_nomina_lineas_congelada before insert or update or delete on public.nomina_lineas
  for each row execute function privado.tg_nomina_congelada();

create or replace function privado.isr_anual(p_escala jsonb, p_ingreso numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select coalesce((
    select round((t ->> 'fijo')::numeric + greatest(p_ingreso - (t ->> 'exceso_de')::numeric, 0) * (t ->> 'tasa')::numeric / 100, 2)
      from jsonb_array_elements(p_escala) t
     where (t ->> 'hasta') is null or p_ingreso <= (t ->> 'hasta')::numeric
     order by coalesce((t ->> 'hasta')::numeric, 'infinity'::numeric)
     limit 1), 0);
$$;

create or replace function privado.calcular_linea_nomina(p_linea uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.nomina_lineas;
  n public.nominas;
  p public.parametros_nomina;
  v_periodos int;
  v_bruto numeric;
  v_base_afp numeric;
  v_base_sfs numeric;
  v_afp numeric;
  v_sfs numeric;
  v_isr numeric;
begin
  select * into l from public.nomina_lineas where id = p_linea;
  select * into n from public.nominas where id = l.nomina_id;
  select * into p from public.parametros_nomina where sistema_id = l.sistema_id;
  v_periodos := case n.frecuencia when 'quincenal' then 24 else 12 end;

  v_bruto := l.salario + l.horas_extra + l.bonos + l.otros_ingresos;
  v_base_afp := least(v_bruto, coalesce(p.tope_afp_mensual * 12 / v_periodos, v_bruto));
  v_base_sfs := least(v_bruto, coalesce(p.tope_sfs_mensual * 12 / v_periodos, v_bruto));
  v_afp := round(v_base_afp * p.afp_empleado / 100, 2);
  v_sfs := round(v_base_sfs * p.sfs_empleado / 100, 2);
  v_isr := round(privado.isr_anual(p.escala_isr, (v_bruto - v_afp - v_sfs) * v_periodos) / v_periodos, 2);

  update public.nomina_lineas set
    bruto = v_bruto,
    afp = v_afp,
    sfs = v_sfs,
    isr = v_isr,
    neto = v_bruto - v_afp - v_sfs - v_isr - otras_deducciones,
    afp_patronal = round(v_base_afp * p.afp_empleador / 100, 2),
    sfs_patronal = round(v_base_sfs * p.sfs_empleador / 100, 2),
    srl_patronal = round(v_bruto * p.srl_empleador / 100, 2),
    infotep = round(v_bruto * p.infotep / 100, 2)
  where id = p_linea;
end;
$$;

create or replace function privado.lineas_asiento_nomina(p_nomina uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with t as (
    select n.sistema_id, sum(l.bruto) bruto, sum(l.afp + l.sfs) tss, sum(l.isr) isr, sum(l.otras_deducciones) otras,
           sum(l.neto) neto, sum(l.afp_patronal + l.sfs_patronal + l.srl_patronal + l.infotep) patronal
      from public.nominas n join public.nomina_lineas l on l.nomina_id = n.id
     where n.id = p_nomina
     group by n.sistema_id
  )
  select jsonb_build_array(
    jsonb_build_object('cuenta', privado.cuenta(sistema_id, 'gasto_sueldos'), 'debe', bruto, 'descripcion', 'Sueldos y salarios'),
    jsonb_build_object('cuenta', privado.cuenta(sistema_id, 'gasto_aportes'), 'debe', patronal, 'descripcion', 'Aportes patronales'),
    jsonb_build_object('cuenta', privado.cuenta(sistema_id, 'retenciones_tss'), 'haber', tss, 'descripcion', 'AFP y SFS retenidos'),
    jsonb_build_object('cuenta', privado.cuenta(sistema_id, 'isr_por_pagar'), 'haber', isr, 'descripcion', 'ISR retenido'),
    jsonb_build_object('cuenta', privado.cuenta(sistema_id, 'otras_retenciones'), 'haber', otras, 'descripcion', 'Otras deducciones'),
    jsonb_build_object('cuenta', privado.cuenta(sistema_id, 'aportes_por_pagar'), 'haber', patronal, 'descripcion', 'Aportes patronales por pagar'),
    jsonb_build_object('cuenta', privado.cuenta(sistema_id, 'sueldos_por_pagar'), 'haber', neto, 'descripcion', 'Neto a pagar')
  ) from t;
$$;

create or replace function public.generar_nomina(p_sistema uuid, p_desde date, p_hasta date, p_frecuencia text, p_descripcion text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
  l record;
begin
  if not privado.tiene_rol(p_sistema, '{admin,contabilidad,gerencia}') then
    raise exception 'No tienes permiso para generar nóminas.' using errcode = '42501';
  end if;
  insert into public.parametros_nomina (sistema_id) values (p_sistema) on conflict do nothing;

  insert into public.nominas (id, sistema_id, numero, descripcion, desde, hasta, frecuencia, creado_por)
  values (v_id, p_sistema, 'NOM-' || lpad(privado.siguiente_numero(p_sistema, 'nomina')::text, 5, '0'),
          coalesce(nullif(trim(p_descripcion), ''), 'Nómina ' || to_char(p_desde, 'DD/MM/YYYY') || ' – ' || to_char(p_hasta, 'DD/MM/YYYY')),
          p_desde, p_hasta, p_frecuencia, auth.uid());

  insert into public.nomina_lineas (sistema_id, nomina_id, empleado_id, salario)
  select p_sistema, v_id, e.id, round(case p_frecuencia when 'quincenal' then e.salario_mensual / 2 else e.salario_mensual end, 2)
    from public.empleados e
   where e.sistema_id = p_sistema and e.activo and e.frecuencia = p_frecuencia;

  for l in select id from public.nomina_lineas where nomina_id = v_id loop
    perform privado.calcular_linea_nomina(l.id);
  end loop;
  return v_id;
end;
$$;

create or replace function public.actualizar_linea_nomina(
  p_linea uuid, p_horas_extra numeric, p_bonos numeric, p_otros_ingresos numeric, p_otras_deducciones numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sistema uuid;
begin
  select sistema_id into v_sistema from public.nomina_lineas where id = p_linea;
  if v_sistema is null or not privado.tiene_rol(v_sistema, '{admin,contabilidad,gerencia}') then
    raise exception 'Línea no encontrada o sin permiso.' using errcode = '42501';
  end if;
  update public.nomina_lineas set
    horas_extra = coalesce(p_horas_extra, 0), bonos = coalesce(p_bonos, 0),
    otros_ingresos = coalesce(p_otros_ingresos, 0), otras_deducciones = coalesce(p_otras_deducciones, 0)
  where id = p_linea;
  perform privado.calcular_linea_nomina(p_linea);
end;
$$;

create or replace function public.recalcular_nomina(p_nomina uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  n public.nominas;
  l record;
begin
  select * into n from public.nominas where id = p_nomina;
  if n.id is null or not privado.tiene_rol(n.sistema_id, '{admin,contabilidad,gerencia}') then
    raise exception 'Nómina no encontrada o sin permiso.' using errcode = '42501';
  end if;
  for l in select id from public.nomina_lineas where nomina_id = p_nomina loop
    perform privado.calcular_linea_nomina(l.id);
  end loop;
end;
$$;

create or replace function public.vista_previa_asiento_nomina(p_nomina uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  n public.nominas;
begin
  select * into n from public.nominas where id = p_nomina;
  if n.id is null or not privado.tiene_rol(n.sistema_id, '{admin,contabilidad,gerencia,auditor}') then
    raise exception 'Nómina no encontrada o sin permiso.' using errcode = '42501';
  end if;
  return (
    select jsonb_agg(l || jsonb_build_object('nombre', c.nombre))
      from jsonb_array_elements(privado.lineas_asiento_nomina(p_nomina)) l
      left join public.cuentas_contables c on c.sistema_id = n.sistema_id and c.codigo = l ->> 'cuenta'
     where coalesce((l ->> 'debe')::numeric, (l ->> 'haber')::numeric, 0) > 0
  );
end;
$$;

create or replace function public.aprobar_nomina(p_nomina uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  n public.nominas;
  v_asiento uuid;
begin
  select * into n from public.nominas where id = p_nomina for update;
  if n.id is null or not privado.tiene_rol(n.sistema_id, '{admin,contabilidad,gerencia}') then
    raise exception 'Nómina no encontrada o sin permiso.' using errcode = '42501';
  end if;
  if n.estado <> 'borrador' then
    raise exception 'La nómina ya está aprobada.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.nomina_lineas where nomina_id = p_nomina) then
    raise exception 'La nómina no tiene empleados.' using errcode = 'P0001';
  end if;

  v_asiento := privado.crear_asiento(n.sistema_id, n.hasta, n.descripcion || ' (' || n.numero || ')', 'nomina', n.id,
                                     privado.lineas_asiento_nomina(p_nomina));
  update public.nominas set estado = 'aprobada', aprobada_en = now(), aprobada_por = auth.uid() where id = p_nomina;
  return v_asiento;
end;
$$;

create or replace function public.eliminar_nomina_borrador(p_nomina uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  n public.nominas;
begin
  select * into n from public.nominas where id = p_nomina;
  if n.id is null or not privado.tiene_rol(n.sistema_id, '{admin,contabilidad,gerencia}') then
    raise exception 'Nómina no encontrada o sin permiso.' using errcode = '42501';
  end if;
  delete from public.nominas where id = p_nomina;
end;
$$;

-- Parámetros por defecto para los sistemas existentes y nuevos.
insert into public.parametros_nomina (sistema_id) select id from public.sistemas on conflict do nothing;
create or replace function privado.tg_sistema_sembrar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.sembrar_catalogo(new.id);
  insert into public.parametros_nomina (sistema_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.proveedores        enable row level security;
alter table public.compras            enable row level security;
alter table public.compra_items       enable row level security;
alter table public.anulaciones_compra enable row level security;
alter table public.empleados          enable row level security;
alter table public.parametros_nomina  enable row level security;
alter table public.nominas            enable row level security;
alter table public.nomina_lineas      enable row level security;

create policy proveedores_select on public.proveedores for select to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{admin,farmacia,contabilidad,gerencia,auditor}')));
create policy proveedores_insert on public.proveedores for insert to authenticated
  with check (sistema_id in (select privado.mis_sistemas_con_rol('{admin,farmacia,contabilidad,gerencia}')));
create policy proveedores_update on public.proveedores for update to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{admin,farmacia,contabilidad,gerencia}')))
  with check (sistema_id in (select privado.mis_sistemas_con_rol('{admin,farmacia,contabilidad,gerencia}')));

create policy compras_select on public.compras for select to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{admin,farmacia,contabilidad,gerencia,auditor}')));
create policy compra_items_select on public.compra_items for select to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{admin,farmacia,contabilidad,gerencia,auditor}')));
create policy anul_compra_select on public.anulaciones_compra for select to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{admin,farmacia,contabilidad,gerencia,auditor}')));

-- Datos salariales: solo administración, contabilidad y gerencia.
create policy empleados_select on public.empleados for select to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{admin,contabilidad,gerencia}')));
create policy empleados_insert on public.empleados for insert to authenticated
  with check (sistema_id in (select privado.mis_sistemas_con_rol('{admin,contabilidad,gerencia}')));
create policy empleados_update on public.empleados for update to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{admin,contabilidad,gerencia}')))
  with check (sistema_id in (select privado.mis_sistemas_con_rol('{admin,contabilidad,gerencia}')));

create policy parametros_select on public.parametros_nomina for select to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{admin,contabilidad,gerencia}')));
create policy parametros_update on public.parametros_nomina for update to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{admin,contabilidad}')))
  with check (sistema_id in (select privado.mis_sistemas_con_rol('{admin,contabilidad}')));

create policy nominas_select on public.nominas for select to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{admin,contabilidad,gerencia,auditor}')));
create policy nomina_lineas_select on public.nomina_lineas for select to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{admin,contabilidad,gerencia,auditor}')));

revoke all on public.proveedores, public.compras, public.compra_items, public.anulaciones_compra, public.empleados,
  public.parametros_nomina, public.nominas, public.nomina_lineas from anon;
revoke insert, update, delete, truncate on public.compras, public.compra_items, public.anulaciones_compra,
  public.nominas, public.nomina_lineas from authenticated;
revoke delete, truncate on public.proveedores, public.empleados, public.parametros_nomina from authenticated;
revoke insert on public.parametros_nomina from authenticated;
grant select on public.compras, public.compra_items, public.anulaciones_compra, public.nominas, public.nomina_lineas to authenticated;
grant select, insert, update on public.proveedores, public.empleados to authenticated;
grant select, update on public.parametros_nomina to authenticated;

revoke all on function public.registrar_compra(uuid, uuid, date, text, text, jsonb, text) from public, anon;
revoke all on function public.anular_compra(uuid, text) from public, anon;
revoke all on function public.generar_nomina(uuid, date, date, text, text) from public, anon;
revoke all on function public.actualizar_linea_nomina(uuid, numeric, numeric, numeric, numeric) from public, anon;
revoke all on function public.recalcular_nomina(uuid) from public, anon;
revoke all on function public.vista_previa_asiento_nomina(uuid) from public, anon;
revoke all on function public.aprobar_nomina(uuid) from public, anon;
revoke all on function public.eliminar_nomina_borrador(uuid) from public, anon;
grant execute on function public.registrar_compra(uuid, uuid, date, text, text, jsonb, text) to authenticated;
grant execute on function public.anular_compra(uuid, text) to authenticated;
grant execute on function public.generar_nomina(uuid, date, date, text, text) to authenticated;
grant execute on function public.actualizar_linea_nomina(uuid, numeric, numeric, numeric, numeric) to authenticated;
grant execute on function public.recalcular_nomina(uuid) to authenticated;
grant execute on function public.vista_previa_asiento_nomina(uuid) to authenticated;
grant execute on function public.aprobar_nomina(uuid) to authenticated;
grant execute on function public.eliminar_nomina_borrador(uuid) to authenticated;
revoke all on function privado.calcular_linea_nomina(uuid) from public, anon, authenticated;
revoke all on function privado.lineas_asiento_nomina(uuid) from public, anon, authenticated;
revoke all on function privado.isr_anual(jsonb, numeric) from public, anon, authenticated;
