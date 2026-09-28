-- MEDORA · La lista de pacientes se ordena alfabéticamente por defecto.
create index if not exists ix_pacientes_nombre on public.pacientes (sistema_id, nombres, apellidos) where eliminado_en is null;
