-- 1. Farmacia cubierta por la ARS. Las entregas de medicamentos tienen monto variable (SENASA 150, 190, 90…)
--    y la ARS las paga completas: un concepto libre de categoría farmacia con «cubre_ars» queda cubierto
--    por la aseguradora del cobro. Antes un concepto libre nunca llevaba cobertura y la farmacia no se
--    registraba en MEDORA (solo en el Excel).
do $$
declare
  v_def text := pg_get_functiondef('public.registrar_cobro(uuid, uuid, jsonb, jsonb, uuid, text, numeric, uuid, text, text, text, text, text, uuid, uuid, text)'::regprocedure);
  v_ancla text := $a$    v_linea := round(v_precio * v_cantidad, 2);$a$;
begin
  if position('cubre_ars' in v_def) > 0 then
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'registrar_cobro cambió: no encuentro el cálculo de la línea';
  end if;
  execute replace(v_def, v_ancla, $b$    -- Farmacia de la ARS: monto libre, cubierto completo por la aseguradora del cobro.
    if p_aseguradora is not null and v_servicio.id is null and v_categoria = 'farmacia'
       and coalesce((v_item ->> 'cubre_ars')::boolean, false) then
      v_cubierto := round(v_precio * v_cantidad, 2);
    end if;
$b$ || v_ancla);
end $$;

-- 2. Cuadre del día con el mismo formato que el Excel de FUNBIDE: por médico, columnas por ARS (sin el
--    fondo interno, que va aparte), efectivo, tarjeta, transferencia y la comisión con su retención.
create or replace function public.cuadre_dia(p_sistema uuid, p_fecha date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_res jsonb;
begin
  if not privado.tiene_rol(p_sistema, '{admin,caja,gerencia,contabilidad,auditor}') then
    raise exception 'No tienes permiso para ver el cuadre de caja.' using errcode = '42501';
  end if;
  if p_fecha is null then
    raise exception 'Indica el día.' using errcode = 'P0001';
  end if;

  with c as (
    select k.*
      from public.cobros k
     where k.sistema_id = p_sistema
       and (k.creado_en at time zone 'America/Santo_Domingo')::date = p_fecha
       and not exists (select 1 from public.anulaciones_cobro x where x.cobro_id = k.id)
  ), filas as (
    select c.id, c.numero, c.creado_en, c.profesional_id,
           pf.nombre_completo as medico,
           coalesce(nullif(trim(m.especialidad), ''), '') as especialidad,
           case
             when c.profesional_id is not null then pf.nombre_completo
             when not exists (select 1 from public.cobro_detalles d where d.cobro_id = c.id and d.categoria not in ('farmacia', 'otro')) then 'FARMACIA'
             else 'SIN MÉDICO'
           end as grupo,
           p.nombres || ' ' || p.apellidos as paciente,
           coalesce(p.documento, p.numero_afiliado) as documento,
           (select string_agg(d.descripcion, ' + ' order by d.descripcion) from public.cobro_detalles d where d.cobro_id = c.id) as procedimiento,
           c.numero_autorizacion as autorizacion,
           a.nombre as aseguradora,
           case upper(split_part(coalesce(a.nombre, ''), ' ', 1)) when 'SENASA' then 'SENASA' when 'RENACER' then 'RENACER' when 'APS' then 'APS'
                when '' then null else 'OTRA' end as ars_grupo,
           -- Fondo interno: el del cobro o el corregido después con un asiento de ajuste.
           coalesce((select sum(l.debe) from public.asientos s join public.asiento_lineas l on l.asiento_id = s.id
                      where s.sistema_id = c.sistema_id and s.origen = 'ajuste' and s.origen_id = c.id), c.monto_fondo) as fondo,
           c.cobertura_seguro, c.subtotal, c.descuento, c.monto_credito as credito,
           coalesce((select sum(g.monto) from public.cobro_pagos g where g.cobro_id = c.id and g.metodo = 'efectivo'), 0) as efectivo,
           coalesce((select sum(g.monto) from public.cobro_pagos g where g.cobro_id = c.id and g.metodo = 'tarjeta'), 0) as tarjeta,
           coalesce((select sum(g.monto) from public.cobro_pagos g where g.cobro_id = c.id and g.metodo = 'transferencia'), 0) as transferencia,
           coalesce((select sum(g.monto) from public.cobro_pagos g where g.cobro_id = c.id and g.metodo not in ('efectivo', 'tarjeta', 'transferencia')), 0) as otros,
           coalesce((select sum(k.monto) from public.comisiones k where k.cobro_id = c.id and k.beneficiario_id = c.profesional_id), 0) as comision,
           coalesce((select sum(k.retencion) from public.comisiones k where k.cobro_id = c.id and k.beneficiario_id = c.profesional_id), 0) as retencion
      from c
      left join public.perfiles pf on pf.id = c.profesional_id
      left join public.membresias m on m.sistema_id = c.sistema_id and m.usuario_id = c.profesional_id
      left join public.pacientes p on p.id = c.paciente_id
      left join public.aseguradoras a on a.id = c.aseguradora_id
  )
  select jsonb_build_object(
    'fecha', p_fecha,
    'lineas', coalesce((select jsonb_agg(jsonb_build_object(
        'numero', numero, 'hora', to_char(creado_en at time zone 'America/Santo_Domingo', 'HH24:MI'),
        'grupo', grupo, 'especialidad', especialidad, 'paciente', paciente, 'documento', documento,
        'procedimiento', procedimiento, 'autorizacion', autorizacion, 'aseguradora', aseguradora, 'ars_grupo', ars_grupo,
        'ars', cobertura_seguro - fondo, 'fondo', fondo,
        'efectivo', efectivo, 'tarjeta', tarjeta, 'transferencia', transferencia, 'otros', otros, 'credito', credito,
        'descuento', descuento,
        -- Total como en el Excel: lo que corresponde al servicio (sin el fondo interno de la ARS).
        'total', subtotal - descuento - fondo,
        'comision', comision, 'retencion', retencion) order by grupo, creado_en) from filas), '[]'::jsonb),
    'egresos', coalesce((select jsonb_agg(jsonb_build_object('concepto', mv.concepto, 'monto', mv.monto, 'metodo', mv.metodo, 'categoria', mv.categoria)
                                          order by mv.creado_en)
                           from public.movimientos_financieros mv
                          where mv.sistema_id = p_sistema and mv.tipo = 'egreso' and mv.categoria not in ('cobro', 'anulacion')
                            and (mv.creado_en at time zone 'America/Santo_Domingo')::date = p_fecha), '[]'::jsonb),
    'turnos', coalesce((select jsonb_agg(jsonb_build_object('cajero', pf.nombre_completo, 'estado', t.estado,
                                         'apertura', t.monto_apertura, 'esperado', t.monto_esperado, 'declarado', t.monto_declarado,
                                         'notas', t.notas_cierre) order by t.abierto_en)
                          from public.turnos_caja t left join public.perfiles pf on pf.id = t.cajero_id
                         where t.sistema_id = p_sistema and (t.abierto_en at time zone 'America/Santo_Domingo')::date = p_fecha), '[]'::jsonb)
  ) into v_res;
  return v_res;
end;
$$;

revoke all on function public.cuadre_dia(uuid, date) from public, anon;
grant execute on function public.cuadre_dia(uuid, date) to authenticated;
