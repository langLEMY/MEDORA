-- ============================================================================
-- MEDORA · Recetas y documentos clínicos imprimibles
--
-- El médico genera recetas (con lista de medicamentos) y documentos formales
-- (certificado médico, referimiento, orden de estudios) que el paciente se
-- lleva impresos con el membrete del hospital y el nombre, especialidad y
-- exequátur del médico. Todo es historia clínica (append-only, ya auditada):
-- la receta guarda sus renglones en `datos.items` y cada documento guarda una
-- foto del médico que lo firmó en `datos.medico` (para que al reimprimirlo diga
-- lo mismo aunque el exequátur cambie después).
--
-- Los medicamentos, órdenes y certificados no llevan datos clínicos al log de
-- auditoría (igual que el resto de la historia): el trigger ya usa 'sin_datos'.
-- ============================================================================

alter type public.tipo_entrada_clinica add value if not exists 'certificado';
alter type public.tipo_entrada_clinica add value if not exists 'referimiento';
alter type public.tipo_entrada_clinica add value if not exists 'orden';
