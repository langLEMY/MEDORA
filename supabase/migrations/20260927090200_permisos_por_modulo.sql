-- ============================================================================
-- MEDORA · Permisos por módulo
-- (Aplicada en remoto el 2026-09-25 como 20260925191938; recuperada de
--  supabase_migrations.schema_migrations para que el repo siga siendo la fuente.)
-- membresias.permisos = { "<modulo>": true|false } sobrescribe lo que dan los roles.
-- ============================================================================
create or replace function privado.modulos_ajustables()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['pacientes', 'historial', 'agenda', 'caja', 'inventario', 'compras',
               'comisiones', 'nomina', 'contabilidad', 'catalogos', 'auditoria'];
$$;

alter table public.membresias add column permisos jsonb not null default '{}'::jsonb;

create or replace function privado.permisos_validos(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p) = 'object'
     and not exists (
       select 1 from jsonb_each(p) e
        where e.key <> all (privado.modulos_ajustables()) or jsonb_typeof(e.value) <> 'boolean'
     );
$$;

alter table public.membresias add constraint ck_membresias_permisos check (privado.permisos_validos(permisos));

create or replace function privado.mis_sistemas_con_rol(p_roles public.rol_sistema[], p_modulo text)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.sistema_id
  from public.membresias m
  join public.sistemas s on s.id = m.sistema_id
  join public.perfiles p on p.id = m.usuario_id
  where m.usuario_id = (select auth.uid()) and m.activo and s.activo and p.activo
    and (p.es_superadmin or not privado.en_mantenimiento())
    and case m.permisos ->> p_modulo
          when 'true' then true
          when 'false' then false
          else m.roles && p_roles
        end;
$$;

create or replace function privado.tiene_rol(p_sistema uuid, p_roles public.rol_sistema[], p_modulo text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from privado.mis_sistemas_con_rol(p_roles, p_modulo) x where x = p_sistema
  );
$$;

revoke all on function privado.modulos_ajustables() from public, anon;
revoke all on function privado.permisos_validos(jsonb) from public, anon;
revoke all on function privado.mis_sistemas_con_rol(public.rol_sistema[], text) from public, anon;
revoke all on function privado.tiene_rol(uuid, public.rol_sistema[], text) from public, anon;
grant execute on function privado.modulos_ajustables() to authenticated, service_role;
grant execute on function privado.permisos_validos(jsonb) to authenticated, service_role;
grant execute on function privado.mis_sistemas_con_rol(public.rol_sistema[], text) to authenticated, service_role;
grant execute on function privado.tiene_rol(uuid, public.rol_sistema[], text) to authenticated, service_role;

-- Políticas: mis_sistemas_con_rol('{...}') → mis_sistemas_con_rol('{...}', '<modulo>').
do $$
declare
  v_mapa constant jsonb := '{
    "pacientes": "pacientes",
    "citas": "agenda",
    "historial_clinico": "historial",
    "aseguradoras": "catalogos", "servicios": "catalogos", "coberturas": "catalogos",
    "turnos_caja": "caja", "cobros": "caja", "cobro_detalles": "caja", "cobro_pagos": "caja",
    "anulaciones_cobro": "caja", "movimientos_financieros": "caja", "anticipos": "caja",
    "abonos": "caja", "secuencias_ncf": "caja",
    "inventario_items": "inventario", "movimientos_inventario": "inventario",
    "proveedores": "compras", "compras": "compras", "compra_items": "compras", "anulaciones_compra": "compras",
    "reglas_comision": "comisiones", "comisiones": "comisiones",
    "liquidaciones_comision": "comisiones", "liquidacion_items": "comisiones",
    "empleados": "nomina", "parametros_nomina": "nomina", "nominas": "nomina", "nomina_lineas": "nomina",
    "cuentas_contables": "contabilidad", "cuentas_predeterminadas": "contabilidad",
    "asientos": "contabilidad", "asiento_lineas": "contabilidad",
    "auditoria": "auditoria"
  }';
  v_patron constant text := 'privado\.mis_sistemas_con_rol\(''(\{[^}]*\})''::rol_sistema\[\]\)';
  r record;
  v_mod text;
  v_flags text;
  v_using text;
  v_check text;
  v_sql text;
