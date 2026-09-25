-- ============================================================================
-- MEDORA · 0001 · Fundación multi-tenant
--
-- Modelo: un "sistema" es un sistema hospitalario (el tenant). Cada sistema tiene
-- una o más "sedes" (hospitales / clínicas físicas). Los usuarios (auth.users) se
-- vinculan a uno o varios sistemas mediante "membresias", cada una con uno o más
-- roles. Toda tabla de negocio lleva sistema_id y su RLS se resuelve contra las
-- membresías del usuario autenticado — el aislamiento entre sistemas vive en
-- Postgres, no en el cliente.
--
-- Diferencia deliberada con FUNBIDE: allí el RLS era una sola política
-- "authenticated_access USING (true)" y los roles solo los aplicaba la API .NET.
-- Con varios sistemas hospitalarios en la misma base eso no alcanza: el cliente
-- (la app de escritorio) habla directo con Supabase, así que cada regla de acceso
-- tiene que ser una política de RLS.
--
-- Funciones auxiliares de RLS en el esquema "privado": no está en los esquemas
-- expuestos de PostgREST, así que no se pueden invocar como RPC desde la API.
-- ============================================================================

create extension if not exists pg_trgm with schema extensions;
create extension if not exists btree_gist with schema extensions;

create schema if not exists privado;
revoke all on schema privado from public, anon;
grant usage on schema privado to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.rol_sistema as enum (
  'admin',        -- administra el sistema hospitalario: personal, sedes, catálogos
  'medico',       -- pacientes, agenda propia, historial clínico
  'enfermeria',   -- pacientes, triaje/signos vitales, historial clínico
  'recepcion',    -- pacientes, agenda, sala de espera
  'caja',         -- turnos de caja, cobros, movimientos financieros
  'farmacia',     -- inventario
  'auditor'       -- solo lectura: bitácora, finanzas, historial
);

-- ---------------------------------------------------------------------------
-- Utilidades genéricas
-- ---------------------------------------------------------------------------
create or replace function privado.tg_marcar_actualizacion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actualizado_en := now();
  new.actualizado_por := auth.uid();
  return new;
end;
$$;

-- Mismo guardián que funbide.bloquear_modificacion_append_only: las tablas
-- append-only (historial clínico, cobros, movimientos, auditoría) no admiten
-- UPDATE ni DELETE, ni siquiera desde la consola o con service_role.
create or replace function privado.tg_bloquear_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'La tabla %.% es append-only: no se permiten UPDATE ni DELETE.',
    tg_table_schema, tg_table_name
    using errcode = '42501';
end;
$$;

-- ---------------------------------------------------------------------------
-- Sistemas hospitalarios (tenants)
-- ---------------------------------------------------------------------------
create table public.sistemas (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null check (char_length(nombre) between 2 and 120),
  slug            text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  razon_social    text,
  rnc             text,
  telefono        text,
  email           text,
  direccion       text,
  color_marca     text not null default '#0F766E' check (color_marca ~ '^#[0-9A-Fa-f]{6}$'),
  logo_url        text,
  zona_horaria    text not null default 'America/Santo_Domingo',
  moneda          text not null default 'DOP' check (moneda ~ '^[A-Z]{3}$'),
  activo          boolean not null default true,
  creado_en       timestamptz not null default now(),
  creado_por      uuid default auth.uid(),
  actualizado_en  timestamptz not null default now(),
  actualizado_por uuid
);

create trigger trg_sistemas_actualizacion
  before update on public.sistemas
  for each row execute function privado.tg_marcar_actualizacion();

-- ---------------------------------------------------------------------------
-- Sedes (hospitales / clínicas de un sistema)
-- ---------------------------------------------------------------------------
create table public.sedes (
  id              uuid primary key default gen_random_uuid(),
  sistema_id      uuid not null references public.sistemas(id) on delete restrict,
  nombre          text not null check (char_length(nombre) between 2 and 120),
  codigo          text,
  tipo            text not null default 'hospital'
                  check (tipo in ('hospital', 'clinica', 'consultorio', 'laboratorio', 'farmacia', 'otro')),
  direccion       text,
  telefono        text,
  activo          boolean not null default true,
  creado_en       timestamptz not null default now(),
  creado_por      uuid default auth.uid(),
  actualizado_en  timestamptz not null default now(),
  actualizado_por uuid,
  unique (sistema_id, nombre),
  unique (sistema_id, id)
);
create index ix_sedes_sistema on public.sedes (sistema_id);

