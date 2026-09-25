-- ============================================================================
-- MEDORA · 0004 · Bitácora de auditoría, RPC de lectura y endurecimiento
-- ============================================================================

-- FKs simples hacia perfiles (además de las compuestas hacia membresias) para
-- que PostgREST pueda embeber el nombre de la persona: citas?select=*,medico:perfiles!...(nombre_completo)
alter table public.citas                  add constraint citas_medico_perfil_fk foreign key (medico_id) references public.perfiles(id);
alter table public.historial_clinico      add constraint historial_autor_perfil_fk foreign key (autor_id) references public.perfiles(id);
alter table public.turnos_caja            add constraint turnos_cajero_perfil_fk foreign key (cajero_id) references public.perfiles(id);
alter table public.cobros                 add constraint cobros_cajero_perfil_fk foreign key (cajero_id) references public.perfiles(id);
alter table public.movimientos_financieros add constraint movimientos_autor_perfil_fk foreign key (creado_por) references public.perfiles(id);
alter table public.movimientos_inventario add constraint mov_inventario_autor_perfil_fk foreign key (creado_por) references public.perfiles(id);
alter table public.anulaciones_cobro      add constraint anulaciones_autor_perfil_fk foreign key (anulado_por) references public.perfiles(id);

-- ---------------------------------------------------------------------------
-- Auditoría (append-only). Se llena sola con triggers en cada tabla de negocio
-- (no depende de que el cliente "se acuerde" de registrar nada) y con
-- registrar_evento() para eventos de sesión.
-- ---------------------------------------------------------------------------
create table public.auditoria (
  id           bigint generated always as identity primary key,
  sistema_id   uuid references public.sistemas(id) on delete restrict,
  usuario_id   uuid,
  accion       text not null,
  tabla        text,
  registro_id  text,
  cambios      jsonb,
  creado_en    timestamptz not null default now()
);
create index ix_auditoria_sistema_fecha on public.auditoria (sistema_id, creado_en desc);
create index ix_auditoria_usuario_fecha on public.auditoria (usuario_id, creado_en desc);
create index ix_auditoria_registro on public.auditoria (tabla, registro_id);

create trigger trg_auditoria_append_only before update or delete on public.auditoria
  for each row execute function privado.tg_bloquear_append_only();

create or replace function privado.tg_auditar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nuevo   jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_viejo   jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_fila    jsonb := coalesce(v_nuevo, v_viejo);
  v_cambios jsonb;
  v_sistema uuid;
