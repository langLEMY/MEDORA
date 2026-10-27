-- ============================================================================
-- MEDORA · Capacidades por tipo de establecimiento (Fase 0 de la diferenciación)
--
-- En RD, consultorio / clínica / hospital / laboratorio / farmacia son
-- categorías distintas. Esta migración es la BASE para que MEDORA cambie de
-- "modo" según el tipo de sede, decidiendo qué MÓDULOS OPERATIVOS aplican.
--
-- 100% ADITIVA — no toca ningún dato ni el comportamiento actual:
--   - Agrega `sedes.capacidades` (jsonb) con default '{}'.
--   - `privado.capacidades_tipo(tipo)` define el preset de cada tipo.
--   - Las capacidades gobiernan SOLO los módulos diferenciadores (agenda,
--     historia clínica, internamiento, emergencia, laboratorio, farmacia…).
--     El ERP existente (caja, gastos, nómina, contabilidad, finanzas,
--     inventario, personal, precios) NO depende de esto: sigue por rol.
--   - FUNBIDE (sede "consultorio") mantiene exactamente lo que ve hoy.
-- Ninguna UI se cablea aquí todavía; esto es solo el esquema.
-- ============================================================================

alter table public.sedes
  add column if not exists capacidades jsonb not null default '{}'::jsonb;

comment on column public.sedes.capacidades is
  'Ajustes de capacidades por sede que SOBREESCRIBEN el preset del tipo (ver privado.capacidades_tipo). {} = usar el preset tal cual.';

-- Preset de capacidades por tipo de establecimiento (modelo RD).
-- Claves = módulos diferenciadores. Lo que no aparece se considera false.
create or replace function privado.capacidades_tipo(p_tipo text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case p_tipo
    when 'consultorio' then
      '{"agenda":true,"historia_clinica":true,"recetas":true}'::jsonb
    when 'clinica' then
      '{"agenda":true,"historia_clinica":true,"recetas":true,
        "internamiento":true,"emergencia":true,"quirofano":true,
        "laboratorio":true,"farmacia_pos":true}'::jsonb
    when 'hospital' then
      '{"agenda":true,"historia_clinica":true,"recetas":true,
        "internamiento":true,"emergencia":true,"quirofano":true,"imagenes":true,
        "laboratorio":true,"farmacia_pos":true,"controlados":true}'::jsonb
    when 'laboratorio' then
      '{"laboratorio":true}'::jsonb
    when 'farmacia' then
      '{"farmacia_pos":true,"controlados":true}'::jsonb
    else  -- 'otro': base configurable con overrides
      '{"agenda":true,"historia_clinica":true,"recetas":true}'::jsonb
  end;
$$;

-- Capacidades efectivas de una sede = preset del tipo + overrides de la sede.
-- Para la UI y, en el futuro, para gatear los módulos nuevos en RLS.
create or replace function public.capacidades_sede(p_sede uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select privado.capacidades_tipo(s.tipo) || coalesce(s.capacidades, '{}'::jsonb)
  from public.sedes s
  where s.id = p_sede and s.sistema_id in (select privado.mis_sistemas());
$$;

revoke all on function public.capacidades_sede(uuid) from public, anon;
grant execute on function public.capacidades_sede(uuid) to authenticated;
