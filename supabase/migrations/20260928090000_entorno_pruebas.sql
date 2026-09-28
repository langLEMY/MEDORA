-- ============================================================================
-- MEDORA · Entorno de pruebas y limpieza de operaciones (superadmin)
--
-- 1) sistemas.es_pruebas: un sistema de pruebas es una copia de la
--    configuración de otro (servicios, aseguradoras, tarifas, sedes, reglas por
--    especialidad y parámetros de nómina) sin pacientes, personal ni dinero. La
--    app lo marca con una franja "PRUEBAS". Reiniciarlo = eliminarlo y volver a
--    crearlo desde su origen (plataforma_eliminar_sistema + esta función).
--
-- 2) plataforma_limpiar_operaciones(): borra movimientos de prueba de un
--    sistema real sin tocar catálogos, pacientes, personal ni nómina.
--    Alcances: 'caja' (cobros, pagos, anulaciones, anticipos, abonos,
--    movimientos de caja, turnos de caja, comisiones y sus asientos),
--    'citas' (citas y turnos de pacientes), 'historial' (historial clínico).
--    Sin p_confirmacion solo devuelve la vista previa (conteos); con el nombre
--    exacto del sistema, ejecuta. Usa el mismo permiso acotado que la
--    eliminación de sistemas (GUC medora.eliminando_sistema) para poder borrar
--    en tablas append-only, y deja un único evento en la bitácora.
-- ============================================================================

alter table public.sistemas
  add column es_pruebas boolean not null default false,
  add column pruebas_de uuid references public.sistemas(id) on delete set null;
create index ix_fk_sistemas_pruebas_de on public.sistemas (pruebas_de);

-- ---------------------------------------------------------------------------
create or replace function public.plataforma_limpiar_operaciones(
  p_sistema uuid,
  p_alcance text[],
  p_confirmacion text default null
)
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
            or (a.origen = 'comision' and a.origen_id in (select id from _liquidaciones)));
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

-- ---------------------------------------------------------------------------
-- Crea un sistema de pruebas copiando la configuración de p_origen.
create or replace function public.plataforma_crear_sistema_pruebas(p_origen uuid, p_miembros uuid[] default '{}')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o      public.sistemas;
  v_nuevo  uuid := gen_random_uuid();
  v_slug   text;
  -- Todos los roles de trabajo (no 'quiosco', que convierte la cuenta en pantalla táctil).
  v_todos  public.rol_sistema[] := array(select r from unnest(enum_range(null::public.rol_sistema)) r where r::text <> 'quiosco');
begin
  if not privado.es_superadmin() then
    raise exception 'Solo la superadministración.' using errcode = '42501';
  end if;
  select * into v_o from public.sistemas where id = p_origen;
  if v_o.id is null then
    raise exception 'El sistema de origen no existe.' using errcode = 'P0002';
  end if;
  if v_o.es_pruebas then
    raise exception 'Elige un sistema real como origen.' using errcode = 'P0001';
  end if;

  v_slug := left(v_o.slug, 50) || '-pruebas';
  while exists (select 1 from public.sistemas where slug = v_slug) loop
    v_slug := left(v_o.slug, 50) || '-pruebas-' || substr(md5(random()::text), 1, 4);
  end loop;

  -- Misma configuración (todas las columnas), otro id/nombre/slug.
  insert into public.sistemas
  select (jsonb_populate_record(null::public.sistemas, to_jsonb(v_o) || jsonb_build_object(
            'id', v_nuevo, 'nombre', left(v_o.nombre || ' · Pruebas', 120), 'slug', v_slug,
            'es_pruebas', true, 'pruebas_de', v_o.id, 'activo', true, 'creado_en', now()))).*;

  drop table if exists _mapa;

  create temp table _mapa (viejo uuid primary key, nuevo uuid not null) on commit drop;
  insert into _mapa select id, gen_random_uuid() from public.sedes where sistema_id = p_origen;
  insert into _mapa select id, gen_random_uuid() from public.servicios where sistema_id = p_origen;
  insert into _mapa select id, gen_random_uuid() from public.aseguradoras where sistema_id = p_origen;

  insert into public.sedes
  select (jsonb_populate_record(null::public.sedes, to_jsonb(t) || jsonb_build_object(
            'id', (select nuevo from _mapa where viejo = t.id), 'sistema_id', v_nuevo))).*
    from public.sedes t where t.sistema_id = p_origen;

  insert into public.servicios
  select (jsonb_populate_record(null::public.servicios, to_jsonb(t) || jsonb_build_object(
            'id', (select nuevo from _mapa where viejo = t.id), 'sistema_id', v_nuevo))).*
    from public.servicios t where t.sistema_id = p_origen;

  insert into public.aseguradoras
  select (jsonb_populate_record(null::public.aseguradoras, to_jsonb(t) || jsonb_build_object(
            'id', (select nuevo from _mapa where viejo = t.id), 'sistema_id', v_nuevo))).*
    from public.aseguradoras t where t.sistema_id = p_origen;

  insert into public.coberturas
  select (jsonb_populate_record(null::public.coberturas, to_jsonb(t) || jsonb_build_object(
            'id', gen_random_uuid(), 'sistema_id', v_nuevo,
            'aseguradora_id', (select nuevo from _mapa where viejo = t.aseguradora_id),
            'servicio_id', (select nuevo from _mapa where viejo = t.servicio_id)))).*
    from public.coberturas t where t.sistema_id = p_origen;

  -- Reglas de comisión por especialidad/servicio (las de una persona concreta no aplican aquí).
  insert into public.reglas_comision
  select (jsonb_populate_record(null::public.reglas_comision, to_jsonb(t) || jsonb_build_object(
            'id', gen_random_uuid(), 'sistema_id', v_nuevo,
            'servicio_id', (select nuevo from _mapa where viejo = t.servicio_id)))).*
    from public.reglas_comision t where t.sistema_id = p_origen and t.beneficiario_id is null;

  -- Parámetros de nómina: el trigger de alta ya creó la fila; se copian los valores.
  delete from public.parametros_nomina where sistema_id = v_nuevo;
  insert into public.parametros_nomina
  select (jsonb_populate_record(null::public.parametros_nomina, to_jsonb(t) || jsonb_build_object('sistema_id', v_nuevo))).*
    from public.parametros_nomina t where t.sistema_id = p_origen;

  -- Quien lo crea y los miembros indicados entran con todos los roles.
  insert into public.membresias (sistema_id, usuario_id, roles, creado_por)
  select v_nuevo, u, v_todos, auth.uid()
    from (select auth.uid() u union select unnest(coalesce(p_miembros, '{}'))) x
   where u is not null
  on conflict (sistema_id, usuario_id) do nothing;

  insert into public.auditoria (sistema_id, usuario_id, accion, tabla, registro_id, cambios)
  values (v_nuevo, auth.uid(), 'CREAR_SISTEMA_PRUEBAS', 'sistemas', v_nuevo::text,
          jsonb_build_object('origen', v_o.nombre));
  return v_nuevo;
end;
$$;

revoke all on function public.plataforma_limpiar_operaciones(uuid, text[], text) from public, anon;
revoke all on function public.plataforma_crear_sistema_pruebas(uuid, uuid[]) from public, anon;
grant execute on function public.plataforma_limpiar_operaciones(uuid, text[], text) to authenticated;
grant execute on function public.plataforma_crear_sistema_pruebas(uuid, uuid[]) to authenticated;
