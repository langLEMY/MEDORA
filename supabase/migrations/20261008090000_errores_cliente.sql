-- Aplicada en producción el 8/10/2026 desde otra máquina sin subirla al repo ni guardar su texto;
-- reconstruida el 9/10/2026 desde la definición viva (columnas, índices, RLS, permisos y funciones).
-- Errores de la app: cada equipo reporta sus fallos (sin datos de pacientes) y el superadmin los ve
-- en Soporte → "Errores recientes", los marca resueltos y limpia los de más de 30 días.

create table if not exists public.errores_cliente (
  id          uuid primary key default gen_random_uuid(),
  creado_en   timestamptz not null default now(),
  sistema_id  uuid references public.sistemas (id) on delete set null,
  usuario_id  uuid,
  rol         text,
  entorno     text,
  version     text,
  pantalla    text,
  tipo        text,
  mensaje     text not null,
  stack       text,
  user_agent  text,
  resuelto    boolean not null default false
);

create index if not exists ix_errores_cliente_creado on public.errores_cliente (creado_en desc) where not resuelto;

alter table public.errores_cliente enable row level security;

drop policy if exists errores_cliente_select on public.errores_cliente;
create policy errores_cliente_select on public.errores_cliente for select
  using ((select privado.es_superadmin()));
drop policy if exists errores_cliente_update on public.errores_cliente;
create policy errores_cliente_update on public.errores_cliente for update
  using ((select privado.es_superadmin())) with check ((select privado.es_superadmin()));

revoke all on public.errores_cliente from anon, authenticated;
grant select, update on public.errores_cliente to authenticated;

create or replace function public.registrar_error_cliente(
  p_entorno text, p_version text, p_pantalla text, p_tipo text, p_mensaje text,
  p_sistema uuid default null, p_rol text default null, p_stack text default null, p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if p_mensaje is null or length(trim(p_mensaje)) = 0 then return; end if;
  -- No inundar: máx. 40 errores por hora por usuario (o por sesión anónima).
  if not public.consumir_limite('err:' || coalesce(v_uid::text, 'anon'), 40, 3600) then return; end if;

  insert into public.errores_cliente (sistema_id, usuario_id, rol, entorno, version, pantalla, tipo, mensaje, stack, user_agent)
  values (p_sistema, v_uid, left(p_rol, 40), left(p_entorno, 20), left(p_version, 20), left(p_pantalla, 200),
          left(p_tipo, 120), left(p_mensaje, 2000), left(p_stack, 8000), left(p_user_agent, 300));
end;
$$;

create or replace function public.plataforma_limpiar_errores(p_dias integer default 30)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n bigint;
begin
  if not (select privado.es_superadmin()) then
    raise exception 'Solo la superadministración.' using errcode = '42501';
  end if;
  delete from public.errores_cliente where creado_en < now() - make_interval(days => greatest(p_dias, 0));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Los errores del login (antes de iniciar sesión) también se reportan: por eso anon.
revoke all on function public.registrar_error_cliente(text, text, text, text, text, uuid, text, text, text) from public;
grant execute on function public.registrar_error_cliente(text, text, text, text, text, uuid, text, text, text) to anon, authenticated;
revoke all on function public.plataforma_limpiar_errores(integer) from public, anon;
grant execute on function public.plataforma_limpiar_errores(integer) to authenticated;
