-- ============================================================================
-- MEDORA · Catálogo de cuentas y cuentas por concepto: solo el contador
--
-- Cambiar una cuenta o a qué cuenta va cada concepto descuadra la contabilidad
-- si se hace mal. Lo edita el rol contabilidad (o el superadmin, soporte de
-- MEDORA); el admin del hospital los sigue viendo en modo lectura.
-- ============================================================================

drop policy cuentas_insert on public.cuentas_contables;
drop policy cuentas_update on public.cuentas_contables;
create policy cuentas_insert on public.cuentas_contables for insert to authenticated
  with check (sistema_id in (select privado.mis_sistemas_con_rol('{contabilidad}', 'contabilidad')) or (select privado.es_superadmin()));
create policy cuentas_update on public.cuentas_contables for update to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{contabilidad}', 'contabilidad')) or (select privado.es_superadmin()))
  with check (sistema_id in (select privado.mis_sistemas_con_rol('{contabilidad}', 'contabilidad')) or (select privado.es_superadmin()));

drop policy predeterminadas_insert on public.cuentas_predeterminadas;
drop policy predeterminadas_update on public.cuentas_predeterminadas;
create policy predeterminadas_insert on public.cuentas_predeterminadas for insert to authenticated
  with check (sistema_id in (select privado.mis_sistemas_con_rol('{contabilidad}', 'contabilidad')) or (select privado.es_superadmin()));
create policy predeterminadas_update on public.cuentas_predeterminadas for update to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{contabilidad}', 'contabilidad')) or (select privado.es_superadmin()))
  with check (sistema_id in (select privado.mis_sistemas_con_rol('{contabilidad}', 'contabilidad')) or (select privado.es_superadmin()));

-- Importar el catálogo desde Excel: misma regla.
do $$
declare
  v_def text := pg_get_functiondef('public.importar_cuentas_contables(uuid, jsonb)'::regprocedure);
  v_nueva text;
begin
  v_nueva := replace(replace(v_def,
    $x$if not privado.tiene_rol(p_sistema, '{admin,contabilidad}', 'contabilidad') then$x$,
    $x$if not (privado.tiene_rol(p_sistema, '{contabilidad}', 'contabilidad') or privado.es_superadmin()) then$x$),
    $x$'No tienes permiso para editar el catálogo de cuentas.'$x$,
    $x$'El catálogo de cuentas solo lo cambia el contador.'$x$);
  if v_nueva = v_def then
    raise exception 'No se encontró la validación de permisos en importar_cuentas_contables';
  end if;
  execute v_nueva;
end;
$$;
