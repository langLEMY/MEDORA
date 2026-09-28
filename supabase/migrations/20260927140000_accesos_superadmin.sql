-- ============================================================================
-- MEDORA · Lo que es exclusivo de la superadministración
--
-- - Identidad del hospital (sistemas: nombre, RNC, razón social, marca) y sus
--   sedes: solo superadmin. El admin del hospital la ve pero no la cambia.
-- - Permisos por módulo (membresias.permisos): solo superadmin. El admin del
--   hospital sigue asignando roles a su personal.
-- (Soporte/diagnóstico ya era exclusivo: RPC de plataforma + UI.)
-- ============================================================================

alter policy sistemas_update on public.sistemas
  using ((select privado.es_superadmin()))
  with check ((select privado.es_superadmin()));

alter policy sedes_insert on public.sedes
  with check ((select privado.es_superadmin()));

alter policy sedes_update on public.sedes
  using ((select privado.es_superadmin()))
  with check ((select privado.es_superadmin()));

-- Permisos por módulo: la columna solo la cambia un superadmin (o el servidor,
-- sin usuario: Edge Functions con service key y migraciones).
create or replace function privado.tg_permisos_solo_superadmin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and not privado.es_superadmin()
     and (tg_op = 'INSERT' and new.permisos <> '{}'::jsonb
          or tg_op = 'UPDATE' and new.permisos is distinct from old.permisos) then
    raise exception 'Solo la superadministración puede cambiar los permisos por módulo.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function privado.tg_permisos_solo_superadmin() from public, anon, authenticated;

create trigger trg_membresias_permisos before insert or update of permisos on public.membresias
  for each row execute function privado.tg_permisos_solo_superadmin();
