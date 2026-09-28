-- ============================================================================
-- MEDORA · Parámetros de TSS e ISR solo para el superadmin
--
-- Las tasas de la TSS (AFP, SFS, riesgos laborales, INFOTEP), los topes y la
-- escala anual de ISR son normativa dominicana: las mantiene el soporte de
-- MEDORA, no cada hospital. El admin/contabilidad/gerencia siguen leyéndolos
-- (la nómina los usa), pero ya no pueden cambiarlos ni importarlos.
-- ============================================================================

drop policy parametros_select on public.parametros_nomina;
create policy parametros_select on public.parametros_nomina for select to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{admin,contabilidad,gerencia}'))
         or (select privado.es_superadmin()));

drop policy parametros_update on public.parametros_nomina;
create policy parametros_update on public.parametros_nomina for update to authenticated
  using ((select privado.es_superadmin()))
  with check ((select privado.es_superadmin()));

-- Importaciones de Excel de esos parámetros: misma regla.
do $$
declare
  v_fn text;
  v_def text;
  v_nueva text;
begin
  foreach v_fn in array array['public.importar_parametros_nomina(uuid, jsonb)', 'public.importar_escala_isr(uuid, jsonb)'] loop
    v_def := pg_get_functiondef(v_fn::regprocedure);
    -- Reemplazos de una sola línea (independientes del fin de línea del archivo).
    v_nueva := replace(replace(v_def,
      $x$if not privado.tiene_rol(p_sistema, '{admin,contabilidad,gerencia}', 'nomina') then$x$,
      $x$if not privado.es_superadmin() then$x$),
      $x$'No tienes permiso para configurar la nómina.'$x$,
      $x$'Los parámetros de TSS e ISR solo los cambia el soporte de MEDORA.'$x$);
    if v_nueva = v_def then
      raise exception 'No se encontró la validación de permisos en %', v_fn;
    end if;
    execute v_nueva;
  end loop;
end;
$$;
