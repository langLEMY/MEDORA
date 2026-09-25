-- ============================================================================
-- MEDORA · 0009 · Nuevos valores de enumeraciones (ERP)
-- Van solos: Postgres no permite usar un valor de enum en la misma transacción
-- en la que se agregó.
-- ============================================================================

-- Roles: gerencia y contabilidad (agenda, reportes, finanzas) y otros
-- profesionales de la salud con agenda propia.
alter type public.rol_sistema add value if not exists 'gerencia';
alter type public.rol_sistema add value if not exists 'contabilidad';
alter type public.rol_sistema add value if not exists 'psicologia';
alter type public.rol_sistema add value if not exists 'nutricion';
alter type public.rol_sistema add value if not exists 'terapia';

-- Historia clínica: anexos y evoluciones especializadas.
alter type public.tipo_entrada_clinica add value if not exists 'nutricion';
alter type public.tipo_entrada_clinica add value if not exists 'anestesia';
alter type public.tipo_entrada_clinica add value if not exists 'psicologia';
alter type public.tipo_entrada_clinica add value if not exists 'anexo';

-- Pagos: aplicar un anticipo del paciente, o dejar saldo a crédito (CxC).
alter type public.metodo_pago add value if not exists 'anticipo';
alter type public.metodo_pago add value if not exists 'credito';
