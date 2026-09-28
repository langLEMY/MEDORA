-- ============================================================================
-- MEDORA · Inicio de sesión por nombre de usuario
--
-- - perfiles.nombre_usuario: identificador de acceso (minúsculas, único en la
--   plataforma). Lo asigna la administración; la persona no puede cambiarlo.
-- - El correo NO desaparece: sigue siendo la identidad en Supabase Auth y el
--   dato de contacto para usos futuros. Quien no tiene correo recibe uno interno
--   (<usuario>@usuarios.medora.invalid) que nunca recibe mensajes.
-- - correo_de_acceso(): traduce lo que la persona escribe en el login (usuario o
--   correo) al correo de Auth, igual que FUNBIDE. Si el usuario no existe devuelve
--   un correo inexistente, así el login falla igual en ambos casos y no sirve
--   para averiguar qué usuarios existen.
-- - Códigos de invitación: solo para administradores (o superadmin). El resto del
--   personal lo crea un admin desde Personal con su nombre de usuario.
-- ============================================================================

alter table public.perfiles add column nombre_usuario text;
alter table public.perfiles add constraint ck_perfiles_nombre_usuario
  check (nombre_usuario ~ '^[a-z0-9][a-z0-9._-]{1,39}$');
create unique index ux_perfiles_nombre_usuario on public.perfiles (nombre_usuario);

create or replace function privado.tg_crear_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfiles (id, email, nombre_completo, debe_cambiar_password, nombre_usuario)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'nombre_completo', ''),
    coalesce((new.raw_user_meta_data ->> 'debe_cambiar_password')::boolean, false),
    nullif(lower(trim(new.raw_user_meta_data ->> 'nombre_usuario')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.correo_de_acceso(p_usuario text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when position('@' in v) > 0 then v
           else coalesce((select p.email from public.perfiles p where p.nombre_usuario = v),
                         v || '@no-existe.medora.invalid')
         end
    from (select lower(trim(coalesce(p_usuario, ''))) v) x;
$$;
revoke all on function public.correo_de_acceso(text) from public;
grant execute on function public.correo_de_acceso(text) to anon, authenticated;

-- Solo códigos para administradores.
do $$
declare
  v_def text := pg_get_functiondef('public.generar_codigo_invitacion(text, uuid, public.rol_sistema[], boolean, integer, integer)'::regprocedure);
  v_nueva text;
begin
  v_nueva := replace(v_def,
    '  for i in 0..11 loop',
    '  if not coalesce(p_superadmin, false) and (p_sistema is null or not (''admin'' = any(coalesce(p_roles, ''{}'')))) then
    raise exception ''Los códigos de invitación son solo para administradores. El resto del personal lo crea un admin desde Personal, con su nombre de usuario.'' using errcode = ''P0001'';
  end if;

  for i in 0..11 loop');
  if v_nueva = v_def then
    raise exception 'generar_codigo_invitacion no tiene el bucle esperado.';
  end if;
  execute v_nueva;
end;
$$;

drop function public.plataforma_usuarios();
create function public.plataforma_usuarios()
returns table (id uuid, nombre_completo text, email text, telefono text, es_superadmin boolean, activo boolean,
               creado_en timestamptz, ultimo_acceso timestamptz, sistemas bigint, nombre_usuario text)
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
           (select count(*) from public.membresias m where m.usuario_id = p.id and m.activo),
           p.nombre_usuario
      from public.perfiles p
      left join auth.users u on u.id = p.id
     order by p.nombre_completo;
end;
$$;
revoke all on function public.plataforma_usuarios() from public, anon;
grant execute on function public.plataforma_usuarios() to authenticated;
