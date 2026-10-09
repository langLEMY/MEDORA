-- Detalle de cada número de Finanzas: las líneas contables que lo forman, con el paciente,
-- la ARS o el médico detrás de cada una. Misma regla que resumen_financiero, así que el
-- detalle siempre suma lo mismo que la tarjeta.
--   p_vista 'ingresos' → cuentas de ingreso del período
--   p_vista 'gastos'   → cuentas de gasto y costo del período
--   p_vista 'saldo'    → todo lo registrado hasta p_hasta en las cuentas pedidas (lo que hay, nos deben, debemos)
--   p_cuentas          → códigos o claves (cuentas_predeterminadas) para filtrar; obligatorio en 'saldo'

create or replace function public.detalle_financiero(p_sistema uuid, p_vista text, p_desde date, p_hasta date, p_cuentas text[] default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_codigos text[];
  v_cxc_ars text;
  v_res jsonb;
begin
  if not privado.tiene_rol(p_sistema, '{admin,gerencia,contabilidad,auditor}', 'reportes') then
    raise exception 'No tienes permiso para ver las finanzas.' using errcode = '42501';
  end if;
  if p_vista not in ('ingresos', 'gastos', 'saldo') then
    raise exception 'Vista no válida.' using errcode = 'P0001';
  end if;
  if p_hasta is null or (p_vista <> 'saldo' and (p_desde is null or p_desde > p_hasta or p_hasta - p_desde > 3700)) then
    raise exception 'El período no es válido.' using errcode = 'P0001';
  end if;
  if p_cuentas is not null then
    select array_agg(distinct x) into v_codigos from (
      select c.codigo x from public.cuentas_contables c where c.sistema_id = p_sistema and c.codigo = any (p_cuentas)
      union
      select k.cuenta_codigo from public.cuentas_predeterminadas k where k.sistema_id = p_sistema and k.clave = any (p_cuentas)
    ) y;
  end if;
  if p_vista = 'saldo' and coalesce(cardinality(v_codigos), 0) = 0 then
    raise exception 'Indica las cuentas del saldo.' using errcode = 'P0001';
  end if;
  select k.cuenta_codigo into v_cxc_ars from public.cuentas_predeterminadas k where k.sistema_id = p_sistema and k.clave = 'cxc_aseguradoras';

  with lineas as (
    select a.fecha, a.numero, a.concepto, a.origen, a.creado_en, c.codigo, c.nombre as cuenta_nombre,
           case when c.tipo in ('activo', 'gasto', 'costo') then l.debe - l.haber else l.haber - l.debe end as monto,
           -- El cobro detrás de la línea: directo, por su reverso (anulación) o por la comisión.
           coalesce(k.id, kr.id, kc.id) as cobro_id,
           cm.beneficiario_id,
           l.cuenta_codigo
      from public.asiento_lineas l
      join public.asientos a on a.id = l.asiento_id
      join public.cuentas_contables c on c.sistema_id = l.sistema_id and c.codigo = l.cuenta_codigo
      left join public.asientos ao on a.origen = 'reverso' and ao.id = a.origen_id
      left join public.cobros k on a.origen = 'cobro' and k.id = a.origen_id
      left join public.cobros kr on ao.origen = 'cobro' and kr.id = ao.origen_id
      left join public.comisiones cm on a.origen = 'comision' and cm.id = a.origen_id
      left join public.cobros kc on kc.id = cm.cobro_id
     where l.sistema_id = p_sistema
       and (v_codigos is null or l.cuenta_codigo = any (v_codigos))
       and case p_vista
             when 'ingresos' then c.tipo = 'ingreso' and a.fecha between p_desde and p_hasta
             when 'gastos' then c.tipo in ('gasto', 'costo') and a.fecha between p_desde and p_hasta
             else a.fecha <= p_hasta
           end
  ),
  con_nombres as (
    select x.*,
           p.nombres || ' ' || p.apellidos as paciente,
           coalesce(pm.nombre_completo, pc.nombre_completo) as medico,
           ar.nombre as aseguradora
      from lineas x
      left join public.cobros k on k.id = x.cobro_id
      left join public.pacientes p on p.id = k.paciente_id
      left join public.aseguradoras ar on ar.id = k.aseguradora_id
      left join public.perfiles pc on pc.id = k.profesional_id
      left join public.perfiles pm on pm.id = x.beneficiario_id
     where x.monto <> 0
  )
  select jsonb_build_object(
    'total', (select coalesce(sum(monto), 0) from con_nombres),
    'lineas', (select coalesce(jsonb_agg(jsonb_build_object(
                  'fecha', fecha, 'numero', numero, 'concepto', concepto, 'origen', origen,
                  'cuenta', codigo, 'cuenta_nombre', cuenta_nombre, 'monto', monto,
                  'paciente', paciente, 'medico', medico, 'aseguradora', aseguradora,
                  -- A quién corresponde: la ARS en lo que deben las ARS, el médico en sus comisiones; si no, el paciente.
                  'tercero', case when cuenta_codigo = v_cxc_ars then aseguradora
                                  when origen = 'comision' then medico
                                  else paciente end)
                  order by fecha desc, creado_en desc), '[]')
                 from (select * from con_nombres order by fecha desc, creado_en desc limit 3000) z)
  ) into v_res;
  return v_res;
end;
$$;

revoke all on function public.detalle_financiero(uuid, text, date, date, text[]) from public, anon;
grant execute on function public.detalle_financiero(uuid, text, date, date, text[]) to authenticated;