begin
  v_sistema := case when tg_table_name = 'sistemas' then (v_fila ->> 'id')::uuid
                    else (v_fila ->> 'sistema_id')::uuid end;

  if tg_nargs > 0 and tg_argv[0] = 'sin_datos' then
    -- Contenido clínico: la bitácora registra quién/cuándo/qué registro, no el texto.
    v_cambios := null;
  elsif tg_op = 'UPDATE' then
    select jsonb_object_agg(n.key, jsonb_build_object('antes', v_viejo -> n.key, 'despues', n.value))
      into v_cambios
      from jsonb_each(v_nuevo) n
     where n.value is distinct from v_viejo -> n.key
       and n.key not in ('actualizado_en', 'actualizado_por', 'busqueda', 'stock_actual');
    if v_cambios is null then
      return null;
    end if;
  elsif tg_op = 'INSERT' then
    v_cambios := v_nuevo - 'busqueda';
  else
    v_cambios := v_viejo;
  end if;

  insert into public.auditoria (sistema_id, usuario_id, accion, tabla, registro_id, cambios)
  values (v_sistema, auth.uid(), tg_op, tg_table_name, v_fila ->> 'id', v_cambios);
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'sistemas', 'sedes', 'perfiles', 'membresias', 'aseguradoras', 'servicios', 'coberturas',
    'pacientes', 'citas', 'turnos_caja', 'cobros', 'anulaciones_cobro',
    'movimientos_financieros', 'inventario_items', 'movimientos_inventario'
  ] loop
    execute format(
      'create trigger trg_%1$s_auditoria after insert or update or delete on public.%1$I
         for each row execute function privado.tg_auditar()', t);
  end loop;
end $$;

create trigger trg_historial_clinico_auditoria after insert on public.historial_clinico
  for each row execute function privado.tg_auditar('sin_datos');

alter table public.auditoria enable row level security;
create policy auditoria_select on public.auditoria for select to authenticated
  using (
    sistema_id in (select privado.mis_sistemas_con_rol('{admin,auditor}'))
    or (select privado.es_superadmin())
  );
revoke all on public.auditoria from anon;
revoke insert, update, delete, truncate on public.auditoria from authenticated;

create or replace function public.registrar_evento(p_accion text, p_sistema uuid default null, p_detalle jsonb default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  if p_accion not in ('LOGIN', 'LOGOUT', 'CAMBIO_SISTEMA', 'EXPORTAR', 'IMPRIMIR', 'CAMBIO_PASSWORD') then
    raise exception 'Evento no permitido.' using errcode = 'P0001';
  end if;
  if p_sistema is not null
     and not exists (select 1 from privado.mis_sistemas() s where s = p_sistema)
     and not privado.es_superadmin() then
    p_sistema := null;
  end if;

  insert into public.auditoria (sistema_id, usuario_id, accion, tabla, registro_id, cambios)
  values (p_sistema, auth.uid(), p_accion, null, null, p_detalle);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC de lectura
-- ---------------------------------------------------------------------------

-- Sistemas accesibles por el usuario, con sus roles en cada uno.
create or replace function public.mis_sistemas_detalle()
returns table (
  id uuid, nombre text, slug text, color_marca text, logo_url text, moneda text,
  zona_horaria text, activo boolean, roles public.rol_sistema[]
)
language sql
stable
security invoker
set search_path = ''
as $$
  select s.id, s.nombre, s.slug, s.color_marca, s.logo_url, s.moneda, s.zona_horaria, s.activo,
         coalesce(m.roles, '{}'::public.rol_sistema[])
    from public.sistemas s
    left join public.membresias m
      on m.sistema_id = s.id and m.usuario_id = (select auth.uid()) and m.activo
   where (m.id is not null and s.activo) or (select privado.es_superadmin())
   order by s.nombre;
$$;

-- Resumen del dashboard. security invoker: cada cifra respeta el RLS del
-- usuario (un médico recibe 0 en ingresos porque no puede leer finanzas).
create or replace function public.resumen_dashboard(p_sistema uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_tz         text;
  v_hoy        date;
  v_hoy_ini    timestamptz;
  v_hoy_fin    timestamptz;
  v_mes_ini    timestamptz;
  v_serie_ini  timestamptz;
  v_resultado  jsonb;
begin
  select zona_horaria into v_tz from public.sistemas where id = p_sistema;
  if v_tz is null then
    return null;
  end if;

  v_hoy       := (now() at time zone v_tz)::date;
  v_hoy_ini   := v_hoy::timestamp at time zone v_tz;
  v_hoy_fin   := (v_hoy + 1)::timestamp at time zone v_tz;
  v_mes_ini   := date_trunc('month', v_hoy)::timestamp at time zone v_tz;
  v_serie_ini := (v_hoy - 13)::timestamp at time zone v_tz;

  select jsonb_build_object(
    'hoy', v_hoy,
    'pacientes_total', (select count(*) from public.pacientes where sistema_id = p_sistema and eliminado_en is null),
    'pacientes_mes', (select count(*) from public.pacientes where sistema_id = p_sistema and creado_en >= v_mes_ini),
    'citas_hoy', (select count(*) from public.citas where sistema_id = p_sistema
                   and inicio >= v_hoy_ini and inicio < v_hoy_fin and estado <> 'cancelada'),
    'citas_por_estado', (select coalesce(jsonb_object_agg(estado, n), '{}'::jsonb) from (
                          select estado, count(*) n from public.citas
                           where sistema_id = p_sistema and inicio >= v_hoy_ini and inicio < v_hoy_fin
                           group by estado) x),
    'ingresos_hoy', (select coalesce(sum(case when tipo = 'ingreso' then monto else -monto end), 0)
                       from public.movimientos_financieros
                      where sistema_id = p_sistema and creado_en >= v_hoy_ini and creado_en < v_hoy_fin),
    'ingresos_mes', (select coalesce(sum(case when tipo = 'ingreso' then monto else -monto end), 0)
                       from public.movimientos_financieros
                      where sistema_id = p_sistema and creado_en >= v_mes_ini),
    'stock_bajo', (select count(*) from public.inventario_items
                    where sistema_id = p_sistema and activo and stock_actual <= stock_minimo),
    'serie', (select coalesce(jsonb_agg(jsonb_build_object('fecha', d.dia::date, 'citas', coalesce(c.n, 0), 'ingresos', coalesce(i.total, 0)) order by d.dia), '[]'::jsonb)
                from generate_series(v_hoy - 13, v_hoy, interval '1 day') as d(dia)
                left join (
                  select (inicio at time zone v_tz)::date dia, count(*) n from public.citas
                   where sistema_id = p_sistema and inicio >= v_serie_ini and inicio < v_hoy_fin and estado <> 'cancelada'
                   group by 1) c on c.dia = d.dia::date
                left join (
                  select (creado_en at time zone v_tz)::date dia,
                         sum(case when tipo = 'ingreso' then monto else -monto end) total
                    from public.movimientos_financieros
                   where sistema_id = p_sistema and creado_en >= v_serie_ini
                   group by 1) i on i.dia = d.dia::date)
  ) into v_resultado;

  return v_resultado;
end;
$$;

-- Primer arranque: si no existe ningún superadmin, la app muestra el asistente
-- de configuración inicial (ver supabase/functions/configuracion-inicial).
create or replace function public.estado_instalacion()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'requiere_configuracion', not exists (select 1 from public.perfiles where es_superadmin)
  );
$$;

create or replace function public.marcar_password_actualizada()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.perfiles set debe_cambiar_password = false where id = auth.uid();
$$;

revoke all on function public.registrar_evento(text, uuid, jsonb) from public, anon;
revoke all on function public.mis_sistemas_detalle() from public, anon;
revoke all on function public.resumen_dashboard(uuid) from public, anon;
revoke all on function public.marcar_password_actualizada() from public, anon;
revoke all on function public.estado_instalacion() from public;
grant execute on function public.registrar_evento(text, uuid, jsonb) to authenticated;
grant execute on function public.mis_sistemas_detalle() to authenticated;
grant execute on function public.resumen_dashboard(uuid) to authenticated;
grant execute on function public.marcar_password_actualizada() to authenticated;
grant execute on function public.estado_instalacion() to anon, authenticated;

-- Funciones de trigger: nunca invocables vía API.
revoke all on function privado.tg_auditar() from public, anon, authenticated;
revoke all on function privado.tg_crear_perfil() from public, anon, authenticated;
revoke all on function privado.tg_sincronizar_email() from public, anon, authenticated;
revoke all on function privado.tg_asignar_expediente() from public, anon, authenticated;
revoke all on function privado.tg_aplicar_movimiento_inventario() from public, anon, authenticated;
revoke all on function privado.siguiente_numero(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Endurecimiento para migraciones futuras: por defecto Supabase concede todo a
-- anon/authenticated sobre objetos nuevos de public. En MEDORA cada tabla o
-- función nueva debe conceder explícitamente lo que necesita.
-- ---------------------------------------------------------------------------
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon;
