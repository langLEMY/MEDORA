-- ============================================================================
-- MEDORA · Donaciones
--
-- Registro de donaciones a la institución (donante, cédula/RNC, destino, anónima).
-- Append-only con anulación aparte; cada donación entra a caja si es en efectivo
-- y genera su asiento: método de pago contra 4.4 Donaciones recibidas.
-- ============================================================================

CREATE OR REPLACE FUNCTION privado.sembrar_catalogo(p_sistema uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      ('4.3',     'Fondo interno (excedente de aseguradoras)', 'ingreso',    '4',     true),
      ('4.4',     'Donaciones recibidas',                      'ingreso',    '4',     true),
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
      ('ingreso_farmacia', '4.1.07'), ('ingreso_otro', '4.1.99'), ('ingreso_fondo_interno', '4.3'), ('ingreso_donaciones', '4.4')
    ) as d(clave, codigo)
  on conflict (sistema_id, clave) do nothing;
end;
$function$;
-- Los asientos de donaciones tienen su propio origen.
alter table public.asientos drop constraint if exists asientos_origen_check;
alter table public.asientos add constraint asientos_origen_check
  check (origen in ('manual', 'cobro', 'anulacion', 'anticipo', 'abono', 'compra', 'nomina', 'comision', 'reverso', 'donacion'));

-- Cuenta de ingresos "Donaciones recibidas" en los sistemas que ya existen.
insert into public.cuentas_contables (sistema_id, codigo, nombre, tipo, padre_codigo, acepta_movimiento)
select s.id, '4.4', 'Donaciones recibidas', 'ingreso', '4', true
  from public.sistemas s
 where exists (select 1 from public.cuentas_contables c where c.sistema_id = s.id and c.codigo = '4')
on conflict (sistema_id, codigo) do nothing;
insert into public.cuentas_predeterminadas (sistema_id, clave, cuenta_codigo)
select c.sistema_id, 'ingreso_donaciones', '4.4' from public.cuentas_contables c where c.codigo = '4.4'
on conflict (sistema_id, clave) do nothing;

-- ---------------------------------------------------------------------------
create table public.donaciones (
  id                uuid primary key default gen_random_uuid(),
  sistema_id        uuid not null references public.sistemas(id) on delete restrict,
  numero            text not null,
  donante_nombre    text not null check (length(trim(donante_nombre)) between 2 and 160),
  donante_documento text,
  donante_contacto  text,
  anonima           boolean not null default false,
  monto             numeric(12, 2) not null check (monto > 0),
  metodo            public.metodo_pago not null check (metodo in ('efectivo', 'tarjeta', 'transferencia', 'cheque', 'otro')),
  referencia        text,
  destino           text,
  fecha             date not null default current_date check (fecha <= current_date),
  notas             text,
  turno_id          uuid,
  creado_por        uuid not null default auth.uid() references public.perfiles(id),
  creado_en         timestamptz not null default now(),
  unique (sistema_id, id),
  unique (sistema_id, numero),
  foreign key (sistema_id, turno_id) references public.turnos_caja (sistema_id, id)
);
create index ix_donaciones_fecha on public.donaciones (sistema_id, fecha desc);
create index ix_fk_donaciones_turno on public.donaciones (sistema_id, turno_id);
create index ix_fk_donaciones_creado_por on public.donaciones (creado_por);

create table public.anulaciones_donacion (
  id           uuid primary key default gen_random_uuid(),
  sistema_id   uuid not null references public.sistemas(id) on delete restrict,
  donacion_id  uuid not null unique,
  motivo       text not null check (length(trim(motivo)) >= 3),
  anulado_por  uuid not null default auth.uid() references public.perfiles(id),
  creado_en    timestamptz not null default now(),
  foreign key (sistema_id, donacion_id) references public.donaciones (sistema_id, id)
);
create index ix_fk_anul_donacion_sistema on public.anulaciones_donacion (sistema_id, donacion_id);
create index ix_fk_anul_donacion_por on public.anulaciones_donacion (anulado_por);

create trigger trg_donaciones_append_only before update or delete on public.donaciones
  for each row execute function privado.tg_bloquear_append_only();
create trigger trg_anulaciones_donacion_append_only before update or delete on public.anulaciones_donacion
  for each row execute function privado.tg_bloquear_append_only();
create trigger trg_donaciones_auditoria after insert on public.donaciones
  for each row execute function privado.tg_auditar();
create trigger trg_anulaciones_donacion_auditoria after insert on public.anulaciones_donacion
  for each row execute function privado.tg_auditar();

