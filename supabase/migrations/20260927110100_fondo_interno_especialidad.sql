-- ============================================================================
-- MEDORA · Fondo interno y especialidad (modelo de cobro de FUNBIDE)
--
-- - coberturas.monto_fondo: excedente que la aseguradora paga por encima de lo
--   que cubre (hoy Renacer/APS en FUNBIDE). No pasa por la caja ni lo paga el
--   paciente: queda como cuenta por cobrar a la ARS y como ingreso propio
--   (cuenta "4.3 Fondo interno", clave ingreso_fondo_interno).
-- - cobros.monto_fondo: el fondo congelado en cada cobro.
-- - servicios.especialidad / coberturas.especialidad: para agrupar y filtrar en
--   caja (especialidad → servicio → profesional). No es una validación.
-- ============================================================================

alter table public.coberturas
  add column monto_fondo numeric(12, 2) check (monto_fondo is null or monto_fondo >= 0),
  add column especialidad text;
alter table public.servicios add column especialidad text;
alter table public.cobros add column monto_fondo numeric(12, 2) not null default 0 check (monto_fondo >= 0);

-- Cuenta contable del fondo, en los sistemas existentes y en los nuevos.
insert into public.cuentas_contables (sistema_id, codigo, nombre, tipo, padre_codigo, acepta_movimiento)
select id, '4.3', 'Fondo interno (excedente de aseguradoras)', 'ingreso', '4', true from public.sistemas
on conflict (sistema_id, codigo) do nothing;
insert into public.cuentas_predeterminadas (sistema_id, clave, cuenta_codigo)
select id, 'ingreso_fondo_interno', '4.3' from public.sistemas
on conflict (sistema_id, clave) do nothing;

do $$
declare
  v_def text;
  v_nueva text;
