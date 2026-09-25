-- ============================================================================
-- MEDORA · 0010 · Contabilidad
--
-- Catálogo de cuentas por sistema (se siembra uno estándar al crear el sistema),
-- cuentas predeterminadas (a qué cuenta va cada cosa, incluido el ingreso por
-- categoría de servicio) y asientos append-only. Cobros, anticipos, abonos,
-- compras, comisiones y nómina generan su asiento automáticamente con
-- privado.crear_asiento(), que exige que cuadre (debe = haber).
-- ============================================================================

create table public.cuentas_contables (
  id                uuid primary key default gen_random_uuid(),
  sistema_id        uuid not null references public.sistemas(id) on delete restrict,
  codigo            text not null check (codigo ~ '^[0-9]+(\.[0-9]+)*$'),
  nombre            text not null check (char_length(nombre) between 2 and 160),
  tipo              text not null check (tipo in ('activo', 'pasivo', 'patrimonio', 'ingreso', 'costo', 'gasto')),
  padre_codigo      text,
  acepta_movimiento boolean not null default true,
  activo            boolean not null default true,
  busqueda          text generated always as (lower(codigo || ' ' || nombre)) stored,
  creado_en         timestamptz not null default now(),
  creado_por        uuid default auth.uid(),
  actualizado_en    timestamptz not null default now(),
  actualizado_por   uuid,
  unique (sistema_id, codigo),
  foreign key (sistema_id, padre_codigo) references public.cuentas_contables (sistema_id, codigo) on update cascade
);
create index ix_cuentas_busqueda on public.cuentas_contables using gin (busqueda extensions.gin_trgm_ops);
create index ix_fk_cuentas_padre on public.cuentas_contables (sistema_id, padre_codigo);
create trigger trg_cuentas_actualizacion before update on public.cuentas_contables
  for each row execute function privado.tg_marcar_actualizacion();
create trigger trg_cuentas_contables_auditoria after insert or update or delete on public.cuentas_contables
  for each row execute function privado.tg_auditar();

-- A qué cuenta va cada concepto. Claves: caja, banco, cxc_pacientes,
-- cxc_aseguradoras, inventario, itbis_compras, cxp, anticipos_pacientes,
-- sueldos_por_pagar, retenciones_tss, isr_por_pagar, otras_retenciones,
-- aportes_por_pagar, comisiones_por_pagar, gasto_sueldos, gasto_aportes,
-- gasto_comisiones, gasto_general, descuentos, ingreso_<categoría de servicio>.
create table public.cuentas_predeterminadas (
  sistema_id    uuid not null references public.sistemas(id) on delete restrict,
  clave         text not null,
  cuenta_codigo text not null,
  primary key (sistema_id, clave),
  foreign key (sistema_id, cuenta_codigo) references public.cuentas_contables (sistema_id, codigo) on update cascade
);
create index ix_fk_predeterminadas_cuenta on public.cuentas_predeterminadas (sistema_id, cuenta_codigo);
create trigger trg_cuentas_predeterminadas_auditoria after insert or update or delete on public.cuentas_predeterminadas
  for each row execute function privado.tg_auditar();

-- Asientos (append-only) ------------------------------------------------------
create table public.asientos (
  id          uuid primary key default gen_random_uuid(),
  sistema_id  uuid not null references public.sistemas(id) on delete restrict,
  numero      bigint not null,
  fecha       date not null,
  concepto    text not null,
  origen      text not null check (origen in ('manual', 'cobro', 'anulacion', 'anticipo', 'abono', 'compra', 'nomina', 'comision', 'reverso')),
  origen_id   uuid,
  creado_por  uuid default auth.uid() references public.perfiles(id),
  creado_en   timestamptz not null default now(),
  unique (sistema_id, numero),
  unique (sistema_id, id)
);
create index ix_asientos_sistema_fecha on public.asientos (sistema_id, fecha desc, numero desc);
create index ix_asientos_origen on public.asientos (origen, origen_id);
create index ix_fk_asientos_creado_por on public.asientos (creado_por);

