-- ============================================================================
-- MEDORA . Auditoría solo de lo importante
--
-- Reconstruida el 2026-10-04 a partir de la base de producción (se aplicó el
-- 2026-10-02 desde otra máquina y nunca se subió al repo).
--
-- La bitácora se llenaba de ruido con tablas de catálogo y de alto movimiento
-- operativo (cada edición de ficha, cita o turno de numeración). Se quita el
-- trigger de auditoría de esas tablas; se conserva en todo lo que mueve dinero,
-- inventario, personal, permisos, configuración y en el historial clínico.
-- Las consultas a expedientes siguen registrándose con registrar_acceso_expediente.
-- ============================================================================

drop trigger if exists trg_sedes_auditoria on public.sedes;
drop trigger if exists trg_aseguradoras_auditoria on public.aseguradoras;
drop trigger if exists trg_servicios_auditoria on public.servicios;
drop trigger if exists trg_coberturas_auditoria on public.coberturas;
drop trigger if exists trg_pacientes_auditoria on public.pacientes;
drop trigger if exists trg_citas_auditoria on public.citas;
drop trigger if exists trg_inventario_items_auditoria on public.inventario_items;
drop trigger if exists trg_proveedores_auditoria on public.proveedores;
drop trigger if exists trg_secuencias_ncf_auditoria on public.secuencias_ncf;
drop trigger if exists trg_resumenes_diarios_auditoria on public.resumenes_diarios;
