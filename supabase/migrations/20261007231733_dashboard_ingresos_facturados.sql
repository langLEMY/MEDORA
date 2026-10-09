-- Aplicada en producción el 7/10/2026 desde otra máquina sin subirla al repo; texto recuperado
-- de supabase_migrations.schema_migrations el 9/10/2026.
create or replace function public.resumen_dashboard(p_sistema uuid)
 returns jsonb
 language plpgsql
 stable
 set search_path to ''
as $function$
declare
  v_tz         text;
  v_hoy        date;
  v_hoy_ini    timestamptz;
  v_hoy_fin    timestamptz;
  v_mes_ini    timestamptz;
  v_serie_ini  timestamptz;
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
    'ingresos_hoy', (select coalesce(sum(c.subtotal - coalesce(c.descuento, 0)), 0)
                       from public.cobros c
                      where c.sistema_id = p_sistema and c.creado_en >= v_hoy_ini and c.creado_en < v_hoy_fin
                        and not exists (select 1 from public.anulaciones_cobro a where a.cobro_id = c.id)),
    'ingresos_mes', (select coalesce(sum(c.subtotal - coalesce(c.descuento, 0)), 0)
                       from public.cobros c
                      where c.sistema_id = p_sistema and c.creado_en >= v_mes_ini
                        and not exists (select 1 from public.anulaciones_cobro a where a.cobro_id = c.id)),
    'cobrado_hoy', (select coalesce(sum(case when tipo = 'ingreso' then monto else -monto end), 0)
                      from public.movimientos_financieros
                     where sistema_id = p_sistema and creado_en >= v_hoy_ini and creado_en < v_hoy_fin),
    'cobrado_mes', (select coalesce(sum(case when tipo = 'ingreso' then monto else -monto end), 0)
                      from public.movimientos_financieros
                     where sistema_id = p_sistema and creado_en >= v_mes_ini),
    'stock_bajo', (select count(*) from public.inventario_items
                    where sistema_id = p_sistema and activo and stock_actual <= stock_minimo),
    'serie', (select coalesce(jsonb_agg(jsonb_build_object('fecha', d.dia::date, 'citas', coalesce(c.n, 0), 'ingresos', coalesce(i.total, 0)) order by d.dia), '[]'::jsonb)
                from generate_series(v_hoy - 13, v_hoy, interval '1 day') as d(dia)
                left join (
                  select (inicio at time zone v_tz)::date dia, count(*) n from public.citas
                   where sistema_id = p_sistema and inicio >= v_serie_ini and inicio < v_hoy_fin and estado <> 'cancelada'
                   group by 1) c on c.dia = d.dia::date
                left join (
                  select (k.creado_en at time zone v_tz)::date dia,
                         sum(k.subtotal - coalesce(k.descuento, 0)) total
                    from public.cobros k
                   where k.sistema_id = p_sistema and k.creado_en >= v_serie_ini
                     and not exists (select 1 from public.anulaciones_cobro a where a.cobro_id = k.id)
                   group by 1) i on i.dia = d.dia::date)
  ) into v_resultado;

  return v_resultado;
end;
$function$;
