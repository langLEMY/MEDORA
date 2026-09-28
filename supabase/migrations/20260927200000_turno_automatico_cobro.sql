-- ============================================================================
-- MEDORA · Corrección: el primer cobro no encontraba el turno que acababa de abrir
--
-- 20260927180000 dejó `select ... from turnos_caja where id = privado.turno_o_abrir(..)`:
-- la función inserta el turno durante el mismo SELECT, cuya instantánea ya estaba
-- tomada, así que la fila nueva no se veía y el cobro fallaba con "Abre un turno de
-- caja antes de registrar cobros." Ahora se abre primero y se busca después.
-- ============================================================================
do $$
declare
  v_def text := pg_get_functiondef('public.registrar_cobro'::regproc);
  v_nueva text;
begin
  v_nueva := replace(v_def,
    'select * into v_turno from public.turnos_caja where id = privado.turno_o_abrir(p_sistema);',
    E'perform privado.turno_o_abrir(p_sistema);\n  select * into v_turno from public.turnos_caja where id = privado.turno_abierto(p_sistema);');
  if v_nueva = v_def then
    raise exception 'registrar_cobro no tiene la búsqueda de turno esperada.';
  end if;
  execute v_nueva;
end;
$$;
