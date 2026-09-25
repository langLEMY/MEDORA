-- ============================================================================
-- MEDORA · 0008 · Administración de plataforma: usuarios y códigos de invitación
--
-- - perfiles.activo: desactivación global de una persona. Además del bloqueo en
--   Auth (ban, lo hace la Edge Function plataforma-usuarios), los helpers de RLS
--   exigen perfil activo: el corte de acceso a datos es inmediato, aunque su JWT
--   siga vigente unos minutos.
-- - codigos_invitacion: el superadmin genera códigos (para un sistema con roles, o
--   para otro superadmin) con vencimiento y usos máximos. En la base solo se
--   guarda el hash; el código en texto se muestra una única vez al generarlo.
-- ============================================================================

alter table public.perfiles add column activo boolean not null default true;

-- Helpers de RLS: una persona desactivada no tiene acceso a ningún sistema ------
create or replace function privado.es_superadmin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.es_superadmin and p.activo from public.perfiles p where p.id = (select auth.uid())),
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
  join public.perfiles p on p.id = m.usuario_id
  where m.usuario_id = (select auth.uid()) and m.activo and s.activo and p.activo;
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
  where m.usuario_id = (select auth.uid()) and m.activo and s.activo and p.activo and m.roles && p_roles;
$$;

-- Códigos de invitación -----------------------------------------------------
create table public.codigos_invitacion (
  id                uuid primary key default gen_random_uuid(),
  codigo_hash       text not null unique,
  pista             text not null,
  descripcion       text,
  sistema_id        uuid references public.sistemas(id) on delete restrict,
  roles             public.rol_sistema[] not null default '{}',
  otorga_superadmin boolean not null default false,
  usos_maximos      integer not null default 1 check (usos_maximos between 1 and 500),
  usos              integer not null default 0 check (usos >= 0),
  expira_en         timestamptz not null,
  revocado_en       timestamptz,
  creado_por        uuid default auth.uid() references public.perfiles(id),
  creado_en         timestamptz not null default now(),
  check (otorga_superadmin or (sistema_id is not null and cardinality(roles) > 0))
);
create index ix_codigos_creado on public.codigos_invitacion (creado_en desc);
create index ix_fk_codigos_sistema on public.codigos_invitacion (sistema_id);
create index ix_fk_codigos_creado_por on public.codigos_invitacion (creado_por);

create trigger trg_codigos_invitacion_auditoria after insert or update or delete on public.codigos_invitacion
  for each row execute function privado.tg_auditar();

alter table public.codigos_invitacion enable row level security;
create policy codigos_select on public.codigos_invitacion for select to authenticated
  using ((select privado.es_superadmin()));
revoke all on public.codigos_invitacion from anon;
revoke insert, update, delete, truncate on public.codigos_invitacion from authenticated;