create trigger trg_sedes_actualizacion
  before update on public.sedes
  for each row execute function privado.tg_marcar_actualizacion();

-- ---------------------------------------------------------------------------
-- Perfiles (1:1 con auth.users)
-- ---------------------------------------------------------------------------
create table public.perfiles (
  id                     uuid primary key references auth.users(id) on delete cascade,
  nombre_completo        text not null default '',
  email                  text not null,
  telefono               text,
  avatar_url             text,
  -- Operador de la plataforma MEDORA (equivalente a "Lemy" en FUNBIDE): crea
  -- sistemas y administra su personal. NO ve datos clínicos ni financieros de
  -- un sistema salvo que tenga membresía explícita en él.
  es_superadmin          boolean not null default false,
  debe_cambiar_password  boolean not null default false,
  ultimo_sistema_id      uuid references public.sistemas(id) on delete set null,
  creado_en              timestamptz not null default now(),
  actualizado_en         timestamptz not null default now(),
  actualizado_por        uuid
);

create trigger trg_perfiles_actualizacion
  before update on public.perfiles
  for each row execute function privado.tg_marcar_actualizacion();

-- Alta automática del perfil al crearse el usuario en Supabase Auth.
create or replace function privado.tg_crear_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfiles (id, email, nombre_completo, debe_cambiar_password)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'nombre_completo', ''),
    coalesce((new.raw_user_meta_data ->> 'debe_cambiar_password')::boolean, false)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger trg_auth_usuario_creado
  after insert on auth.users
  for each row execute function privado.tg_crear_perfil();

create or replace function privado.tg_sincronizar_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.perfiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;

create trigger trg_auth_email_actualizado
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function privado.tg_sincronizar_email();

-- ---------------------------------------------------------------------------
-- Membresías (usuario ↔ sistema, con roles)
-- ---------------------------------------------------------------------------
create table public.membresias (
  id              uuid primary key default gen_random_uuid(),
  sistema_id      uuid not null references public.sistemas(id) on delete restrict,
  usuario_id      uuid not null references public.perfiles(id) on delete cascade,
  roles           public.rol_sistema[] not null check (cardinality(roles) > 0),
  sede_id         uuid,
  especialidad    text,
  exequatur       text,
  activo          boolean not null default true,
  creado_en       timestamptz not null default now(),
  creado_por      uuid default auth.uid(),
  actualizado_en  timestamptz not null default now(),
  actualizado_por uuid,
  unique (sistema_id, usuario_id),
  foreign key (sistema_id, sede_id) references public.sedes (sistema_id, id)
);
create index ix_membresias_usuario on public.membresias (usuario_id) where activo;
create index ix_membresias_roles on public.membresias using gin (roles);

create trigger trg_membresias_actualizacion
  before update on public.membresias
  for each row execute function privado.tg_marcar_actualizacion();

-- ---------------------------------------------------------------------------
-- Contadores por sistema (expedientes, recibos...). Sin acceso directo: solo
-- privado.siguiente_numero (security definer) los toca.
-- ---------------------------------------------------------------------------
create table public.contadores (
  sistema_id uuid not null references public.sistemas(id) on delete restrict,
  clave      text not null,
  valor      bigint not null default 0,
  primary key (sistema_id, clave)
);

create or replace function privado.siguiente_numero(p_sistema uuid, p_clave text)
returns bigint
language sql
security definer
set search_path = ''
as $$
  insert into public.contadores as c (sistema_id, clave, valor)
  values (p_sistema, p_clave, 1)
  on conflict (sistema_id, clave) do update set valor = c.valor + 1
  returning c.valor;
$$;

