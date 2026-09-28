-- ============================================================================
-- MEDORA · Turnos: el cobro previo no debe cerrar la cita
--
-- registrar_cobro marcaba la cita como completada si estaba en_espera o
-- en_consulta (pensado para cobrar al final). Con cobro antes de la consulta, el
-- cobro activa el turno (trg_cobros_activa_turno → en_espera) y acto seguido la
-- completaba, sacando al paciente de la cola. Ahora solo completa si ya estaba
-- en consulta, y devuelve el turno para imprimirlo con la factura.
-- ============================================================================
do $$
declare
  v_def text := pg_get_functiondef('public.registrar_cobro'::regproc);
  v_nueva text;
begin
  v_nueva := replace(v_def,
    'and estado in (''en_consulta'', ''en_espera'');',
    'and estado = ''en_consulta'';');
  v_nueva := replace(v_nueva,
    '''pagado'', v_pagado, ''credito'', v_credito);',
    '''pagado'', v_pagado, ''credito'', v_credito,' || E'\n    ' || '''turno'', (select c.turno from public.citas c where c.id = p_cita));');
  if v_nueva = v_def or position('''turno''' in v_nueva) = 0 or position('''en_espera''' in v_nueva) > 0 then
    raise exception 'registrar_cobro no tiene el formato esperado.';
  end if;
  execute v_nueva;
end;
$$;
