-- Planes de MEDORA, suscripción de cada hospital y bienvenida del primer acceso.
--
-- 1) public.planes: catálogo global que solo edita el superadmin (precio por sede al mes, en RD$).
-- 2) public.suscripciones: una por sistema. La elige el primer administrador que entra por primera vez
--    (elegir_plan): 30 días de prueba gratis y después se cobra precio_sede × sedes activas.
--    Los sistemas que ya existían quedan en 'cortesia' (no eligen plan); los de pruebas nunca lo eligen.
-- 3) perfiles.bienvenida_en: null = la persona aún no hizo su primer acceso guiado (usuario, foto,
--    contraseña, dos pasos y, si toca, el plan). Las cuentas que ya existían quedan como completadas.

-- ── Planes ─────────────────────────────────────────────────────────────────────────────────────────
create table public.planes (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null check (length(trim(nombre)) between 2 and 40),
  descripcion      text check (length(descripcion) <= 160),
  precio_sede      numeric(12, 2) not null check (precio_sede >= 0),
  caracteristicas  text[] not null default '{}' check (cardinality(caracteristicas) <= 12),
  destacado        boolean not null default false,
  activo           boolean not null default true,
  orden            integer not null default 0,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now()
);
create unique index ux_planes_nombre on public.planes (lower(trim(nombre)));

alter table public.planes enable row level security;
-- Cualquier cuenta ve los planes activos (el administrador los compara al elegir); el superadmin, todos.
create policy planes_select on public.planes for select to authenticated
  using (activo or (select privado.es_superadmin()));
revoke all on public.planes from anon;
revoke insert, update, delete on public.planes from authenticated;
grant select on public.planes to authenticated;

-- ── Suscripciones ──────────────────────────────────────────────────────────────────────────────────
create table public.suscripciones (
  sistema_id      uuid primary key references public.sistemas (id) on delete cascade,
  plan_id         uuid references public.planes (id),
  estado          text not null check (estado in ('prueba', 'activa', 'vencida', 'suspendida', 'cortesia')),
  -- Precio por sede congelado al elegir: si el superadmin cambia el plan, no cambia lo ya pactado.
  precio_sede     numeric(12, 2) check (precio_sede >= 0),
  prueba_hasta    date,
  proximo_corte   date,
  elegido_por     uuid references public.perfiles (id) on delete set null,
  elegido_en      timestamptz,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  check (estado = 'cortesia' or plan_id is not null)
);
create index ix_suscripciones_plan on public.suscripciones (plan_id);
create index ix_suscripciones_elegido_por on public.suscripciones (elegido_por);

alter table public.suscripciones enable row level security;
-- La ve el administrador de ese hospital y el superadmin (es la cuenta de MEDORA con el hospital,
-- no un dato clínico ni financiero del hospital).
create policy suscripciones_select on public.suscripciones for select to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{admin}')) or (select privado.es_superadmin()));
revoke all on public.suscripciones from anon;
revoke insert, update, delete on public.suscripciones from authenticated;
grant select on public.suscripciones to authenticated;

create trigger trg_suscripciones_auditoria
  after insert or update or delete on public.suscripciones
  for each row execute function privado.tg_auditar();

-- Los hospitales que ya usan MEDORA no eligen plan al entrar.
insert into public.suscripciones (sistema_id, estado)
select id, 'cortesia' from public.sistemas
on conflict (sistema_id) do nothing;

-- ── Bienvenida ─────────────────────────────────────────────────────────────────────────────────────
alter table public.perfiles add column bienvenida_en timestamptz;
update public.perfiles set bienvenida_en = coalesce(creado_en, now()) where bienvenida_en is null;

-- ── RPC: catálogo (superadmin) ─────────────────────────────────────────────────────────────────────
create or replace function public.guardar_plan(
  p_id uuid, p_nombre text, p_descripcion text, p_precio_sede numeric, p_caracteristicas text[],
  p_destacado boolean default false, p_activo boolean default true, p_orden integer default 0)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_car text[];
