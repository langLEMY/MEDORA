-- ============================================================================
-- MEDORA · Semilla de la base local y del CI (supabase start / db reset).
-- Todo es FICTICIO: «Hospital Demo» y su copia de pruebas, con lo mínimo que
-- piden las baterías (consulta de RD$950, una ARS con tarifa y fondo interno,
-- reglas de comisión y parámetros de TSS/ISR). Nunca copiar datos de producción
-- aquí: ni pacientes ni la configuración de un hospital real.
-- Los parámetros de nómina son los valores normativos públicos (TSS e ISR de la DGII).
-- ============================================================================

insert into public.sistemas (id, nombre, slug, razon_social, rnc, cobro_antes_consulta, fondo_caja, color_marca, es_pruebas, pruebas_de) values
  ('d0000000-0000-4000-8000-000000000001', 'Hospital Demo', 'demo', 'Hospital Demo, SRL', '101000001', true, 2000, '#0E7490', false, null),
  ('d0000000-0000-4000-8000-000000000002', 'Hospital Demo · Pruebas', 'demo-pruebas', 'Hospital Demo, SRL', '101000001', true, 2000, '#B91C1C', true, 'd0000000-0000-4000-8000-000000000001')
on conflict do nothing;

insert into public.sedes (sistema_id, nombre, tipo)
select s, 'Sede principal', 'consultorio' from unnest(array['d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002']::uuid[]) s
where not exists (select 1 from public.sedes where sistema_id = s);

insert into public.servicios (id, sistema_id, nombre, categoria, precio, duracion_min, especialidad) values
  ('d0000000-0000-4000-8000-000000000101', 'd0000000-0000-4000-8000-000000000002', 'Consulta general', 'consulta', 950, 30, null),
  ('d0000000-0000-4000-8000-000000000102', 'd0000000-0000-4000-8000-000000000002', 'Consulta odontológica', 'consulta', 1200, 30, 'Odontología'),
  ('d0000000-0000-4000-8000-000000000103', 'd0000000-0000-4000-8000-000000000002', 'Hemograma', 'laboratorio', 450, 15, null),
  ('d0000000-0000-4000-8000-000000000104', 'd0000000-0000-4000-8000-000000000002', 'Curación', 'procedimiento', 800, 20, null),
  ('d0000000-0000-4000-8000-000000000105', 'd0000000-0000-4000-8000-000000000002', 'Sonografía abdominal', 'estudio', 2500, 30, null)
on conflict do nothing;

insert into public.aseguradoras (id, sistema_id, nombre) values
  ('d0000000-0000-4000-8000-000000000201', 'd0000000-0000-4000-8000-000000000002', 'ARS Demo'),
  ('d0000000-0000-4000-8000-000000000202', 'd0000000-0000-4000-8000-000000000002', 'ARS Demo Plus')
on conflict do nothing;

-- Tarifa con fondo interno: el fondo es PARTE de lo que cubre la ARS (ver CLAUDE.md).
insert into public.coberturas (sistema_id, aseguradora_id, servicio_id, precio, monto_cubierto, monto_fondo) values
  ('d0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000201', 'd0000000-0000-4000-8000-000000000101', 950, 750, 150),
  ('d0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000202', 'd0000000-0000-4000-8000-000000000101', 950, 600, 0),
  ('d0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000201', 'd0000000-0000-4000-8000-000000000103', 450, 300, 0)
on conflict do nothing;

insert into public.reglas_comision (sistema_id, nombre, rol, especialidad, base, tipo, valor, retencion, aplica_a) values
  ('d0000000-0000-4000-8000-000000000002', 'Médicos · 50% de lo facturado (−10% ISR)', 'medico', null, 'bruto', 'porcentaje', 50, 10, 'profesional'),
  ('d0000000-0000-4000-8000-000000000002', 'Odontología · 45% de lo facturado (−10% ISR)', null, 'Odontología', 'bruto', 'porcentaje', 45, 10, 'profesional')
on conflict do nothing;

-- TSS (AFP 2.87/7.10, SFS 3.04/7.09, SRL 1.10, INFOTEP 1) y escala anual de ISR vigente.
insert into public.parametros_nomina (sistema_id, afp_empleado, sfs_empleado, afp_empleador, sfs_empleador, srl_empleador, infotep, escala_isr)
select s, 2.87, 3.04, 7.1, 7.09, 1.1, 1.0,
  '[{"fijo": 0, "tasa": 0, "hasta": 416220.0, "exceso_de": 0},
    {"fijo": 0, "tasa": 15, "hasta": 624329.0, "exceso_de": 416220.01},
    {"fijo": 31216.0, "tasa": 20, "hasta": 867123.0, "exceso_de": 624329.01},
    {"fijo": 79776.0, "tasa": 25, "hasta": null, "exceso_de": 867123.01}]'::jsonb
from unnest(array['d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002']::uuid[]) s
on conflict (sistema_id) do update set afp_empleado = excluded.afp_empleado, sfs_empleado = excluded.sfs_empleado,
  afp_empleador = excluded.afp_empleador, sfs_empleador = excluded.sfs_empleador, srl_empleador = excluded.srl_empleador,
  infotep = excluded.infotep, escala_isr = excluded.escala_isr;
