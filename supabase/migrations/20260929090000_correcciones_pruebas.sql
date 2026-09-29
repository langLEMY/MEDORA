-- ============================================================================
-- MEDORA · Correcciones de la batería de pruebas por roles (2026-09-29)
--
-- · registrar_compra: el ITBIS de cada línea debe estar entre 0 y el 18 %.
-- · generar_nomina: frecuencia y período válidos, y una sola nómina por período
--   y frecuencia (evita pagar dos veces el mismo mes). Candado por sistema para
--   que dos personas generando a la vez no la dupliquen.
-- · eliminar_nomina_borrador: solo borra nóminas en borrador (no aprobadas).
-- · registrar_llegada: numeraba el turno tres veces (inofensivo, pero sobraba).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.registrar_compra(p_sistema uuid, p_proveedor uuid, p_fecha date, p_ncf text, p_forma_pago text, p_items jsonb, p_notas text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id      uuid := gen_random_uuid();
  v_numero  text;
  v_fecha   date := coalesce(p_fecha, current_date);
  v_turno   uuid := privado.turno_abierto(p_sistema);
  v_sub     numeric;
  v_itbis   numeric;
  v_lineas  jsonb;
  v_it      jsonb;
begin
  if not privado.tiene_rol(p_sistema, '{admin,farmacia,contabilidad,gerencia}', 'compras') then
    raise exception 'No tienes permiso para registrar compras.' using errcode = '42501';
  end if;
  if p_proveedor is null and p_forma_pago <> 'efectivo' then
    raise exception 'El proveedor es obligatorio si la compra no es 100%% en efectivo.' using errcode = 'P0001';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'La compra necesita al menos una línea.' using errcode = 'P0001';
  end if;

  for v_it in select * from jsonb_array_elements(p_items) loop
    if coalesce((v_it ->> 'cantidad')::numeric, 0) <= 0 or coalesce((v_it ->> 'costo_unitario')::numeric, -1) < 0 then
      raise exception 'Cantidad o costo inválido en "%".', v_it ->> 'descripcion' using errcode = 'P0001';
    end if;
    -- ITBIS de la factura del proveedor: entre 0 y el 18 % de la línea (tasa general de la DGII).
    if coalesce((v_it ->> 'itbis')::numeric, 0) < 0
       or coalesce((v_it ->> 'itbis')::numeric, 0) > round((v_it ->> 'cantidad')::numeric * (v_it ->> 'costo_unitario')::numeric * 0.18, 2) + 0.01 then
      raise exception 'El ITBIS de "%" debe estar entre 0 y el 18 %% del monto.', v_it ->> 'descripcion' using errcode = 'P0001';
    end if;
    if (v_it ->> 'item_id') is null and (v_it ->> 'cuenta') is null then
      raise exception 'La línea "%" necesita un artículo de inventario o una cuenta de gasto.', v_it ->> 'descripcion' using errcode = 'P0001';
    end if;
  end loop;

  select round(sum((i ->> 'cantidad')::numeric * (i ->> 'costo_unitario')::numeric), 2),
         round(sum(coalesce((i ->> 'itbis')::numeric, 0)), 2)
    into v_sub, v_itbis
    from jsonb_array_elements(p_items) i;

  v_numero := 'COM-' || lpad(privado.siguiente_numero(p_sistema, 'compra')::text, 6, '0');
  insert into public.compras (id, sistema_id, numero, proveedor_id, fecha, ncf_proveedor, forma_pago, subtotal, itbis, total, notas, turno_id, creado_por)
  values (v_id, p_sistema, v_numero, p_proveedor, v_fecha, nullif(trim(p_ncf), ''), p_forma_pago, v_sub, v_itbis, v_sub + v_itbis,
          nullif(p_notas, ''), v_turno, auth.uid());

  insert into public.compra_items (sistema_id, compra_id, item_id, descripcion, cantidad, costo_unitario, itbis, total, cuenta_codigo)
  select p_sistema, v_id, (i ->> 'item_id')::uuid, coalesce(nullif(i ->> 'descripcion', ''), 'Artículo'),
         (i ->> 'cantidad')::numeric, (i ->> 'costo_unitario')::numeric, coalesce((i ->> 'itbis')::numeric, 0),
         round((i ->> 'cantidad')::numeric * (i ->> 'costo_unitario')::numeric + coalesce((i ->> 'itbis')::numeric, 0), 2),
         case when (i ->> 'item_id') is null then i ->> 'cuenta' end
    from jsonb_array_elements(p_items) i;

  insert into public.movimientos_inventario (sistema_id, item_id, tipo, cantidad, lote, vence_en, motivo, creado_por)
  select p_sistema, (i ->> 'item_id')::uuid, 'entrada', (i ->> 'cantidad')::numeric, nullif(i ->> 'lote', ''),
         (nullif(i ->> 'vence_en', ''))::date, 'Compra ' || v_numero, auth.uid()
    from jsonb_array_elements(p_items) i
   where (i ->> 'item_id') is not null;
  update public.inventario_items it set costo_unitario = (i ->> 'costo_unitario')::numeric
    from jsonb_array_elements(p_items) i
   where (i ->> 'item_id') is not null and it.id = (i ->> 'item_id')::uuid and it.sistema_id = p_sistema;

  if p_forma_pago <> 'credito' then
    insert into public.movimientos_financieros (sistema_id, turno_id, tipo, categoria, concepto, monto, metodo, creado_por)
    values (p_sistema, v_turno, 'egreso', 'compra', 'Compra ' || v_numero, v_sub + v_itbis, p_forma_pago::public.metodo_pago, auth.uid());
  end if;

  select jsonb_agg(l) into v_lineas from (
    select jsonb_build_object('cuenta', privado.cuenta(p_sistema, 'inventario'),
                              'debe', sum((i ->> 'cantidad')::numeric * (i ->> 'costo_unitario')::numeric), 'descripcion', 'Inventario') as l
      from jsonb_array_elements(p_items) i where (i ->> 'item_id') is not null
    having count(*) > 0
    union all
    select jsonb_build_object('cuenta', i ->> 'cuenta', 'debe', sum((i ->> 'cantidad')::numeric * (i ->> 'costo_unitario')::numeric),
                              'descripcion', min(i ->> 'descripcion'))
      from jsonb_array_elements(p_items) i where (i ->> 'item_id') is null
     group by i ->> 'cuenta'
    union all
    select jsonb_build_object('cuenta', privado.cuenta(p_sistema, 'itbis_compras'), 'debe', v_itbis, 'descripcion', 'ITBIS') where v_itbis > 0
    union all
    select jsonb_build_object('cuenta', privado.cuenta(p_sistema, case p_forma_pago when 'efectivo' then 'caja' when 'credito' then 'cxp' else 'banco' end),
                              'haber', v_sub + v_itbis, 'descripcion', 'Pago · ' || p_forma_pago)
  ) x;
  perform privado.crear_asiento(p_sistema, v_fecha, 'Compra ' || v_numero, 'compra', v_id, v_lineas);

  return jsonb_build_object('id', v_id, 'numero', v_numero, 'total', v_sub + v_itbis);
end;
$function$;

CREATE OR REPLACE FUNCTION public.generar_nomina(p_sistema uuid, p_desde date, p_hasta date, p_frecuencia text, p_descripcion text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid := gen_random_uuid();
  l record;
begin
  if not privado.tiene_rol(p_sistema, '{admin,contabilidad,gerencia}', 'nomina') then
    raise exception 'No tienes permiso para generar nóminas.' using errcode = '42501';
  end if;
  if p_frecuencia not in ('mensual', 'quincenal') then
    raise exception 'Frecuencia de nómina inválida.' using errcode = 'P0001';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El período de la nómina no es válido.' using errcode = 'P0001';
  end if;
  -- Un solo cálculo por período: dos nóminas del mismo período pagarían doble.
  perform pg_advisory_xact_lock(hashtextextended('nomina:' || p_sistema::text, 0));
  if exists (select 1 from public.nominas n
              where n.sistema_id = p_sistema and n.frecuencia = p_frecuencia
                and daterange(n.desde, n.hasta, '[]') && daterange(p_desde, p_hasta, '[]')) then
    raise exception 'Ya existe una nómina % que cubre esas fechas. Ábrela o elimínala si está en borrador.', p_frecuencia using errcode = 'P0001';
  end if;
  insert into public.parametros_nomina (sistema_id) values (p_sistema) on conflict do nothing;

  insert into public.nominas (id, sistema_id, numero, descripcion, desde, hasta, frecuencia, creado_por)
  values (v_id, p_sistema, 'NOM-' || lpad(privado.siguiente_numero(p_sistema, 'nomina')::text, 5, '0'),
          coalesce(nullif(trim(p_descripcion), ''), 'Nómina ' || to_char(p_desde, 'DD/MM/YYYY') || ' – ' || to_char(p_hasta, 'DD/MM/YYYY')),
          p_desde, p_hasta, p_frecuencia, auth.uid());

  insert into public.nomina_lineas (sistema_id, nomina_id, empleado_id, salario)
  select p_sistema, v_id, e.id, round(case p_frecuencia when 'quincenal' then e.salario_mensual / 2 else e.salario_mensual end, 2)
    from public.empleados e
   where e.sistema_id = p_sistema and e.activo and e.frecuencia = p_frecuencia;

  for l in select id from public.nomina_lineas where nomina_id = v_id loop
    perform privado.calcular_linea_nomina(l.id);
  end loop;
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.eliminar_nomina_borrador(p_nomina uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  n public.nominas;
begin
  select * into n from public.nominas where id = p_nomina for update;
  if n.id is null or not privado.tiene_rol(n.sistema_id, '{admin,contabilidad,gerencia}', 'nomina') then
    raise exception 'Nómina no encontrada o sin permiso.' using errcode = '42501';
  end if;
  if n.estado <> 'borrador' then
    raise exception 'Solo se elimina una nómina en borrador; la aprobada ya tiene su asiento contable.' using errcode = 'P0001';
  end if;
  delete from public.nominas where id = p_nomina;
end;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_llegada(p_sistema uuid, p_paciente uuid, p_medico uuid DEFAULT NULL::uuid, p_especialidad text DEFAULT NULL::text, p_servicio uuid DEFAULT NULL::uuid, p_cita uuid DEFAULT NULL::uuid, p_prioridad boolean DEFAULT false, p_motivo_prioridad text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
  v_esp text;
  v_turno text;
  v_estado public.estado_cita;
begin
  if not privado.tiene_rol(p_sistema, '{admin,recepcion,enfermeria,gerencia}', 'agenda') then
    raise exception 'No tienes permiso para registrar llegadas.' using errcode = '42501';
  end if;
  if p_medico is not null and not exists (
       select 1 from public.membresias where sistema_id = p_sistema and usuario_id = p_medico and activo and atiende_agenda) then
    raise exception 'Ese médico no atiende en este sistema.' using errcode = 'P0001';
  end if;
  v_esp := coalesce(nullif(trim(p_especialidad), ''),
                    (select nullif(trim(especialidad), '') from public.membresias where sistema_id = p_sistema and usuario_id = p_medico));

  if p_cita is not null then
    update public.citas set
      medico_id = coalesce(p_medico, medico_id),
      especialidad = coalesce(v_esp, especialidad,
        (select nullif(trim(m.especialidad), '') from public.membresias m where m.sistema_id = p_sistema and m.usuario_id = citas.medico_id)),
      servicio_id = coalesce(p_servicio, servicio_id),
      prioridad = coalesce(p_prioridad, false),
      motivo_prioridad = nullif(trim(p_motivo_prioridad), ''),
      llegada_en = now(),
      estado = 'por_cobrar'
    where id = p_cita and sistema_id = p_sistema and estado in ('programada', 'confirmada')
    returning id into v_id;
    if v_id is null then
      raise exception 'La cita no existe o ya fue atendida.' using errcode = 'P0001';
    end if;
  else
    if p_medico is null and v_esp is null then
      raise exception 'Elige el médico o la especialidad.' using errcode = 'P0001';
    end if;
    insert into public.citas (sistema_id, paciente_id, medico_id, servicio_id, inicio, fin, estado, especialidad,
                              llegada_en, prioridad, motivo_prioridad, motivo)
    values (p_sistema, p_paciente, p_medico, p_servicio, now(), now() + interval '30 minutes', 'por_cobrar', v_esp,
            now(), coalesce(p_prioridad, false), nullif(trim(p_motivo_prioridad), ''), 'Llegada sin cita')
    returning id into v_id;
  end if;

  v_turno := privado.numerar_turno(v_id);
  if not (select s.cobro_antes_consulta from public.sistemas s where s.id = p_sistema) then
    v_turno := privado.activar_turno(v_id);
  end if;
  select estado into v_estado from public.citas where id = v_id;
  return jsonb_build_object('id', v_id, 'estado', v_estado, 'turno', v_turno);
end;
$function$;