begin
  if not privado.es_superadmin() then
    raise exception 'Solo la administración de MEDORA edita los planes.' using errcode = '42501';
  end if;
  select coalesce(array_agg(trim(c)) filter (where trim(c) <> ''), '{}') into v_car from unnest(coalesce(p_caracteristicas, '{}')) c;

  if p_id is null then
    insert into public.planes (nombre, descripcion, precio_sede, caracteristicas, destacado, activo, orden)
    values (trim(p_nombre), nullif(trim(p_descripcion), ''), p_precio_sede, v_car, p_destacado, p_activo, p_orden)
    returning id into v_id;
  else
    update public.planes
       set nombre = trim(p_nombre), descripcion = nullif(trim(p_descripcion), ''), precio_sede = p_precio_sede,
           caracteristicas = v_car, destacado = p_destacado, activo = p_activo, orden = p_orden, actualizado_en = now()
     where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'El plan no existe.' using errcode = 'P0002';
    end if;
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'Ya hay un plan con ese nombre.' using errcode = '23505';
end;
$$;
revoke all on function public.guardar_plan(uuid, text, text, numeric, text[], boolean, boolean, integer) from public, anon;
grant execute on function public.guardar_plan(uuid, text, text, numeric, text[], boolean, boolean, integer) to authenticated;

-- ── RPC: el plan del primer administrador ──────────────────────────────────────────────────────────
-- Sistema donde me toca elegir plan: soy admin, no es de pruebas y aún no tiene suscripción.
create or replace function public.plan_por_elegir()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'sistema_id', s.id,
           'sistema', s.nombre,
           'sedes', greatest(1, (select count(*) from public.sedes d where d.sistema_id = s.id and d.activo)))
    from public.sistemas s
   where s.activo and not s.es_pruebas
     and s.id in (select privado.mis_sistemas_con_rol('{admin}'))
     and not exists (select 1 from public.suscripciones x where x.sistema_id = s.id)
     and exists (select 1 from public.planes p where p.activo)
   order by s.creado_en
   limit 1;
$$;
revoke all on function public.plan_por_elegir() from public, anon;
grant execute on function public.plan_por_elegir() to authenticated;

