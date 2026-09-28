-- MEDORA · Preferencias de interfaz de cada usuario (tema, tamaño de texto,
-- densidad, contraste, animaciones, página de inicio). Viven en su perfil para
-- seguirlo en cualquier computadora; la app las cachea en localStorage para
-- aplicarlas antes de pintar. Solo el dueño las cambia (RLS perfiles_update_propio).
alter table public.perfiles
  add column preferencias jsonb not null default '{}'::jsonb
  check (jsonb_typeof(preferencias) = 'object' and pg_column_size(preferencias) < 4096);

grant update (preferencias) on public.perfiles to authenticated;
