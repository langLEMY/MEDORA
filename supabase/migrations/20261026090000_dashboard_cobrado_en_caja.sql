-- Dashboard: "Ingresos de hoy" mostraba el valor de los servicios (subtotal − descuento), que incluye
-- la parte que cubre la ARS y el crédito al paciente. FUNBIDE el 26/10/2026: 15,900 en servicios,
-- 8,800 en caja, 7,100 por cobrar a la ARS. La tarjeta pasa a mostrar lo cobrado.
--
--   * cobrado_*  = total − monto_credito de los cobros no anulados (lo que entró en caja). Antes salía de
--                  movimientos_financieros, que también mueve gastos y pagos de ARS.
--   * ars_*      = cobertura_seguro (por cobrar a la ARS; incluye el fondo interno).
--   * credito_*  = monto_credito (por cobrar al paciente).
--   * ingresos_* = valor de los servicios, igual que antes (los clientes viejos lo siguen leyendo).
--   * serie[].cobrado nuevo; serie[].ingresos se conserva.
create or replace function public.resumen_dashboard(p_sistema uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_tz         text;
  v_hoy        date;
  v_hoy_ini    timestamptz;
  v_hoy_fin    timestamptz;
  v_mes_ini    timestamptz;
  v_serie_ini  timestamptz;
  v_hoy_cob    jsonb;
  v_mes_cob    jsonb;
  v_resultado  jsonb;
begin
  select zona_horaria into v_tz from public.sistemas where id = p_sistema;
  if v_tz is null then
    return null;
  end if;

  v_hoy       := (now() at time zone v_tz)::date;
  v_hoy_ini   := v_hoy::timestamp at time zone v_tz;
  v_hoy_fin   := (v_hoy + 1)::timestamp at time zone v_tz;
  v_mes_ini   := date_trunc('month', v_hoy)::timestamp at time zone v_tz;
  v_serie_ini := (v_hoy - 13)::timestamp at time zone v_tz;

  -- Una pasada por período sobre los cobros vigentes.
  select jsonb_build_object(
           'servicios', coalesce(sum(c.subtotal - coalesce(c.descuento, 0)) filter (where c.creado_en >= v_hoy_ini), 0),
           'cobrado',   coalesce(sum(c.total - c.monto_credito)             filter (where c.creado_en >= v_hoy_ini), 0),
           'ars',       coalesce(sum(c.cobertura_seguro)                    filter (where c.creado_en >= v_hoy_ini), 0),
           'credito',   coalesce(sum(c.monto_credito)                       filter (where c.creado_en >= v_hoy_ini), 0)),
         jsonb_build_object(
           'servicios', coalesce(sum(c.subtotal - coalesce(c.descuento, 0)), 0),
           'cobrado',   coalesce(sum(c.total - c.monto_credito), 0),
           'ars',       coalesce(sum(c.cobertura_seguro), 0),
           'credito',   coalesce(sum(c.monto_credito), 0))
    into v_hoy_cob, v_mes_cob
    from public.cobros c
   where c.sistema_id = p_sistema
     and c.creado_en >= v_mes_ini and c.creado_en < v_hoy_fin
     and not exists (select 1 from public.anulaciones_cobro a where a.cobro_id = c.id);

  select jsonb_build_object(
    'hoy', v_hoy,
    'pacientes_total', (select count(*) from public.pacientes where sistema_id = p_sistema and eliminado_en is null),
    'pacientes_mes', (select count(*) from public.pacientes where sistema_id = p_sistema and creado_en >= v_mes_ini),
    'citas_hoy', (select count(*) from public.citas where sistema_id = p_sistema
                   and inicio >= v_hoy_ini and inicio < v_hoy_fin and estado <> 'cancelada'),
    'citas_por_estado', (select coalesce(jsonb_object_agg(estado, n), '{}'::jsonb) from (
                          select estado, count(*) n from public.citas
                           where sistema_id = p_sistema and inicio >= v_hoy_ini and inicio < v_hoy_fin
                           group by estado) x),
    'ingresos_hoy', v_hoy_cob -> 'servicios',
    'ingresos_mes', v_mes_cob -> 'servicios',
    'cobrado_hoy',  v_hoy_cob -> 'cobrado',
    'cobrado_mes',  v_mes_cob -> 'cobrado',
    'ars_hoy',      v_hoy_cob -> 'ars',
    'ars_mes',      v_mes_cob -> 'ars',
    'credito_hoy',  v_hoy_cob -> 'credito',
    'credito_mes',  v_mes_cob -> 'credito',
    'stock_bajo', (select count(*) from public.inventario_items
                    where sistema_id = p_sistema and activo and stock_actual <= stock_minimo),
    'serie', (select coalesce(jsonb_agg(jsonb_build_object(
                       'fecha', d.dia::date,
                       'citas', coalesce(c.n, 0),
                       'ingresos', coalesce(i.servicios, 0),
                       'cobrado', coalesce(i.cobrado, 0)) order by d.dia), '[]'::jsonb)
                from generate_series(v_hoy - 13, v_hoy, interval '1 day') as d(dia)
                left join (
                  select (inicio at time zone v_tz)::date dia, count(*) n from public.citas
                   where sistema_id = p_sistema and inicio >= v_serie_ini and inicio < v_hoy_fin and estado <> 'cancelada'
                   group by 1) c on c.dia = d.dia::date
                left join (
                  select (k.creado_en at time zone v_tz)::date dia,
                         sum(k.subtotal - coalesce(k.descuento, 0)) servicios,
                         sum(k.total - k.monto_credito) cobrado
                    from public.cobros k
                   where k.sistema_id = p_sistema and k.creado_en >= v_serie_ini and k.creado_en < v_hoy_fin
                     and not exists (select 1 from public.anulaciones_cobro a where a.cobro_id = k.id)
                   group by 1) i on i.dia = d.dia::date)
  ) into v_resultado;

  return v_resultado;
end;
$$;
