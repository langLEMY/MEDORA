-- ============================================================================
-- MEDORA · Comisiones: reporte con retención, neto a pagar y pacientes atendidos;
-- importación de reglas por especialidad y con retención.
-- ============================================================================
drop function public.reporte_comisiones(uuid, date, date);
create function public.reporte_comisiones(p_sistema uuid, p_desde date, p_hasta date)
returns table (beneficiario_id uuid, nombre text, especialidad text, generado numeric, retencion numeric, liquidado numeric,
               pendiente numeric, a_pagar numeric, operaciones bigint, pacientes bigint)
language sql
stable
set search_path = ''
as $$
  select c.beneficiario_id, p.nombre_completo, max(m.especialidad),
         coalesce(sum(c.monto) filter (where c.creado_en::date between p_desde and p_hasta), 0),
         coalesce(sum(c.retencion) filter (where c.creado_en::date between p_desde and p_hasta), 0),
         coalesce(sum(c.monto) filter (where c.creado_en::date between p_desde and p_hasta and li.comision_id is not null), 0),
         coalesce(sum(c.monto) filter (where li.comision_id is null and c.creado_en::date <= p_hasta), 0),
         coalesce(sum(c.monto - c.retencion) filter (where li.comision_id is null and c.creado_en::date <= p_hasta), 0),
         count(*) filter (where c.creado_en::date between p_desde and p_hasta),
         count(distinct co.paciente_id) filter (where c.creado_en::date between p_desde and p_hasta)
    from public.comisiones c
    join public.perfiles p on p.id = c.beneficiario_id
    join public.cobros co on co.id = c.cobro_id
    left join public.membresias m on m.sistema_id = c.sistema_id and m.usuario_id = c.beneficiario_id
    left join public.liquidacion_items li on li.comision_id = c.id
   where c.sistema_id = p_sistema
   group by c.beneficiario_id, p.nombre_completo
   order by p.nombre_completo;
$$;
revoke all on function public.reporte_comisiones(uuid, date, date) from public, anon;
grant execute on function public.reporte_comisiones(uuid, date, date) to authenticated;

do $$
declare
  v_def text := pg_get_functiondef('public.importar_reglas_comision(uuid, jsonb)'::regprocedure);
  v_nueva text := v_def;
begin
  v_nueva := replace(v_nueva,
    'v_rol := coalesce(privado.texto(f, ''rol''), ''medico'')::public.rol_sistema;',
    'v_rol := coalesce(privado.texto(f, ''rol''), case when privado.texto(f, ''especialidad'') is null then ''medico'' end)::public.rol_sistema;');
  v_nueva := replace(v_nueva,
    'coalesce(privado.texto(f, ''persona''), initcap(v_rol::text))',
    'coalesce(privado.texto(f, ''persona''), privado.texto(f, ''especialidad''), initcap(v_rol::text))');
  v_nueva := replace(v_nueva,
    'vigente_desde, vigente_hasta)',
    'vigente_desde, vigente_hasta, especialidad, retencion)');
  v_nueva := replace(v_nueva,
    '(privado.texto(f, ''vigente_hasta''))::date);',
    '(privado.texto(f, ''vigente_hasta''))::date, privado.texto(f, ''especialidad''), coalesce(privado.numero(f, ''retencion''), 0));');
  v_nueva := replace(v_nueva,
    '          activo = true',
    '          especialidad = privado.texto(f, ''especialidad''), retencion = coalesce(privado.numero(f, ''retencion''), retencion),
          activo = true');
  if (length(v_nueva) - length(v_def)) < 300 then
    raise exception 'importar_reglas_comision no tiene el formato esperado.';
  end if;
  execute v_nueva;
end;
$$;