begin
  -- Catálogo de cuentas para sistemas nuevos.
  v_def := pg_get_functiondef('privado.sembrar_catalogo(uuid)'::regprocedure);
  v_nueva := replace(v_def,
    '      (''4.2'',     ''Otros ingresos'',                            ''ingreso'',    ''4'',     true),',
    '      (''4.2'',     ''Otros ingresos'',                            ''ingreso'',    ''4'',     true),
      (''4.3'',     ''Fondo interno (excedente de aseguradoras)'', ''ingreso'',    ''4'',     true),');
  v_nueva := replace(v_nueva,
    '(''ingreso_farmacia'', ''4.1.07''), (''ingreso_otro'', ''4.1.99'')',
    '(''ingreso_farmacia'', ''4.1.07''), (''ingreso_otro'', ''4.1.99''), (''ingreso_fondo_interno'', ''4.3'')');
  if position('ingreso_fondo_interno' in v_nueva) = 0 or position('Fondo interno' in v_nueva) = 0 then
    raise exception 'sembrar_catalogo no tiene el formato esperado.';
  end if;
  execute v_nueva;

  -- registrar_cobro: suma el fondo de cada línea y lo asienta.
  v_def := pg_get_functiondef('public.registrar_cobro'::regproc);
  v_nueva := replace(v_def,
    '  v_cubierto   numeric;',
    '  v_cubierto   numeric;
  v_fondo      numeric := 0;');
  v_nueva := replace(v_nueva,
    '        v_cubierto := round(least(v_ars.monto_cubierto, v_precio) * v_cantidad, 2);',
    '        v_cubierto := round(least(v_ars.monto_cubierto, v_precio) * v_cantidad, 2);
        v_fondo := v_fondo + round(coalesce(v_ars.monto_fondo, 0) * v_cantidad, 2);');
  v_nueva := replace(v_nueva,
    'tipo_ncf, ncf, cliente_rnc, cliente_nombre, profesional_id, vendedor_id, monto_credito)',
    'tipo_ncf, ncf, cliente_rnc, cliente_nombre, profesional_id, vendedor_id, monto_credito, monto_fondo)');
  v_nueva := replace(v_nueva,
    'p_profesional, p_vendedor, v_credito);',
    'p_profesional, p_vendedor, v_credito, v_fondo);');
  v_nueva := replace(v_nueva,
    '    union all
    select jsonb_build_object(''cuenta'', privado.cuenta(p_sistema, ''descuentos'')',
    '    union all
    select jsonb_build_object(''cuenta'', privado.cuenta(p_sistema, ''cxc_aseguradoras''), ''debe'', v_fondo, ''descripcion'', ''Fondo interno ARS'')
     where v_fondo > 0
    union all
    select jsonb_build_object(''cuenta'', privado.cuenta(p_sistema, ''ingreso_fondo_interno''), ''haber'', v_fondo, ''descripcion'', ''Fondo interno'')
     where v_fondo > 0
    union all
    select jsonb_build_object(''cuenta'', privado.cuenta(p_sistema, ''descuentos'')');
  v_nueva := replace(v_nueva,
    '''cobertura'', v_cobertura, ''total'', v_total,',
    '''cobertura'', v_cobertura, ''fondo'', v_fondo, ''total'', v_total,');
  if (length(v_nueva) - length(replace(v_nueva, 'v_fondo', ''))) / length('v_fondo') < 9 then
    raise exception 'registrar_cobro no tiene el formato esperado (fondo).';
  end if;
  execute v_nueva;

  -- El fondo también se le cobra a la aseguradora.
  v_def := pg_get_functiondef('public.registrar_abono'::regproc);
  v_nueva := replace(v_def,
    'else v_cobro.cobertura_seguro end',
    'else v_cobro.cobertura_seguro + v_cobro.monto_fondo end');
  if v_nueva = v_def then
    raise exception 'registrar_abono no tiene el formato esperado.';
  end if;
  execute v_nueva;

  v_def := pg_get_functiondef('public.estado_cuenta'::regproc);
  v_nueva := replace(v_def,
    'then c.monto_credito else c.cobertura_seguro end as cargo',
    'then c.monto_credito else c.cobertura_seguro + c.monto_fondo end as cargo');
  v_nueva := replace(v_nueva,
    'c.aseguradora_id = p_contacto and c.cobertura_seguro > 0))',
    'c.aseguradora_id = p_contacto and c.cobertura_seguro + c.monto_fondo > 0))');
  if (length(v_nueva) - length(replace(v_nueva, 'monto_fondo', ''))) / length('monto_fondo') <> 2 then
    raise exception 'estado_cuenta no tiene el formato esperado.';
  end if;
  execute v_nueva;

  -- Importar tarifario: acepta monto_fondo.
  v_def := pg_get_functiondef('public.importar_coberturas'::regproc);
  v_nueva := replace(v_def,
    'servicio_id, monto_cubierto, precio)',
    'servicio_id, monto_cubierto, precio, monto_fondo)');
  v_nueva := replace(v_nueva,
    '              privado.numero(f, ''precio''))
      on conflict',
    '              privado.numero(f, ''precio''), privado.numero(f, ''monto_fondo''))
      on conflict');
  v_nueva := replace(v_nueva,
    'precio = excluded.precio;',
    'precio = excluded.precio, monto_fondo = excluded.monto_fondo;');
  if (length(v_nueva) - length(replace(v_nueva, 'monto_fondo', ''))) / length('monto_fondo') <> 4 then
    raise exception 'importar_coberturas no tiene el formato esperado.';
  end if;
  execute v_nueva;
end;
$$;

create or replace view public.cuentas_por_cobrar with (security_invoker = true) as
select c.id as cobro_id, c.sistema_id, c.numero, c.ncf, c.creado_en, c.paciente_id, c.aseguradora_id,
       c.numero_autorizacion, c.monto_credito, c.cobertura_seguro,
       c.monto_credito - coalesce((select sum(b.monto) from public.abonos b where b.cobro_id = c.id and b.deudor = 'paciente'), 0)
         as pendiente_paciente,
       c.cobertura_seguro + c.monto_fondo
         - coalesce((select sum(b.monto) from public.abonos b where b.cobro_id = c.id and b.deudor = 'aseguradora'), 0)
         as pendiente_aseguradora,
       c.monto_fondo
  from public.cobros c
 where (c.monto_credito > 0 or c.cobertura_seguro > 0 or c.monto_fondo > 0)
   and not exists (select 1 from public.anulaciones_cobro x where x.cobro_id = c.id);
