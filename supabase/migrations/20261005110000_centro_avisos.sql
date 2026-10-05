-- ============================================================================
-- MEDORA . Centro de avisos (campana de la barra superior)
--
-- mis_avisos(p_sistema) calcula en vivo lo que requiere atención y devuelve solo
-- lo que el rol (y los permisos por módulo) de quien consulta le permite ver:
--   · e-CF rechazados o con error / pendientes de enviar hace más de 1 h
--   · comprobantes fiscales por agotarse o por vencer
--   · turnos de caja abiertos desde un día anterior
--   · resultados de laboratorio sin asignar
--   · productos en o por debajo del mínimo
-- Solo cuenta (no devuelve datos de pacientes). No guarda nada: "visto" vive en la app.
-- ============================================================================

create or replace function public.mis_avisos(p_sistema uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_avisos jsonb := '[]'::jsonb;
  v_hoy timestamptz := (date_trunc('day', now() at time zone 'America/Santo_Domingo') at time zone 'America/Santo_Domingo');
  v_n integer;
  v_m integer;
  v_detalle text;
begin
  if p_sistema not in (select privado.mis_sistemas()) then
    return v_avisos;
  end if;

  -- Facturación electrónica ----------------------------------------------------
  if privado.tiene_rol(p_sistema, '{admin,contabilidad,caja,gerencia}', 'caja') then
    select count(*) filter (where estado in ('rechazado', 'error')),
           count(*) filter (where estado = 'pendiente' and creado_en < now() - interval '1 hour')
      into v_n, v_m
      from public.ecf_documentos
     where sistema_id = p_sistema;
    if v_n > 0 then
      v_avisos := v_avisos || jsonb_build_object('clave', 'ecf_rechazados', 'nivel', 'peligro', 'cantidad', v_n,
        'titulo', case when v_n = 1 then '1 factura electrónica rechazada' else v_n || ' facturas electrónicas rechazadas' end,
        'detalle', 'La DGII no las aceptó o hubo un error al enviarlas. Revísalas en Comprobantes fiscales.',
        'enlace', '/contabilidad?vista=ncf');
    end if;
    if v_m > 0 then
      v_avisos := v_avisos || jsonb_build_object('clave', 'ecf_pendientes', 'nivel', 'aviso', 'cantidad', v_m,
        'titulo', case when v_m = 1 then '1 factura electrónica sin enviar' else v_m || ' facturas electrónicas sin enviar' end,
        'detalle', 'Llevan más de una hora pendientes de envío a la DGII.',
        'enlace', '/contabilidad?vista=ncf');
    end if;

    -- Comprobantes fiscales por agotarse (≤ 10 % del rango o ≤ 50) o por vencer (≤ 30 días)
    select count(*),
           string_agg(s.tipo || ': ' ||
             case when s.vence_en is not null and s.vence_en <= (v_hoy::date + 30) and (s.hasta - s.siguiente + 1) > greatest(50, (s.hasta - s.desde + 1) / 10)
                  then 'vence el ' || to_char(s.vence_en, 'DD/MM/YYYY')
                  else greatest(s.hasta - s.siguiente + 1, 0) || ' disponibles' end, ' · ' order by s.tipo)
      into v_n, v_detalle
      from public.secuencias_ncf s
     where s.sistema_id = p_sistema and s.activo
       and ((s.hasta - s.siguiente + 1) <= greatest(50, (s.hasta - s.desde + 1) / 10)
            or (s.vence_en is not null and s.vence_en <= (v_hoy::date + 30)));
    if v_n > 0 then
      v_avisos := v_avisos || jsonb_build_object('clave', 'ncf_agotandose', 'nivel', 'aviso', 'cantidad', v_n,
        'titulo', 'Comprobantes fiscales por agotarse',
        'detalle', v_detalle || '. Solicita más a la DGII.',
        'enlace', '/contabilidad?vista=ncf');
    end if;
  end if;

  -- Caja: turno abierto desde ayer ----------------------------------------------
  select count(*) into v_n
    from public.turnos_caja
   where sistema_id = p_sistema and estado = 'abierto' and cajero_id = (select auth.uid()) and abierto_en < v_hoy;
  if v_n > 0 then
    v_avisos := v_avisos || jsonb_build_object('clave', 'turno_propio', 'nivel', 'aviso', 'cantidad', v_n,
      'titulo', 'Tu turno de caja sigue abierto desde ayer',
      'detalle', 'Ciérralo con el arqueo antes de seguir cobrando.',
      'enlace', '/caja');
  end if;
  if privado.tiene_rol(p_sistema, '{admin,gerencia,contabilidad}', 'caja') then
    select count(*) into v_n
      from public.turnos_caja
     where sistema_id = p_sistema and estado = 'abierto' and abierto_en < v_hoy and cajero_id <> (select auth.uid());
    if v_n > 0 then
      v_avisos := v_avisos || jsonb_build_object('clave', 'turnos_abiertos', 'nivel', 'aviso', 'cantidad', v_n,
        'titulo', case when v_n = 1 then '1 turno de caja sin cerrar' else v_n || ' turnos de caja sin cerrar' end,
        'detalle', 'Hay cajeros con el turno abierto desde un día anterior.',
        'enlace', '/caja');
    end if;
  end if;

  -- Laboratorio: resultados sin asignar -------------------------------------------
  if privado.tiene_rol(p_sistema, '{medico,enfermeria}', 'historial') and p_sistema in (select privado.sistemas_vista_completa()) then
    select count(*) into v_n from public.resultados_laboratorio where sistema_id = p_sistema and estado = 'recibido';
    if v_n > 0 then
      v_avisos := v_avisos || jsonb_build_object('clave', 'laboratorio', 'nivel', 'info', 'cantidad', v_n,
        'titulo', case when v_n = 1 then '1 resultado de laboratorio sin asignar' else v_n || ' resultados de laboratorio sin asignar' end,
        'detalle', 'Llegaron sin coincidir con ningún paciente. Asígnalos desde Pacientes.',
        'enlace', '/pacientes');
    end if;
  end if;

  -- Inventario bajo mínimo -------------------------------------------------------------
  if privado.tiene_rol(p_sistema, '{admin,farmacia,enfermeria,gerencia}', 'inventario') then
    select count(*), string_agg(nombre, ', ' order by stock_actual - stock_minimo) filter (where true)
      into v_n, v_detalle
      from (select nombre, stock_actual, stock_minimo from public.inventario_items
             where sistema_id = p_sistema and activo and stock_minimo > 0 and stock_actual <= stock_minimo
             order by stock_actual - stock_minimo limit 50) b;
    if v_n > 0 then
      v_avisos := v_avisos || jsonb_build_object('clave', 'stock_bajo', 'nivel', 'aviso', 'cantidad', v_n,
        'titulo', case when v_n = 1 then '1 producto bajo el mínimo' else v_n || ' productos bajo el mínimo' end,
        'detalle', left(v_detalle, 160) || case when length(v_detalle) > 160 then '…' else '' end,
        'enlace', '/inventario');
    end if;
  end if;

  return v_avisos;
end;
$$;
revoke all on function public.mis_avisos(uuid) from public, anon;
grant execute on function public.mis_avisos(uuid) to authenticated;