create table public.asiento_lineas (
  id            uuid primary key default gen_random_uuid(),
  sistema_id    uuid not null references public.sistemas(id) on delete restrict,
  asiento_id    uuid not null,
  cuenta_codigo text not null,
  debe          numeric(14, 2) not null default 0 check (debe >= 0),
  haber         numeric(14, 2) not null default 0 check (haber >= 0),
  descripcion   text,
  check ((debe > 0) <> (haber > 0)),
  foreign key (sistema_id, asiento_id) references public.asientos (sistema_id, id),
  foreign key (sistema_id, cuenta_codigo) references public.cuentas_contables (sistema_id, codigo) on update cascade
);
create index ix_lineas_asiento on public.asiento_lineas (asiento_id);
create index ix_lineas_cuenta on public.asiento_lineas (sistema_id, cuenta_codigo);

create trigger trg_asientos_append_only before update or delete on public.asientos
  for each row execute function privado.tg_bloquear_append_only();
-- Las líneas sí aceptan UPDATE de cuenta_codigo por el ON UPDATE CASCADE (renombrar
-- un código del catálogo); cualquier otro cambio queda bloqueado.
create or replace function privado.tg_lineas_solo_recodificar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
     or new.debe is distinct from old.debe or new.haber is distinct from old.haber
     or new.asiento_id is distinct from old.asiento_id or new.sistema_id is distinct from old.sistema_id then
    raise exception 'Las líneas de asiento son append-only.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger trg_lineas_append_only before update or delete on public.asiento_lineas
  for each row execute function privado.tg_lineas_solo_recodificar();

create trigger trg_asientos_auditoria after insert on public.asientos
  for each row execute function privado.tg_auditar();

-- Cuadre: se verifica al final de la transacción (constraint trigger diferido).
create or replace function privado.tg_verificar_cuadre()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_debe numeric;
  v_haber numeric;
begin
  select coalesce(sum(debe), 0), coalesce(sum(haber), 0) into v_debe, v_haber
    from public.asiento_lineas where asiento_id = new.asiento_id;
  if v_debe <> v_haber then
    raise exception 'El asiento no cuadra (debe % ≠ haber %).', v_debe, v_haber using errcode = 'P0001';
  end if;
  return null;
