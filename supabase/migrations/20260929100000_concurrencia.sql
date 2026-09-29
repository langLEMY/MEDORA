-- ============================================================================
-- MEDORA · Correcciones de las pruebas de concurrencia (2026-09-29)
--
-- · registrar_cobro: con un adelanto de 1,000, seis cobros simultáneos de 950
--   pasaban cuatro (el saldo se leía antes de que los otros terminaran). Ahora
--   los cobros que usan adelanto del mismo paciente se hacen uno detrás de otro.
-- · Citas: el candado "un médico no puede tener dos citas a la misma hora"
--   aplicaba también a pacientes que ya llegaron (turnos). Dos llegadas sin cita
--   con menos de 30 min de diferencia chocaban y "Llamar siguiente" o
--   "Registrar llegada" con médico fallaban. El candado ahora solo evita agendar
--   dos citas programadas/confirmadas en el mismo horario, que es su propósito.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.registrar_cobro(p_sistema uuid, p_paciente uuid, p_items jsonb, p_pagos jsonb, p_aseguradora uuid DEFAULT NULL::uuid, p_autorizacion text DEFAULT NULL::text, p_descuento numeric DEFAULT 0, p_cita uuid DEFAULT NULL::uuid, p_referencia text DEFAULT NULL::text, p_notas text DEFAULT NULL::text, p_tipo_ncf text DEFAULT NULL::text, p_cliente_rnc text DEFAULT NULL::text, p_cliente_nombre text DEFAULT NULL::text, p_profesional uuid DEFAULT NULL::uuid, p_vendedor uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_turno      public.turnos_caja;
  v_cobro_id   uuid := gen_random_uuid();
  v_numero     text;
  v_ncf        text;
  v_item       jsonb;
  v_servicio   public.servicios;
  v_cantidad   numeric;
  v_precio     numeric;
  v_cubierto   numeric;
  v_fondo      numeric := 0;
  v_ars        public.coberturas;
  v_linea      numeric;
  v_categoria  text;
  v_subtotal   numeric := 0;
  v_cobertura  numeric := 0;
  v_descuento  numeric := round(coalesce(p_descuento, 0), 2);
  v_total      numeric;
  v_detalles   jsonb := '[]'::jsonb;
  v_pago       jsonb;
  v_metodos    text[] := '{}';
  v_m          text;
  v_monto      numeric;
  v_pagado     numeric := 0;
  v_anticipo   numeric := 0;
  v_credito    numeric;
  v_principal  text;
  v_max        numeric := -1;
  v_lineas     jsonb;
begin
  if not privado.tiene_rol(p_sistema, '{caja,admin}', 'caja') then
    raise exception 'No tienes permiso para registrar cobros en este sistema.' using errcode = '42501';
  end if;

  perform privado.turno_o_abrir(p_sistema);
  select * into v_turno from public.turnos_caja where id = privado.turno_abierto(p_sistema);
  if v_turno.id is null then
    raise exception 'Abre un turno de caja antes de registrar cobros.' using errcode = 'P0001';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El cobro necesita al menos un concepto.' using errcode = 'P0001';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_cantidad := coalesce((v_item ->> 'cantidad')::numeric, 1);
    if v_cantidad <= 0 then
      raise exception 'Cantidad inválida.' using errcode = 'P0001';
    end if;

    v_servicio := null;
    if (v_item ->> 'servicio_id') is not null then
      select * into v_servicio from public.servicios where id = (v_item ->> 'servicio_id')::uuid and sistema_id = p_sistema;
      if v_servicio.id is null then
        raise exception 'Servicio no encontrado en este sistema.' using errcode = 'P0001';
      end if;
      v_precio := v_servicio.precio;
      v_categoria := v_servicio.categoria;
    else
      v_precio := coalesce((v_item ->> 'precio_unitario')::numeric, 0);
      v_categoria := coalesce(nullif(v_item ->> 'categoria', ''), 'otro');
      if v_precio < 0 then
        raise exception 'Precio inválido.' using errcode = 'P0001';
      end if;
    end if;

    v_cubierto := 0;
    if p_aseguradora is not null and v_servicio.id is not null then
      select * into v_ars from public.coberturas c
       where c.aseguradora_id = p_aseguradora and c.servicio_id = v_servicio.id;
      if v_ars.id is not null then
        -- Precio pactado con la aseguradora (tarifario), si lo hay.
        v_precio := coalesce(v_ars.precio, v_precio);
        v_cubierto := round(least(v_ars.monto_cubierto, v_precio) * v_cantidad, 2);
        v_fondo := v_fondo + round(coalesce(v_ars.monto_fondo, 0) * v_cantidad, 2);
      end if;
    end if;

    v_linea := round(v_precio * v_cantidad, 2);
    v_subtotal := v_subtotal + v_linea;
    v_cobertura := v_cobertura + v_cubierto;
    v_detalles := v_detalles || jsonb_build_object(
      'id', gen_random_uuid(),
      'servicio_id', v_servicio.id,
      'descripcion', coalesce(v_servicio.nombre, nullif(trim(v_item ->> 'descripcion'), ''), 'Concepto'),
      'categoria', v_categoria,
      'cantidad', v_cantidad,
      'precio_unitario', v_precio,
      'bruto', v_linea,
      'cobertura', v_cubierto,
      'total', v_linea - v_cubierto
    );
  end loop;

  v_total := v_subtotal - v_cobertura - v_descuento;
  if v_descuento < 0 or v_total < 0 then
    raise exception 'El descuento supera el monto a pagar.' using errcode = 'P0001';
  end if;

  for v_pago in select * from jsonb_array_elements(coalesce(p_pagos, '[]'::jsonb)) loop
    v_m := v_pago ->> 'metodo';
    v_monto := round(coalesce((v_pago ->> 'monto')::numeric, 0), 2);
    if v_m is null or v_m not in ('efectivo', 'tarjeta', 'transferencia', 'cheque', 'otro', 'anticipo') then
      raise exception 'Método de pago inválido.' using errcode = 'P0001';
    end if;
    if v_monto <= 0 then
      raise exception 'Cada pago debe tener un monto mayor que cero.' using errcode = 'P0001';
    end if;
    if v_m = any(v_metodos) then
      raise exception 'No repitas el método de pago "%": suma los montos en una sola línea.', v_m using errcode = 'P0001';
    end if;
    v_metodos := v_metodos || v_m;
    v_pagado := v_pagado + v_monto;
    if v_m = 'anticipo' then
      v_anticipo := v_monto;
    end if;
    if v_monto > v_max then
      v_max := v_monto;
      v_principal := v_m;
    end if;
  end loop;

  if v_pagado > v_total then
    raise exception 'Los pagos (%) superan el total a cobrar (%).', v_pagado, v_total using errcode = 'P0001';
  end if;
  if v_anticipo > 0 then
    -- Dos cobros a la vez no pueden gastar el mismo adelanto: se serializan por paciente
    -- y el saldo se lee después de que el otro cobro termine.
    perform pg_advisory_xact_lock(hashtextextended('anticipo:' || p_sistema::text || ':' || p_paciente::text, 0));
  end if;
  if v_anticipo > 0 and v_anticipo > privado.saldo_anticipo(p_sistema, p_paciente) then
    raise exception 'El paciente no tiene suficiente saldo de anticipos.' using errcode = 'P0001';
  end if;
  v_credito := v_total - v_pagado;
  v_principal := coalesce(v_principal, case when v_total = 0 and v_cobertura > 0 then 'seguro' else 'credito' end);

  if p_tipo_ncf is not null then
    if p_tipo_ncf = 'B01' and nullif(trim(coalesce(p_cliente_rnc, '')), '') is null then
      raise exception 'Para crédito fiscal (B01) indica el RNC o cédula del cliente.' using errcode = 'P0001';
    end if;
    v_ncf := privado.siguiente_ncf(p_sistema, p_tipo_ncf);
  end if;

  v_numero := 'REC-' || lpad(privado.siguiente_numero(p_sistema, 'recibo')::text, 7, '0');

  insert into public.cobros (id, sistema_id, sede_id, turno_id, paciente_id, cita_id, numero, subtotal, cobertura_seguro,
    descuento, total, metodo, aseguradora_id, numero_autorizacion, referencia, notas, cajero_id,
    tipo_ncf, ncf, cliente_rnc, cliente_nombre, profesional_id, vendedor_id, monto_credito, monto_fondo)
  values (v_cobro_id, p_sistema, v_turno.sede_id, v_turno.id, p_paciente, p_cita, v_numero, v_subtotal, v_cobertura,
    v_descuento, v_total, v_principal::public.metodo_pago, p_aseguradora, p_autorizacion, p_referencia, p_notas, auth.uid(),
    p_tipo_ncf, v_ncf, nullif(trim(p_cliente_rnc), ''), nullif(trim(p_cliente_nombre), ''), p_profesional, (select auth.uid()), v_credito, v_fondo);

  insert into public.cobro_detalles (id, sistema_id, cobro_id, servicio_id, descripcion, categoria, cantidad, precio_unitario, cobertura, total)
  select (d ->> 'id')::uuid, p_sistema, v_cobro_id, (d ->> 'servicio_id')::uuid, d ->> 'descripcion', d ->> 'categoria',
         (d ->> 'cantidad')::numeric, (d ->> 'precio_unitario')::numeric, (d ->> 'cobertura')::numeric, (d ->> 'total')::numeric
    from jsonb_array_elements(v_detalles) d;

  insert into public.cobro_pagos (sistema_id, cobro_id, metodo, monto, referencia, recibido)
  select p_sistema, v_cobro_id, (p ->> 'metodo')::public.metodo_pago, round((p ->> 'monto')::numeric, 2), nullif(p ->> 'referencia', ''),
         case when p ->> 'metodo' = 'efectivo' and (p ->> 'recibido')::numeric >= (p ->> 'monto')::numeric
              then round((p ->> 'recibido')::numeric, 2) end
    from jsonb_array_elements(coalesce(p_pagos, '[]'::jsonb)) p;

  insert into public.movimientos_financieros (sistema_id, sede_id, turno_id, tipo, categoria, concepto, monto, metodo, cobro_id, creado_por)
  select p_sistema, v_turno.sede_id, v_turno.id, 'ingreso', 'cobro', 'Cobro ' || v_numero, round((p ->> 'monto')::numeric, 2),
         (p ->> 'metodo')::public.metodo_pago, v_cobro_id, auth.uid()
    from jsonb_array_elements(coalesce(p_pagos, '[]'::jsonb)) p
   where p ->> 'metodo' <> 'anticipo';

  select jsonb_agg(l) into v_lineas from (
    select jsonb_build_object('cuenta', privado.cuenta(p_sistema, 'ingreso_' || (d ->> 'categoria')),
                              'haber', sum((d ->> 'bruto')::numeric), 'descripcion', 'Ingresos · ' || (d ->> 'categoria')) as l
      from jsonb_array_elements(v_detalles) d
     group by d ->> 'categoria'
    union all
    select jsonb_build_object('cuenta', privado.cuenta_metodo(p_sistema, p ->> 'metodo'), 'debe', (p ->> 'monto')::numeric,
                              'descripcion', 'Pago · ' || (p ->> 'metodo'))
      from jsonb_array_elements(coalesce(p_pagos, '[]'::jsonb)) p
    union all
    select jsonb_build_object('cuenta', privado.cuenta(p_sistema, 'cxc_pacientes'), 'debe', v_credito, 'descripcion', 'Crédito al paciente')
     where v_credito > 0
    union all
    select jsonb_build_object('cuenta', privado.cuenta(p_sistema, 'cxc_aseguradoras'), 'debe', v_cobertura, 'descripcion', 'Cobertura ARS')
     where v_cobertura > 0
    union all
    select jsonb_build_object('cuenta', privado.cuenta(p_sistema, 'cxc_aseguradoras'), 'debe', v_fondo, 'descripcion', 'Fondo interno ARS')
     where v_fondo > 0
    union all
    select jsonb_build_object('cuenta', privado.cuenta(p_sistema, 'ingreso_fondo_interno'), 'haber', v_fondo, 'descripcion', 'Fondo interno')
     where v_fondo > 0
    union all
    select jsonb_build_object('cuenta', privado.cuenta(p_sistema, 'descuentos'), 'debe', v_descuento, 'descripcion', 'Descuento')
     where v_descuento > 0
  ) x;
  perform privado.crear_asiento(p_sistema, current_date, 'Cobro ' || v_numero, 'cobro', v_cobro_id, v_lineas);

  perform privado.calcular_comisiones(v_cobro_id);

  if p_cita is not null then
    update public.citas set estado = 'completada', atendida_en = coalesce(atendida_en, now())
     where id = p_cita and sistema_id = p_sistema and estado = 'en_consulta';
  end if;

  return jsonb_build_object('id', v_cobro_id, 'numero', v_numero, 'ncf', v_ncf, 'subtotal', v_subtotal,
    'cobertura', v_cobertura, 'fondo', v_fondo, 'total', v_total, 'pagado', v_pagado, 'credito', v_credito,
    'turno', (select c.turno from public.citas c where c.id = p_cita));
end;
$function$;

alter table public.citas drop constraint ex_citas_medico_sin_solape;
alter table public.citas add constraint ex_citas_medico_sin_solape exclude using gist (
  medico_id with =,
  tstzrange(inicio, fin) with &&
) where (estado in ('programada', 'confirmada'));
