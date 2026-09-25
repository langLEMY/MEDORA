-- ============================================================================
-- MEDORA · 0006 · Realtime para la sala de espera
-- Recepción, enfermería y médicos ven los cambios de estado de las citas al
-- instante en todas las PCs. Realtime respeta el RLS de citas.
-- ============================================================================
alter publication supabase_realtime add table public.citas;
