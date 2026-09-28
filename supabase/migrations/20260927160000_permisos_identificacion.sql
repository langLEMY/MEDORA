-- ============================================================================
-- MEDORA · Corrección: permiso de ejecución de los helpers de identificación
--
-- privado.tg_identificacion_rd() (trigger, no security definer) llama a
-- cedula_formateada() y rnc_normalizado(), pero la migración republica_dominicana
-- les revocó EXECUTE sin concederlo a authenticated: guardar un paciente con
-- cédula fallaba con "permission denied for function cedula_formateada".
-- Son funciones puras (solo formatean texto): se conceden a authenticated.
-- ============================================================================
grant execute on function privado.cedula_formateada(text) to authenticated, service_role;
grant execute on function privado.rnc_normalizado(text) to authenticated, service_role;
