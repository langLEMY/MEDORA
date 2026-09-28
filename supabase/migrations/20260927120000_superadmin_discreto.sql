-- ============================================================================
-- MEDORA · Superadministración discreta
--
-- El personal de un hospital no ve a los superadmins (soporte de la plataforma)
-- en sus listas ni puede modificar sus membresías, aunque el superadmin tenga
-- membresía en ese sistema para operar en él. Sus acciones siguen en la
-- auditoría (la app las muestra como "Soporte MEDORA").
-- ============================================================================

create or replace function privado.superadmins()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.perfiles where es_superadmin;
$$;
revoke all on function privado.superadmins() from public, anon;
grant execute on function privado.superadmins() to authenticated, service_role;

alter policy membresias_select on public.membresias using (
  usuario_id = (select auth.uid())
  or (select privado.es_superadmin())
  or (sistema_id in (select privado.mis_sistemas()) and usuario_id not in (select privado.superadmins()))
);

alter policy membresias_insert on public.membresias with check (
  (select privado.es_superadmin())
  or (sistema_id in (select privado.sistemas_administrables()) and usuario_id not in (select privado.superadmins()))
);

alter policy membresias_update on public.membresias
  using (
    (select privado.es_superadmin())
    or (sistema_id in (select privado.sistemas_administrables()) and usuario_id not in (select privado.superadmins()))
  )
  with check (
    (select privado.es_superadmin())
    or (sistema_id in (select privado.sistemas_administrables()) and usuario_id not in (select privado.superadmins()))
  );

alter policy perfiles_select on public.perfiles using (
  id = (select auth.uid())
  or (select privado.es_superadmin())
  or (not es_superadmin and exists (
        select 1 from public.membresias m
         where m.usuario_id = perfiles.id and m.sistema_id in (select privado.mis_sistemas())))
);