-- Genera un código y devuelve el texto (única vez que se ve) ----------------
create or replace function public.generar_codigo_invitacion(
  p_descripcion text,
  p_sistema uuid,
  p_roles public.rol_sistema[],
  p_superadmin boolean,
  p_usos integer,
  p_dias integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes    bytea := extensions.gen_random_bytes(12);
  v_codigo   text := 'INV-';
begin
  if not privado.es_superadmin() then
    raise exception 'Solo la superadministración puede generar códigos.' using errcode = '42501';
  end if;

  for i in 0..11 loop
    v_codigo := v_codigo || substr(v_alfabeto, (get_byte(v_bytes, i) % 32) + 1, 1);
    if i in (3, 7) then
      v_codigo := v_codigo || '-';
    end if;
  end loop;

  insert into public.codigos_invitacion
    (codigo_hash, pista, descripcion, sistema_id, roles, otorga_superadmin, usos_maximos, expira_en, creado_por)
  values (
    encode(extensions.digest(v_codigo, 'sha256'), 'hex'),
    right(v_codigo, 4),
    nullif(trim(p_descripcion), ''),
    case when coalesce(p_superadmin, false) and p_sistema is null then null else p_sistema end,
    coalesce(p_roles, '{}'),
    coalesce(p_superadmin, false),
    greatest(1, least(coalesce(p_usos, 1), 500)),
    now() + make_interval(days => greatest(1, least(coalesce(p_dias, 7), 365))),
    auth.uid()
  );
  return v_codigo;
end;
$$;

create or replace function public.revocar_codigo_invitacion(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not privado.es_superadmin() then
    raise exception 'Solo la superadministración puede revocar códigos.' using errcode = '42501';
  end if;
  update public.codigos_invitacion set revocado_en = now() where id = p_id and revocado_en is null;
end;
$$;

-- Consultas para la Edge Function registro-invitacion (solo service_role) ---
create or replace function public.consultar_codigo_invitacion(p_codigo text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id,
    'otorga_superadmin', c.otorga_superadmin,
    'roles', c.roles,
    'sistema', s.nombre
  )
  from public.codigos_invitacion c
  left join public.sistemas s on s.id = c.sistema_id
  where c.codigo_hash = encode(extensions.digest(upper(trim(coalesce(p_codigo, ''))), 'sha256'), 'hex')
    and c.revocado_en is null
    and c.expira_en > now()
    and c.usos < c.usos_maximos
    and (c.sistema_id is null or s.activo);
$$;

create or replace function public.canjear_codigo_invitacion(p_codigo text, p_usuario uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.codigos_invitacion;
begin
  select * into v from public.codigos_invitacion
   where codigo_hash = encode(extensions.digest(upper(trim(coalesce(p_codigo, ''))), 'sha256'), 'hex')
   for update;

  if v.id is null or v.revocado_en is not null or v.expira_en <= now() or v.usos >= v.usos_maximos then
    raise exception 'El código no es válido, venció o ya fue usado.' using errcode = 'P0001';
  end if;

  update public.codigos_invitacion set usos = usos + 1 where id = v.id;

  if v.otorga_superadmin then
    update public.perfiles set es_superadmin = true where id = p_usuario;
  end if;

  if v.sistema_id is not null then
    insert into public.membresias as m (sistema_id, usuario_id, roles, creado_por)
    values (v.sistema_id, p_usuario, v.roles, v.creado_por)
    on conflict (sistema_id, usuario_id) do update
      set roles = (select array_agg(distinct r) from unnest(m.roles || excluded.roles) r),
          activo = true;
  end if;

  return jsonb_build_object('sistema_id', v.sistema_id, 'otorga_superadmin', v.otorga_superadmin);
end;
$$;

-- Directorio global de usuarios (con último acceso desde auth.users) --------
create or replace function public.plataforma_usuarios()
returns table (
  id uuid, nombre_completo text, email text, telefono text, es_superadmin boolean, activo boolean,
  creado_en timestamptz, ultimo_acceso timestamptz, sistemas bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not privado.es_superadmin() then
    raise exception 'Solo la superadministración.' using errcode = '42501';
  end if;
  return query
    select p.id, p.nombre_completo, p.email, p.telefono, p.es_superadmin, p.activo, p.creado_en,
           u.last_sign_in_at,
           (select count(*) from public.membresias m where m.usuario_id = p.id and m.activo)
      from public.perfiles p
      left join auth.users u on u.id = p.id
     order by p.nombre_completo;
end;
$$;

revoke all on function public.generar_codigo_invitacion(text, uuid, public.rol_sistema[], boolean, integer, integer) from public, anon;
revoke all on function public.revocar_codigo_invitacion(uuid) from public, anon;
revoke all on function public.consultar_codigo_invitacion(text) from public, anon, authenticated;
revoke all on function public.canjear_codigo_invitacion(text, uuid) from public, anon, authenticated;
revoke all on function public.plataforma_usuarios() from public, anon;
grant execute on function public.generar_codigo_invitacion(text, uuid, public.rol_sistema[], boolean, integer, integer) to authenticated;
grant execute on function public.revocar_codigo_invitacion(uuid) to authenticated;
grant execute on function public.consultar_codigo_invitacion(text) to service_role;
grant execute on function public.canjear_codigo_invitacion(text, uuid) to service_role;
grant execute on function public.plataforma_usuarios() to authenticated;
