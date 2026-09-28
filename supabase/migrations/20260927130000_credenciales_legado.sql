-- ============================================================================
-- MEDORA · Credenciales heredadas de FUNBIDE (migración en el primer acceso)
--
-- FUNBIDE (modo de autenticación local) guarda algunas contraseñas con el
-- hasher de ASP.NET Core Identity v3 (PBKDF2-HMAC-SHA512, 100 000 iteraciones),
-- que Supabase Auth no sabe verificar. Se guardan aquí y la Edge Function
-- `acceso-legado` las verifica la primera vez que la persona entra; si la
-- contraseña es correcta la registra en Auth y borra el hash viejo. Resultado:
-- cada persona conserva EXACTAMENTE su contraseña de FUNBIDE sin que nadie la
-- conozca.
--
-- Solo accesible con la service key (la Edge Function). Nadie más la ve.
-- ============================================================================

create table privado.credenciales_legado (
  usuario_id uuid primary key references public.perfiles(id) on delete cascade,
  hash       text not null check (hash like 'AQAAAA%'),
  origen     text not null default 'FUNBIDE',
  creado_en  timestamptz not null default now()
);
alter table privado.credenciales_legado enable row level security;
revoke all on privado.credenciales_legado from public, anon, authenticated;

-- La Edge Function lee y consume por RPC (service_role únicamente).
create or replace function public.credencial_legado(p_usuario text)
returns table (usuario_id uuid, email text, hash text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.usuario_id, p.email, c.hash
    from privado.credenciales_legado c
    join public.perfiles p on p.id = c.usuario_id
   where p.nombre_usuario = lower(trim(p_usuario)) or p.email = lower(trim(p_usuario))
   limit 1;
$$;

create or replace function public.consumir_credencial_legado(p_usuario_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from privado.credenciales_legado where usuario_id = p_usuario_id;
  update public.perfiles set debe_cambiar_password = false where id = p_usuario_id;
$$;

revoke all on function public.credencial_legado(text) from public, anon, authenticated;
revoke all on function public.consumir_credencial_legado(uuid) from public, anon, authenticated;
grant execute on function public.credencial_legado(text) to service_role;
grant execute on function public.consumir_credencial_legado(uuid) to service_role;
