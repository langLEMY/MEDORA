-- ============================================================================
-- MEDORA · Precio pactado por aseguradora (tarifario)
-- (Aplicada en remoto el 2026-09-25 como 20260925192552; recuperada de
--  supabase_migrations.schema_migrations para que el repo siga siendo la fuente.)
-- ============================================================================
alter table public.coberturas
  add column precio numeric(12, 2) check (precio is null or precio >= 0);

do $$
declare
  v_def text;
  v_nueva text;
begin
  v_def := pg_get_functiondef('public.registrar_cobro'::regproc);
  v_nueva := replace(v_def,
    '  v_cubierto   numeric;',
    '  v_cubierto   numeric;
  v_ars        public.coberturas;');
  v_nueva := replace(v_nueva,
    '      select round(least(c.monto_cubierto, v_precio) * v_cantidad, 2) into v_cubierto
        from public.coberturas c where c.aseguradora_id = p_aseguradora and c.servicio_id = v_servicio.id;
      v_cubierto := coalesce(v_cubierto, 0);',
    '      select * into v_ars from public.coberturas c
       where c.aseguradora_id = p_aseguradora and c.servicio_id = v_servicio.id;
      if v_ars.id is not null then
        -- Precio pactado con la aseguradora (tarifario), si lo hay.
        v_precio := coalesce(v_ars.precio, v_precio);
        v_cubierto := round(least(v_ars.monto_cubierto, v_precio) * v_cantidad, 2);
      end if;');
  if v_nueva = v_def or position('v_ars.precio' in v_nueva) = 0 then
    raise exception 'registrar_cobro no tiene el bloque de cobertura esperado.';
  end if;
  execute v_nueva;

  v_def := pg_get_functiondef('public.importar_coberturas'::regproc);
  v_nueva := replace(v_def,
    '      insert into public.coberturas (sistema_id, aseguradora_id, servicio_id, monto_cubierto)
      values (p_sistema, p_aseguradora, v_serv, privado.numero(f, ''monto_cubierto''))
      on conflict (aseguradora_id, servicio_id) do update set monto_cubierto = excluded.monto_cubierto;',
    '      -- Monto cubierto explícito, o derivado del total pactado menos la diferencia del paciente.
      insert into public.coberturas (sistema_id, aseguradora_id, servicio_id, monto_cubierto, precio)
      values (p_sistema, p_aseguradora, v_serv,
              coalesce(privado.numero(f, ''monto_cubierto''),
                       privado.numero(f, ''precio'') - privado.numero(f, ''monto_paciente'')),
              privado.numero(f, ''precio''))
      on conflict (aseguradora_id, servicio_id) do update
        set monto_cubierto = excluded.monto_cubierto, precio = excluded.precio;');
  if v_nueva = v_def then
    raise exception 'importar_coberturas no tiene el insert esperado.';
  end if;
  execute v_nueva;
end;
$$;
