-- ============================================================================
-- MEDORA · Perfil: portada (banner) y biografía
--
-- · biografia: «Sobre mí», hasta 180 caracteres, en perfiles (es pequeña).
-- · perfiles_portada: la imagen de portada (JPEG 3:1 de 1200×400 que recorta la app)
--   va en su propia tabla y no en perfiles: la sesión carga perfiles completo al entrar
--   y no debe arrastrar ~300 KB que solo se ven en Mi perfil.
-- Solo el dueño la lee y la cambia. No es tabla de negocio (como perfiles, no lleva
-- sistema_id) ni se audita.
-- ============================================================================
alter table public.perfiles
  add column biografia text check (biografia is null or char_length(biografia) <= 180);
grant update (biografia) on public.perfiles to authenticated;

create table public.perfiles_portada (
  perfil_id      uuid primary key references public.perfiles(id) on delete cascade,
  imagen         text not null check (imagen like 'data:image/%' and length(imagen) <= 400000),
  actualizado_en timestamptz not null default now()
);

alter table public.perfiles_portada enable row level security;
revoke all on public.perfiles_portada from anon;
grant select, insert, update, delete on public.perfiles_portada to authenticated;

create policy perfiles_portada_select on public.perfiles_portada for select to authenticated
  using (perfil_id = (select auth.uid()));
create policy perfiles_portada_insert on public.perfiles_portada for insert to authenticated
  with check (perfil_id = (select auth.uid()));
create policy perfiles_portada_update on public.perfiles_portada for update to authenticated
  using (perfil_id = (select auth.uid())) with check (perfil_id = (select auth.uid()));
create policy perfiles_portada_delete on public.perfiles_portada for delete to authenticated
  using (perfil_id = (select auth.uid()));
