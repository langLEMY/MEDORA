-- ============================================================================
-- MEDORA · El vendedor/comisionista de un cobro es quien lo registra
--
-- Antes lo enviaba el cliente (p_vendedor) y se podía elegir a cualquiera, lo que
-- permitía atribuir comisiones a otra persona. Ahora siempre es auth.uid(); el
-- parámetro se conserva por compatibilidad con clientes viejos, pero se ignora.
-- ============================================================================
do $$
declare
  v_def text := pg_get_functiondef('public.registrar_cobro'::regproc);
  v_nueva text;
begin
  v_nueva := replace(v_def,
    'p_profesional, p_vendedor, v_credito, v_fondo);',
    'p_profesional, (select auth.uid()), v_credito, v_fondo);');
  if v_nueva = v_def then
    raise exception 'registrar_cobro no tiene el insert esperado.';
  end if;
  execute v_nueva;
end;
$$;
