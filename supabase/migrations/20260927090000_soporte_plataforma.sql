-- ============================================================================
-- MEDORA · 0015 · Herramientas de soporte de la plataforma (superadmin)
--
-- - plataforma: fila única con el modo mantenimiento. Mientras está activo, los
--   helpers de RLS no devuelven sistemas a nadie salvo a la superadministración:
--   el corte es inmediato y lo aplica Postgres, no la UI.
-- - estado_plataforma(): lo puede leer cualquiera (la pantalla de login lo muestra).
-- - diagnostico_plataforma(): hora del servidor, tamaño de la base y del
--   almacenamiento, conteos y sesiones activas.
-- - plataforma_cerrar_sesiones(): revoca las sesiones de todo el personal (menos
--   la de quien la ejecuta). Los tokens ya emitidos caducan solos en ≤ 1 h; para
--   un corte inmediato, combinar con el modo mantenimiento.
-- - plataforma_eliminar_sistema(): borra un sistema hospitalario y TODOS sus datos.
--   Es la única excepción a append-only: corre con session_replication_role =
--   replica (sin triggers ni FKs) dentro de la transacción, borra tabla por tabla
--   todo lo que tenga ese sistema_id y verifica al final que no quedó nada.
-- ============================================================================

create table public.plataforma (
  id                    boolean primary key default true check (id),
  mantenimiento         boolean not null default false,
  mantenimiento_mensaje text,
  mantenimiento_desde   timestamptz,
  actualizado_por       uuid references public.perfiles(id) on delete set null,
  actualizado_en        timestamptz not null default now()
);
insert into public.plataforma default values;
create index ix_fk_plataforma_actualizado_por on public.plataforma (actualizado_por);

alter table public.plataforma enable row level security;
create policy plataforma_select on public.plataforma for select to authenticated
  using ((select privado.es_superadmin()));
revoke all on public.plataforma from anon;
revoke insert, update, delete, truncate on public.plataforma from authenticated;

create trigger trg_plataforma_auditoria after update on public.plataforma
  for each row execute function privado.tg_auditar();

create or replace function privado.en_mantenimiento()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.mantenimiento from public.plataforma p), false);
$$;

-- Helpers de RLS: en mantenimiento solo la superadministración conserva acceso --
create or replace function privado.mis_sistemas()
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
    and (p.es_superadmin or not privado.en_mantenimiento());
$$;

create or replace function privado.mis_sistemas_con_rol(p_roles public.rol_sistema[])
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
  where m.usuario_id = (select auth.uid()) and m.activo and s.activo and p.activo and m.roles && p_roles
    and (p.es_superadmin or not privado.en_mantenimiento());
$$;

-- Estado público (login y app) ----------------------------------------------
create or replace function public.estado_plataforma()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'mantenimiento', p.mantenimiento,
    'mensaje', p.mantenimiento_mensaje,
    'desde', p.mantenimiento_desde
  )
  from public.plataforma p;
$$;

create or replace function public.plataforma_mantenimiento(p_activo boolean, p_mensaje text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not privado.es_superadmin() then
    raise exception 'Solo la superadministración.' using errcode = '42501';
  end if;
  update public.plataforma
     set mantenimiento = p_activo,
         mantenimiento_mensaje = case when p_activo then nullif(trim(p_mensaje), '') end,
         mantenimiento_desde = case when p_activo then now() end,
         actualizado_por = auth.uid(),
         actualizado_en = now();
end;
$$;

-- Diagnóstico -----------------------------------------------------------------
create or replace function public.diagnostico_plataforma()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not privado.es_superadmin() then
    raise exception 'Solo la superadministración.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'hora_servidor', now(),
    'postgres', current_setting('server_version'),
    'base_bytes', pg_database_size(current_database()),
    'archivos_bytes', (select coalesce(sum((o.metadata ->> 'size')::bigint), 0) from storage.objects o),
    'archivos', (select count(*) from storage.objects),
    'sistemas', (select count(*) from public.sistemas),
    'sistemas_activos', (select count(*) from public.sistemas where activo),
    'usuarios', (select count(*) from public.perfiles),
    'usuarios_activos', (select count(*) from public.perfiles where activo),
    'sesiones', (select count(*) from auth.sessions where not_after is null or not_after > now()),
    'auditoria_24h', (select count(*) from public.auditoria where creado_en > now() - interval '24 hours')
  );