end;
$$;
create constraint trigger trg_asiento_cuadre after insert on public.asiento_lineas
  deferrable initially deferred
  for each row execute function privado.tg_verificar_cuadre();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function privado.cuenta(p_sistema uuid, p_clave text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v text;
begin
  select cuenta_codigo into v from public.cuentas_predeterminadas where sistema_id = p_sistema and clave = p_clave;
  if v is null and p_clave like 'ingreso\_%' then
    select cuenta_codigo into v from public.cuentas_predeterminadas where sistema_id = p_sistema and clave = 'ingreso_otro';
  end if;
  if v is null then
    raise exception 'Falta configurar la cuenta contable "%" (Contabilidad → Configuración).', p_clave using errcode = 'P0001';
  end if;
  return v;
end;
$$;

-- p_lineas: [{ "cuenta": "1.1.01", "debe": 100, "haber": 0, "descripcion": "..." }, ...]
create or replace function privado.crear_asiento(
  p_sistema uuid, p_fecha date, p_concepto text, p_origen text, p_origen_id uuid, p_lineas jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id    uuid := gen_random_uuid();
  v_agr   jsonb;
  v_debe  numeric;
  v_haber numeric;
begin
  -- Agrupa por cuenta y lado; descarta montos en cero.
  with l as (
    select x ->> 'cuenta' as cuenta,
           coalesce((x ->> 'debe')::numeric, 0) as d,
           coalesce((x ->> 'haber')::numeric, 0) as h,
           x ->> 'descripcion' as descr
      from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) x
  ), agr as (
    select cuenta, round(sum(d), 2) as debe, 0::numeric as haber, min(descr) as descripcion from l where d > 0 group by cuenta
    union all
    select cuenta, 0::numeric, round(sum(h), 2), min(descr) from l where h > 0 group by cuenta
  )
  select coalesce(jsonb_agg(to_jsonb(agr)), '[]'::jsonb), coalesce(sum(debe), 0), coalesce(sum(haber), 0)
    into v_agr, v_debe, v_haber
    from agr;

  if v_debe = 0 then
    return null;
  end if;
  if v_debe <> v_haber then
    raise exception 'El asiento no cuadra (debe % ≠ haber %).', v_debe, v_haber using errcode = 'P0001';
  end if;

  insert into public.asientos (id, sistema_id, numero, fecha, concepto, origen, origen_id, creado_por)
  values (v_id, p_sistema, privado.siguiente_numero(p_sistema, 'asiento'), coalesce(p_fecha, current_date),
          p_concepto, p_origen, p_origen_id, auth.uid());

  insert into public.asiento_lineas (sistema_id, asiento_id, cuenta_codigo, debe, haber, descripcion)
  select p_sistema, v_id, r.cuenta, r.debe, r.haber, r.descripcion
    from jsonb_to_recordset(v_agr) as r(cuenta text, debe numeric, haber numeric, descripcion text);

  return v_id;
end;
$$;

-- Asiento espejo (anulaciones).
create or replace function privado.revertir_asientos(p_origen text, p_origen_id uuid, p_concepto text, p_fecha date default current_date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a record;
begin
  for a in select * from public.asientos where origen = p_origen and origen_id = p_origen_id loop
    perform privado.crear_asiento(
      a.sistema_id, p_fecha, p_concepto, 'reverso', a.id,
      (select jsonb_agg(jsonb_build_object('cuenta', cuenta_codigo, 'debe', haber, 'haber', debe, 'descripcion', descripcion))
         from public.asiento_lineas where asiento_id = a.id)
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Catálogo estándar (clínicas/hospitales, República Dominicana)
-- ---------------------------------------------------------------------------
create or replace function privado.sembrar_catalogo(p_sistema uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.cuentas_contables (sistema_id, codigo, nombre, tipo, padre_codigo, acepta_movimiento)
  select p_sistema, c.codigo, c.nombre, c.tipo, c.padre, c.mov
    from (values
      ('1',       'Activos',                                   'activo',     null,    false),
      ('1.1',     'Activos corrientes',                        'activo',     '1',     false),
      ('1.1.01',  'Caja general',                              'activo',     '1.1',   true),
      ('1.1.02',  'Bancos',                                    'activo',     '1.1',   true),
      ('1.1.03',  'Cuentas por cobrar a pacientes',            'activo',     '1.1',   true),
      ('1.1.04',  'Cuentas por cobrar a aseguradoras (ARS)',   'activo',     '1.1',   true),
      ('1.1.05',  'Inventario de medicamentos e insumos',      'activo',     '1.1',   true),
      ('1.1.06',  'ITBIS pagado en compras',                   'activo',     '1.1',   true),
      ('1.2',     'Activos fijos',                             'activo',     '1',     false),
      ('1.2.01',  'Equipos médicos',                           'activo',     '1.2',   true),
      ('1.2.02',  'Mobiliario y equipos de oficina',           'activo',     '1.2',   true),
      ('2',       'Pasivos',                                   'pasivo',     null,    false),
      ('2.1',     'Pasivos corrientes',                        'pasivo',     '2',     false),
      ('2.1.01',  'Cuentas por pagar a proveedores',           'pasivo',     '2.1',   true),
      ('2.1.02',  'Anticipos recibidos de pacientes',          'pasivo',     '2.1',   true),
      ('2.1.03',  'Sueldos por pagar',                         'pasivo',     '2.1',   true),
      ('2.1.04',  'Retenciones TSS por pagar',                 'pasivo',     '2.1',   true),
      ('2.1.05',  'ISR retenido a empleados por pagar',        'pasivo',     '2.1',   true),
      ('2.1.06',  'Otras retenciones a empleados',             'pasivo',     '2.1',   true),
      ('2.1.07',  'Aportes patronales por pagar (TSS/INFOTEP)','pasivo',     '2.1',   true),
      ('2.1.08',  'Comisiones por pagar',                      'pasivo',     '2.1',   true),
      ('2.1.09',  'ITBIS por pagar',                           'pasivo',     '2.1',   true),
      ('3',       'Patrimonio',                                'patrimonio', null,    false),
      ('3.1',     'Capital',                                   'patrimonio', '3',     true),
      ('3.2',     'Resultados acumulados',                     'patrimonio', '3',     true),
      ('4',       'Ingresos',                                  'ingreso',    null,    false),
      ('4.1',     'Ingresos por servicios de salud',           'ingreso',    '4',     false),
      ('4.1.01',  'Ingresos por consultas',                    'ingreso',    '4.1',   true),
      ('4.1.02',  'Ingresos por procedimientos',               'ingreso',    '4.1',   true),
      ('4.1.03',  'Ingresos por laboratorio',                  'ingreso',    '4.1',   true),
      ('4.1.04',  'Ingresos por imágenes',                     'ingreso',    '4.1',   true),
      ('4.1.05',  'Ingresos por emergencias',                  'ingreso',    '4.1',   true),
      ('4.1.06',  'Ingresos por hospitalización',              'ingreso',    '4.1',   true),
      ('4.1.07',  'Ingresos por farmacia',                     'ingreso',    '4.1',   true),
      ('4.1.99',  'Otros ingresos por servicios',              'ingreso',    '4.1',   true),
      ('4.2',     'Otros ingresos',                            'ingreso',    '4',     true),
      ('5',       'Costos',                                    'costo',      null,    false),
      ('5.1',     'Costo de medicamentos e insumos',           'costo',      '5',     true),
      ('6',       'Gastos',                                    'gasto',      null,    false),
      ('6.1',     'Gastos de personal',                        'gasto',      '6',     false),
      ('6.1.01',  'Sueldos y salarios',                        'gasto',      '6.1',   true),
      ('6.1.02',  'Aportes patronales (TSS, INFOTEP)',         'gasto',      '6.1',   true),
      ('6.1.03',  'Comisiones',                                'gasto',      '6.1',   true),
      ('6.2',     'Gastos generales',                          'gasto',      '6',     false),
      ('6.2.01',  'Suministros',                               'gasto',      '6.2',   true),
      ('6.2.02',  'Servicios públicos',                        'gasto',      '6.2',   true),
      ('6.2.03',  'Mantenimiento',                             'gasto',      '6.2',   true),
      ('6.2.04',  'Alquiler',                                  'gasto',      '6.2',   true),
      ('6.2.99',  'Otros gastos',                              'gasto',      '6.2',   true),
      ('6.3',     'Descuentos concedidos',                     'gasto',      '6',     true)
    ) as c(codigo, nombre, tipo, padre, mov)
  on conflict (sistema_id, codigo) do nothing;

  insert into public.cuentas_predeterminadas (sistema_id, clave, cuenta_codigo)
  select p_sistema, d.clave, d.codigo
    from (values
      ('caja', '1.1.01'), ('banco', '1.1.02'), ('cxc_pacientes', '1.1.03'), ('cxc_aseguradoras', '1.1.04'),
      ('inventario', '1.1.05'), ('itbis_compras', '1.1.06'), ('cxp', '2.1.01'), ('anticipos_pacientes', '2.1.02'),
      ('sueldos_por_pagar', '2.1.03'), ('retenciones_tss', '2.1.04'), ('isr_por_pagar', '2.1.05'),
      ('otras_retenciones', '2.1.06'), ('aportes_por_pagar', '2.1.07'), ('comisiones_por_pagar', '2.1.08'),
      ('gasto_sueldos', '6.1.01'), ('gasto_aportes', '6.1.02'), ('gasto_comisiones', '6.1.03'),
      ('gasto_general', '6.2.99'), ('descuentos', '6.3'),
      ('ingreso_consulta', '4.1.01'), ('ingreso_procedimiento', '4.1.02'), ('ingreso_laboratorio', '4.1.03'),
      ('ingreso_imagen', '4.1.04'), ('ingreso_emergencia', '4.1.05'), ('ingreso_hospitalizacion', '4.1.06'),
      ('ingreso_farmacia', '4.1.07'), ('ingreso_otro', '4.1.99')
    ) as d(clave, codigo)
  on conflict (sistema_id, clave) do nothing;
end;
$$;

create or replace function privado.tg_sistema_sembrar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.sembrar_catalogo(new.id);
  return new;
end;
$$;
create trigger trg_sistemas_sembrar_catalogo after insert on public.sistemas
  for each row execute function privado.tg_sistema_sembrar();

-- Sistemas ya existentes.
select privado.sembrar_catalogo(id) from public.sistemas;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.cuentas_contables       enable row level security;
alter table public.cuentas_predeterminadas enable row level security;
alter table public.asientos                enable row level security;
alter table public.asiento_lineas          enable row level security;

create policy cuentas_select on public.cuentas_contables for select to authenticated
  using (sistema_id in (select privado.mis_sistemas()));
create policy cuentas_insert on public.cuentas_contables for insert to authenticated
  with check (sistema_id in (select privado.mis_sistemas_con_rol('{admin,contabilidad}')));
create policy cuentas_update on public.cuentas_contables for update to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{admin,contabilidad}')))
  with check (sistema_id in (select privado.mis_sistemas_con_rol('{admin,contabilidad}')));

create policy predeterminadas_select on public.cuentas_predeterminadas for select to authenticated
  using (sistema_id in (select privado.mis_sistemas()));
create policy predeterminadas_insert on public.cuentas_predeterminadas for insert to authenticated
  with check (sistema_id in (select privado.mis_sistemas_con_rol('{admin,contabilidad}')));
create policy predeterminadas_update on public.cuentas_predeterminadas for update to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{admin,contabilidad}')))
  with check (sistema_id in (select privado.mis_sistemas_con_rol('{admin,contabilidad}')));

create policy asientos_select on public.asientos for select to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{admin,contabilidad,gerencia,auditor}')));
create policy asiento_lineas_select on public.asiento_lineas for select to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{admin,contabilidad,gerencia,auditor}')));

revoke all on public.cuentas_contables, public.cuentas_predeterminadas, public.asientos, public.asiento_lineas from anon;
revoke delete, truncate on public.cuentas_contables, public.cuentas_predeterminadas from authenticated;
revoke insert, update, delete, truncate on public.asientos, public.asiento_lineas from authenticated;
grant select, insert, update on public.cuentas_contables, public.cuentas_predeterminadas to authenticated;
grant select on public.asientos, public.asiento_lineas to authenticated;

-- ---------------------------------------------------------------------------
-- RPC
-- ---------------------------------------------------------------------------
create or replace function public.registrar_asiento_manual(p_sistema uuid, p_fecha date, p_concepto text, p_lineas jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not privado.tiene_rol(p_sistema, '{admin,contabilidad}') then
    raise exception 'Solo administración o contabilidad registran asientos manuales.' using errcode = '42501';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lineas) l
     where not exists (select 1 from public.cuentas_contables c
                        where c.sistema_id = p_sistema and c.codigo = l ->> 'cuenta' and c.acepta_movimiento and c.activo)
  ) then
    raise exception 'Hay cuentas inexistentes, inactivas o de agrupación (no aceptan movimiento).' using errcode = 'P0001';
  end if;
  return privado.crear_asiento(p_sistema, p_fecha, p_concepto, 'manual', null, p_lineas);
end;
$$;

create or replace function public.balanza_comprobacion(p_sistema uuid, p_desde date, p_hasta date)
returns table (codigo text, nombre text, tipo text, debe numeric, haber numeric, saldo numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.codigo, c.nombre, c.tipo,
         coalesce(sum(l.debe), 0), coalesce(sum(l.haber), 0),
         case when c.tipo in ('activo', 'costo', 'gasto') then coalesce(sum(l.debe - l.haber), 0)
              else coalesce(sum(l.haber - l.debe), 0) end
    from public.cuentas_contables c
    join public.asiento_lineas l on l.sistema_id = c.sistema_id and l.cuenta_codigo = c.codigo
    join public.asientos a on a.id = l.asiento_id
   where c.sistema_id = p_sistema and a.fecha between p_desde and p_hasta
   group by c.codigo, c.nombre, c.tipo
   order by c.codigo;
$$;

revoke all on function public.registrar_asiento_manual(uuid, date, text, jsonb) from public, anon;
revoke all on function public.balanza_comprobacion(uuid, date, date) from public, anon;
grant execute on function public.registrar_asiento_manual(uuid, date, text, jsonb) to authenticated;
grant execute on function public.balanza_comprobacion(uuid, date, date) to authenticated;
revoke all on function privado.crear_asiento(uuid, date, text, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function privado.revertir_asientos(text, uuid, text, date) from public, anon, authenticated;
revoke all on function privado.sembrar_catalogo(uuid) from public, anon, authenticated;
revoke all on function privado.tg_sistema_sembrar() from public, anon, authenticated;