alter table public.donaciones enable row level security;
alter table public.anulaciones_donacion enable row level security;
create policy donaciones_select on public.donaciones for select to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{admin,caja,gerencia,contabilidad,auditor}', 'caja')));
create policy anulaciones_donacion_select on public.anulaciones_donacion for select to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{admin,caja,gerencia,contabilidad,auditor}', 'caja')));
revoke all on public.donaciones, public.anulaciones_donacion from anon;
revoke insert, update, delete, truncate on public.donaciones, public.anulaciones_donacion from authenticated;
grant select on public.donaciones, public.anulaciones_donacion to authenticated;

-- ---------------------------------------------------------------------------
create or replace function public.registrar_donacion(
  p_sistema uuid, p_donante text, p_monto numeric, p_metodo public.metodo_pago,
  p_documento text default null, p_contacto text default null, p_anonima boolean default false,
  p_referencia text default null, p_destino text default null, p_fecha date default current_date, p_notas text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
  v_numero text;
  v_fecha date := coalesce(p_fecha, current_date);
  v_monto numeric := round(coalesce(p_monto, 0), 2);
  v_turno uuid := privado.turno_abierto(p_sistema);
  v_doc text := nullif(regexp_replace(coalesce(p_documento, ''), '\D', '', 'g'), '');
begin
  if not privado.tiene_rol(p_sistema, '{admin,caja,gerencia}', 'caja') then
    raise exception 'No tienes permiso para registrar donaciones.' using errcode = '42501';
  end if;
  if v_monto <= 0 then
    raise exception 'El monto debe ser mayor que cero.' using errcode = 'P0001';
  end if;
  if v_fecha > current_date then
    raise exception 'La fecha no puede ser futura.' using errcode = 'P0001';
  end if;
  if v_doc is not null and length(v_doc) not in (9, 11) then
    raise exception 'La cédula (11 dígitos) o el RNC (9 dígitos) del donante no es válido.' using errcode = 'P0001';
  end if;
  if v_turno is null and p_metodo = 'efectivo' then
    v_turno := privado.turno_o_abrir(p_sistema);
  end if;

  v_numero := 'DON-' || lpad(privado.siguiente_numero(p_sistema, 'donacion')::text, 6, '0');
  insert into public.donaciones (id, sistema_id, numero, donante_nombre, donante_documento, donante_contacto, anonima,
                                 monto, metodo, referencia, destino, fecha, notas, turno_id)
  values (v_id, p_sistema, v_numero, trim(p_donante), v_doc, nullif(trim(p_contacto), ''), coalesce(p_anonima, false),
          v_monto, p_metodo, nullif(trim(p_referencia), ''), nullif(trim(p_destino), ''), v_fecha, nullif(trim(p_notas), ''), v_turno);

  insert into public.movimientos_financieros (sistema_id, turno_id, tipo, categoria, concepto, monto, metodo, creado_por)
  values (p_sistema, v_turno, 'ingreso', 'donacion', 'Donación ' || v_numero, v_monto, p_metodo, auth.uid());

  perform privado.crear_asiento(p_sistema, v_fecha, 'Donación ' || v_numero, 'donacion', v_id, jsonb_build_array(
    jsonb_build_object('cuenta', privado.cuenta_metodo(p_sistema, p_metodo::text), 'debe', v_monto, 'descripcion', 'Donación recibida'),
    jsonb_build_object('cuenta', privado.cuenta(p_sistema, 'ingreso_donaciones'), 'haber', v_monto, 'descripcion', 'Donaciones recibidas')
  ));
  return jsonb_build_object('id', v_id, 'numero', v_numero, 'monto', v_monto);
end;
$$;

create or replace function public.anular_donacion(p_donacion uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.donaciones;
begin
  select * into d from public.donaciones where id = p_donacion;
  if d.id is null or not privado.tiene_rol(d.sistema_id, '{admin,gerencia}', 'caja') then
    raise exception 'Donación no encontrada o sin permiso.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Indica el motivo de la anulación.' using errcode = 'P0001';
  end if;
  insert into public.anulaciones_donacion (sistema_id, donacion_id, motivo) values (d.sistema_id, d.id, trim(p_motivo));
  insert into public.movimientos_financieros (sistema_id, turno_id, tipo, categoria, concepto, monto, metodo, creado_por)
  values (d.sistema_id, privado.turno_abierto(d.sistema_id), 'egreso', 'anulacion', 'Anulación ' || d.numero, d.monto, d.metodo, auth.uid());
  perform privado.revertir_asientos('donacion', d.id, 'Anulación ' || d.numero);
exception when unique_violation then
  raise exception 'Esa donación ya fue anulada.' using errcode = 'P0001';
end;
$$;

revoke all on function public.registrar_donacion(uuid, text, numeric, public.metodo_pago, text, text, boolean, text, text, date, text) from public, anon;
revoke all on function public.anular_donacion(uuid, text) from public, anon;
grant execute on function public.registrar_donacion(uuid, text, numeric, public.metodo_pago, text, text, boolean, text, text, date, text) to authenticated;
grant execute on function public.anular_donacion(uuid, text) to authenticated;
