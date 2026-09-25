-- ============================================================================
-- MEDORA · 0007 · Código de instalación para el asistente de primer arranque
--
-- Sin esto, entre que se despliega el proyecto y que el dueño completa la
-- configuración inicial, cualquiera con la URL pública podría llamar a
-- configuracion-inicial y quedarse con la cuenta de superadmin. El hash del
-- código se carga aparte (nunca en el repo):
--   insert into privado.instalacion (codigo_hash)
--   values (encode(extensions.digest('<código>', 'sha256'), 'hex'));
-- ============================================================================
create table privado.instalacion (
  id          integer primary key default 1 check (id = 1),
  codigo_hash text not null,
  creado_en   timestamptz not null default now()
);
revoke all on privado.instalacion from public, anon, authenticated;

-- Solo la Edge Function (service_role) puede verificarlo.
create or replace function public.verificar_codigo_instalacion(p_codigo text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from privado.instalacion
     where codigo_hash = encode(extensions.digest(coalesce(p_codigo, ''), 'sha256'), 'hex')
  );
$$;

revoke all on function public.verificar_codigo_instalacion(text) from public, anon, authenticated;
grant execute on function public.verificar_codigo_instalacion(text) to service_role;