begin
  for r in
    select * from pg_policies
     where schemaname = 'public' and tablename in (select jsonb_object_keys(v_mapa))
  loop
    v_mod := v_mapa ->> r.tablename;
    v_flags := case when r.policyname = 'historial_select' then '' else 'g' end;
    v_using := regexp_replace(r.qual, v_patron,
                 format('privado.mis_sistemas_con_rol(''\1''::rol_sistema[], %L)', v_mod), v_flags);
    v_check := regexp_replace(r.with_check, v_patron,
                 format('privado.mis_sistemas_con_rol(''\1''::rol_sistema[], %L)', v_mod), v_flags);
    if v_using is not distinct from r.qual and v_check is not distinct from r.with_check then
      continue;
    end if;
    v_sql := format('alter policy %I on public.%I', r.policyname, r.tablename);
    if v_using is not null then v_sql := v_sql || format(' using (%s)', v_using); end if;
    if v_check is not null then v_sql := v_sql || format(' with check (%s)', v_check); end if;
    execute v_sql;
  end loop;
end;
$$;

-- RPC: tiene_rol(sistema, '{...}') → tiene_rol(sistema, '{...}', '<modulo>').
do $$
declare
  v_mapa constant jsonb := '{
    "abrir_turno_caja": "caja", "anular_cobro": "caja", "registrar_cobro": "caja",
    "registrar_anticipo": "caja", "registrar_abono": "caja", "registrar_movimiento": "caja",
    "registrar_compra": "compras", "anular_compra": "compras", "importar_proveedores": "compras",
    "generar_nomina": "nomina", "recalcular_nomina": "nomina", "aprobar_nomina": "nomina",
    "eliminar_nomina_borrador": "nomina", "actualizar_linea_nomina": "nomina",
    "vista_previa_asiento_nomina": "nomina", "importar_empleados": "nomina",
    "liquidar_comisiones": "comisiones",
    "registrar_asiento_manual": "contabilidad",
    "importar_inventario": "inventario", "importar_movimientos_inventario": "inventario",
    "importar_servicios": "catalogos", "importar_coberturas": "catalogos",
    "importar_pacientes": "pacientes"
  }';
  r record;
  v_def text;
  v_nueva text;
begin
  for r in
    select p.oid, p.proname from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.proname in (select jsonb_object_keys(v_mapa))
  loop
    v_def := pg_get_functiondef(r.oid);
    v_nueva := regexp_replace(v_def, 'privado\.tiene_rol\(([^,()]+), (''\{[^}]*\}'')\)',
                 format('privado.tiene_rol(\1, \2, %L)', v_mapa ->> r.proname), 'g');
    if v_nueva = v_def then
      raise exception 'La función % no tiene una validación de rol reconocible.', r.proname;
    end if;
    execute v_nueva;
  end loop;
end;
$$;

drop function public.mis_sistemas_detalle();
create function public.mis_sistemas_detalle()
returns table (id uuid, nombre text, slug text, color_marca text, logo_url text, moneda text,
               zona_horaria text, activo boolean, roles public.rol_sistema[], permisos jsonb)
language sql
stable
set search_path = ''
as $$
  select s.id, s.nombre, s.slug, s.color_marca, s.logo_url, s.moneda, s.zona_horaria, s.activo,
         coalesce(m.roles, '{}'::public.rol_sistema[]),
         coalesce(m.permisos, '{}'::jsonb)
    from public.sistemas s
    left join public.membresias m
      on m.sistema_id = s.id and m.usuario_id = (select auth.uid()) and m.activo
   where (m.id is not null and s.activo) or (select privado.es_superadmin())
   order by s.nombre;
$$;
revoke all on function public.mis_sistemas_detalle() from public, anon;
grant execute on function public.mis_sistemas_detalle() to authenticated;
