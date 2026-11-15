-- Módulos activos por hospital: el superadmin apaga las secciones del menú que un
-- hospital no usa (rutas base, p. ej. '/agenda'). Es solo presentación: los permisos
-- siguen en RLS por rol; apagar un módulo no da ni quita acceso a datos.
-- La edita quien ya puede editar sistemas (RLS sistemas_update: superadmin).

alter table public.sistemas
  add column if not exists modulos_apagados text[] not null default '{}';

alter table public.sistemas
  drop constraint if exists sistemas_modulos_apagados_rutas;
alter table public.sistemas
  add constraint sistemas_modulos_apagados_rutas
  check (
    cardinality(modulos_apagados) <= 40
    and not ('/' = any (modulos_apagados))
    and not ('/personal' = any (modulos_apagados))
    and not ('/administracion' = any (modulos_apagados))
    and not ('/plataforma' = any (modulos_apagados))
    and not ('/ayuda' = any (modulos_apagados))
  );

comment on column public.sistemas.modulos_apagados is
  'Rutas del menú ocultas en este hospital (solo UI). Inicio, Personal, Administración, Plataforma y Ayuda no se pueden apagar.';