-- ---------------------------------------------------------------------------
-- Helpers de RLS
--
-- Devuelven conjuntos (setof uuid) para usarse como
--   sistema_id in (select privado.mis_sistemas())
-- Postgres evalúa el subselect una sola vez por consulta (initplan / hashed
-- subplan) en vez de una vez por fila — clave para que el RLS escale con
-- tablas grandes (pacientes, citas, auditoría).
-- ---------------------------------------------------------------------------
create or replace function privado.es_superadmin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.es_superadmin from public.perfiles p where p.id = (select auth.uid())),
    false
  );
$$;

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
  where m.usuario_id = (select auth.uid())
    and m.activo
    and s.activo;
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
  where m.usuario_id = (select auth.uid())
    and m.activo
    and s.activo
    and m.roles && p_roles;
$$;

-- Sistemas cuyo personal/configuración puede gestionar el usuario: todos si es
-- superadmin, o aquellos donde es admin.
create or replace function privado.sistemas_administrables()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id from public.sistemas s where privado.es_superadmin()
  union
  select privado.mis_sistemas_con_rol(array['admin']::public.rol_sistema[]);
$$;

create or replace function privado.tiene_rol(p_sistema uuid, p_roles public.rol_sistema[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from privado.mis_sistemas_con_rol(p_roles) x where x = p_sistema
  );
$$;

revoke all on all functions in schema privado from public, anon;
grant execute on all functions in schema privado to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.sistemas   enable row level security;
alter table public.sedes      enable row level security;
alter table public.perfiles   enable row level security;
alter table public.membresias enable row level security;
alter table public.contadores enable row level security;

-- sistemas
create policy sistemas_select on public.sistemas for select to authenticated
  using (id in (select privado.mis_sistemas()) or (select privado.es_superadmin()));
create policy sistemas_insert on public.sistemas for insert to authenticated
  with check ((select privado.es_superadmin()));
create policy sistemas_update on public.sistemas for update to authenticated
  using (id in (select privado.sistemas_administrables()))
  with check (id in (select privado.sistemas_administrables()));

-- sedes
create policy sedes_select on public.sedes for select to authenticated
  using (sistema_id in (select privado.mis_sistemas()) or (select privado.es_superadmin()));
create policy sedes_insert on public.sedes for insert to authenticated
  with check (sistema_id in (select privado.sistemas_administrables()));
create policy sedes_update on public.sedes for update to authenticated
  using (sistema_id in (select privado.sistemas_administrables()))
  with check (sistema_id in (select privado.sistemas_administrables()));

-- perfiles: uno mismo, colegas de los mismos sistemas, o superadmin.
create policy perfiles_select on public.perfiles for select to authenticated
  using (
    id = (select auth.uid())
    or (select privado.es_superadmin())
    or exists (
      select 1 from public.membresias m
      where m.usuario_id = perfiles.id
        and m.sistema_id in (select privado.mis_sistemas())
    )
  );
create policy perfiles_update_propio on public.perfiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- membresias
create policy membresias_select on public.membresias for select to authenticated
  using (
    usuario_id = (select auth.uid())
    or sistema_id in (select privado.mis_sistemas())
    or (select privado.es_superadmin())
  );
create policy membresias_insert on public.membresias for insert to authenticated
  with check (sistema_id in (select privado.sistemas_administrables()));
create policy membresias_update on public.membresias for update to authenticated
  using (sistema_id in (select privado.sistemas_administrables()))
  with check (sistema_id in (select privado.sistemas_administrables()));

-- contadores: sin políticas → inaccesible salvo por funciones security definer.

-- ---------------------------------------------------------------------------
-- Privilegios: anon no toca ninguna tabla. Los perfiles solo se editan en
-- columnas no sensibles (es_superadmin / debe_cambiar_password quedan fuera).
-- ---------------------------------------------------------------------------
revoke all on public.sistemas, public.sedes, public.perfiles, public.membresias, public.contadores from anon;
revoke all on public.contadores from authenticated;
revoke delete on public.sistemas, public.sedes, public.membresias, public.perfiles from authenticated;
revoke insert, update on public.perfiles from authenticated;
grant update (nombre_completo, telefono, avatar_url, ultimo_sistema_id) on public.perfiles to authenticated;