end;
$$;

-- Cerrar las sesiones de todo el personal --------------------------------------
create or replace function public.plataforma_cerrar_sesiones()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v integer;
begin
  if not privado.es_superadmin() then
    raise exception 'Solo la superadministración.' using errcode = '42501';
  end if;
  delete from auth.sessions where user_id is distinct from auth.uid();
  get diagnostics v = row_count;
  insert into public.auditoria (usuario_id, accion, tabla, cambios)
  values (auth.uid(), 'CERRAR_SESIONES', 'auth.sessions', jsonb_build_object('sesiones', v));
  return v;
end;
$$;

-- Eliminar un sistema hospitalario completo ------------------------------------
create or replace function public.plataforma_eliminar_sistema(p_sistema uuid, p_confirmacion text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre  text;
  v_tabla   text;
  v_n       bigint;
  v_conteos jsonb := '{}';
begin
  if not privado.es_superadmin() then
    raise exception 'Solo la superadministración puede eliminar sistemas.' using errcode = '42501';
  end if;

  select nombre into v_nombre from public.sistemas where id = p_sistema for update;
  if v_nombre is null then
    raise exception 'El sistema no existe.' using errcode = 'P0002';
  end if;
  if coalesce(trim(p_confirmacion), '') <> v_nombre then
    raise exception 'Para confirmar, escribe exactamente el nombre del sistema.' using errcode = 'P0001';
  end if;

  -- Sin triggers (append-only, auditoría, FKs) solo durante esta transacción.
  perform set_config('session_replication_role', 'replica', true);

  for v_tabla in
    select c.table_name
      from information_schema.columns c
      join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'public' and c.column_name = 'sistema_id' and t.table_type = 'BASE TABLE'
  loop
    execute format('delete from public.%I where sistema_id = $1', v_tabla) using p_sistema;
    get diagnostics v_n = row_count;
    if v_n > 0 then
      v_conteos := v_conteos || jsonb_build_object(v_tabla, v_n);
    end if;
  end loop;

  update public.perfiles set ultimo_sistema_id = null where ultimo_sistema_id = p_sistema;
  delete from public.sistemas where id = p_sistema;

  perform set_config('session_replication_role', 'origin', true);

  -- Con las FKs apagadas, comprobar a mano que no quedó ninguna referencia.
  for v_tabla in
    select c.table_name
      from information_schema.columns c
      join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'public' and c.column_name = 'sistema_id' and t.table_type = 'BASE TABLE'
  loop
    execute format('select count(*) from public.%I where sistema_id = $1', v_tabla) into v_n using p_sistema;
    if v_n > 0 then
      raise exception 'Quedaron % registros en %; se revirtió la eliminación.', v_n, v_tabla;
    end if;
  end loop;

  insert into public.auditoria (usuario_id, accion, tabla, registro_id, cambios)
  values (auth.uid(), 'ELIMINAR_SISTEMA', 'sistemas', p_sistema::text,
          jsonb_build_object('nombre', v_nombre, 'registros', v_conteos));

  return jsonb_build_object('nombre', v_nombre, 'registros', v_conteos);
end;
$$;

revoke all on function privado.en_mantenimiento() from public, anon;
grant execute on function privado.en_mantenimiento() to authenticated, service_role;
revoke all on function public.estado_plataforma() from public;
revoke all on function public.plataforma_mantenimiento(boolean, text) from public, anon;
revoke all on function public.diagnostico_plataforma() from public, anon;
revoke all on function public.plataforma_cerrar_sesiones() from public, anon;
revoke all on function public.plataforma_eliminar_sistema(uuid, text) from public, anon;
grant execute on function public.estado_plataforma() to anon, authenticated;
grant execute on function public.plataforma_mantenimiento(boolean, text) to authenticated;
grant execute on function public.diagnostico_plataforma() to authenticated;
grant execute on function public.plataforma_cerrar_sesiones() to authenticated;
grant execute on function public.plataforma_eliminar_sistema(uuid, text) to authenticated;