create or replace function public.elegir_plan(p_sistema uuid, p_plan uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan  public.planes;
  v_hasta date := (now() at time zone 'America/Santo_Domingo')::date + 30;
begin
  if not privado.tiene_rol(p_sistema, '{admin}') then
    raise exception 'Solo la administración del hospital elige el plan.' using errcode = '42501';
  end if;
  if exists (select 1 from public.sistemas where id = p_sistema and es_pruebas) then
    raise exception 'Un sistema de pruebas no lleva plan.' using errcode = 'P0001';
  end if;
  select * into v_plan from public.planes where id = p_plan and activo;
  if v_plan.id is null then
    raise exception 'Ese plan ya no está disponible.' using errcode = 'P0002';
  end if;

  -- La clave primaria por sistema impide que dos administradores elijan a la vez.
  insert into public.suscripciones (sistema_id, plan_id, estado, precio_sede, prueba_hasta, proximo_corte, elegido_por, elegido_en)
  values (p_sistema, v_plan.id, 'prueba', v_plan.precio_sede, v_hasta, v_hasta, auth.uid(), now());

  return jsonb_build_object('plan', v_plan.nombre, 'prueba_hasta', v_hasta);
exception when unique_violation then
  raise exception 'Este hospital ya tiene un plan elegido.' using errcode = '23505';
end;
$$;
revoke all on function public.elegir_plan(uuid, uuid) from public, anon;
grant execute on function public.elegir_plan(uuid, uuid) to authenticated;

-- ── RPC: suscripciones (superadmin) ────────────────────────────────────────────────────────────────
create or replace function public.resumen_suscripciones()
returns table (sistema_id uuid, sistema text, es_pruebas boolean, plan_id uuid, plan text, estado text,
               precio_sede numeric, sedes bigint, monto_mensual numeric, prueba_hasta date, proximo_corte date,
               elegido_en timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not privado.es_superadmin() then
    raise exception 'Solo la administración de MEDORA ve las suscripciones.' using errcode = '42501';
  end if;
  return query
  select s.id, s.nombre, s.es_pruebas, x.plan_id, p.nombre, coalesce(x.estado, 'sin_plan'), x.precio_sede, n.sedes,
         case when x.estado in ('activa', 'vencida') then coalesce(x.precio_sede, 0) * n.sedes else 0 end,
         x.prueba_hasta, x.proximo_corte, x.elegido_en
    from public.sistemas s
    left join public.suscripciones x on x.sistema_id = s.id
    left join public.planes p on p.id = x.plan_id
    cross join lateral (select greatest(1, count(*)) sedes from public.sedes d where d.sistema_id = s.id and d.activo) n
   order by s.es_pruebas, s.nombre;
end;
$$;
revoke all on function public.resumen_suscripciones() from public, anon;
grant execute on function public.resumen_suscripciones() to authenticated;

create or replace function public.asignar_suscripcion(p_sistema uuid, p_plan uuid, p_estado text, p_proximo_corte date default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_precio numeric;
begin
  if not privado.es_superadmin() then
    raise exception 'Solo la administración de MEDORA cambia las suscripciones.' using errcode = '42501';
  end if;
  if p_estado not in ('prueba', 'activa', 'vencida', 'suspendida', 'cortesia') then
    raise exception 'Estado no válido.' using errcode = '22023';
  end if;
  if p_estado <> 'cortesia' and p_plan is null then
    raise exception 'Elige un plan.' using errcode = '22023';
  end if;
  select precio_sede into v_precio from public.planes where id = p_plan;

  insert into public.suscripciones (sistema_id, plan_id, estado, precio_sede, proximo_corte, prueba_hasta, elegido_en)
  values (p_sistema, p_plan, p_estado, v_precio, p_proximo_corte,
          case when p_estado = 'prueba' then coalesce(p_proximo_corte, (now() at time zone 'America/Santo_Domingo')::date + 30) end, now())
  on conflict (sistema_id) do update
     set plan_id = excluded.plan_id, estado = excluded.estado,
         -- Mismo plan: se conserva el precio pactado; otro plan: toma el precio vigente.
         precio_sede = case when public.suscripciones.plan_id is not distinct from excluded.plan_id
                            then coalesce(public.suscripciones.precio_sede, excluded.precio_sede) else excluded.precio_sede end,
         proximo_corte = excluded.proximo_corte,
         prueba_hasta = case when excluded.estado = 'prueba' then excluded.prueba_hasta else public.suscripciones.prueba_hasta end,
         actualizado_en = now();
end;
$$;
revoke all on function public.asignar_suscripcion(uuid, uuid, text, date) from public, anon;
grant execute on function public.asignar_suscripcion(uuid, uuid, text, date) to authenticated;

-- ── RPC: bienvenida ────────────────────────────────────────────────────────────────────────────────
-- Durante la bienvenida (y solo entonces) la persona elige su propio nombre de usuario.
create or replace function public.usuario_disponible(p_usuario text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v text := lower(trim(coalesce(p_usuario, '')));
begin
  if not exists (select 1 from public.perfiles where id = auth.uid() and bienvenida_en is null) then
    raise exception 'Solo se consulta durante la bienvenida.' using errcode = '42501';
  end if;
  return v ~ '^[a-z0-9][a-z0-9._-]{1,39}$'
     and not exists (select 1 from public.perfiles where nombre_usuario = v and id <> auth.uid());
end;
$$;
revoke all on function public.usuario_disponible(text) from public, anon;
grant execute on function public.usuario_disponible(text) to authenticated;

create or replace function public.elegir_nombre_usuario(p_usuario text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v text := lower(trim(coalesce(p_usuario, '')));
begin
  if not exists (select 1 from public.perfiles where id = auth.uid() and bienvenida_en is null) then
    raise exception 'Tu usuario ya está elegido. Solo un administrador puede cambiarlo.' using errcode = '42501';
  end if;
  if v !~ '^[a-z0-9][a-z0-9._-]{1,39}$' then
    raise exception 'Usa de 2 a 40 letras minúsculas, números, punto, guion o guion bajo; empieza con letra o número.' using errcode = '22023';
  end if;
  update public.perfiles set nombre_usuario = v where id = auth.uid();
  return v;
exception when unique_violation then
  raise exception 'Ese usuario ya lo usa otra persona.' using errcode = '23505';
end;
$$;
revoke all on function public.elegir_nombre_usuario(text) from public, anon;
grant execute on function public.elegir_nombre_usuario(text) to authenticated;

create or replace function public.completar_bienvenida()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.perfiles;
begin
  select * into v from public.perfiles where id = auth.uid();
  if v.id is null then
    raise exception 'Sin sesión.' using errcode = '42501';
  end if;
  if v.debe_cambiar_password then
    raise exception 'Primero crea tu contraseña.' using errcode = 'P0001';
  end if;
  if v.nombre_usuario is null then
    raise exception 'Primero elige tu nombre de usuario.' using errcode = 'P0001';
  end if;
  if public.plan_por_elegir() is not null then
    raise exception 'Primero elige el plan del hospital.' using errcode = 'P0001';
  end if;
  update public.perfiles set bienvenida_en = coalesce(bienvenida_en, now()) where id = v.id;
end;
$$;
revoke all on function public.completar_bienvenida() from public, anon;
grant execute on function public.completar_bienvenida() to authenticated;
