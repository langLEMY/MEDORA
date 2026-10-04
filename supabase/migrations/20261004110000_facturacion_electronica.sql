-- ============================================================================
-- MEDORA . Facturación electrónica (e-CF) directa con la DGII
--
-- Ley 32-23: cada comprobante se firma con el certificado digital del emisor y se
-- envía a la DGII. Cuando el sistema tiene la facturación electrónica activa:
--   - Los cobros con comprobante usan e-NCF: B01→E31 (crédito fiscal),
--     B02→E32 (consumo), B14→E44 (regímenes especiales), B15→E45 (gubernamental).
--     Formato: E + tipo (2) + secuencia (10), p. ej. E320000000001.
--   - Cada e-NCF emitido crea su documento en ecf_documentos (estado pendiente).
--   - La Edge Function "ecf" arma el XML, lo firma, lo envía y consulta el
--     resultado (aceptado / aceptado condicional / rechazado). pg_cron reintenta
--     los pendientes cada 10 minutos.
--   - Consumo (E32) de menos de RD$250,000: se envía el Resumen de Factura de
--     Consumo (RFCE) a fc.dgii.gov.do, como pide la norma.
-- Un cobro en cero (cubierto completo por la ARS) no consume e-NCF.
-- ============================================================================

-- Secuencias e-NCF (10 dígitos) junto a las de NCF tradicionales (8 dígitos).
alter table public.secuencias_ncf drop constraint secuencias_ncf_tipo_check;
alter table public.secuencias_ncf drop constraint secuencias_ncf_check;
alter table public.secuencias_ncf add constraint secuencias_ncf_tipo_check
  check (tipo in ('B01', 'B02', 'B14', 'B15', 'E31', 'E32', 'E33', 'E34', 'E44', 'E45'));
alter table public.secuencias_ncf add constraint secuencias_ncf_check
  check (hasta >= desde and siguiente >= desde and siguiente <= hasta + 1
         and hasta <= case when tipo like 'E%' then 9999999999 else 99999999 end);

alter table public.cobros drop constraint cobros_tipo_ncf_check;
alter table public.cobros add constraint cobros_tipo_ncf_check
  check (tipo_ncf in ('B01', 'B02', 'B14', 'B15', 'E31', 'E32', 'E33', 'E34', 'E44', 'E45'));

alter table public.sistemas add column if not exists ecf_activo boolean not null default false;

CREATE OR REPLACE FUNCTION privado.siguiente_ncf(p_sistema uuid, p_tipo text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s public.secuencias_ncf;
begin
  select * into s from public.secuencias_ncf where sistema_id = p_sistema and tipo = p_tipo and activo for update;
  if s.id is null then
    raise exception 'No hay una secuencia de % activa (Contabilidad → Comprobantes fiscales).', p_tipo using errcode = 'P0001';
  end if;
  if s.siguiente > s.hasta then
    raise exception 'La secuencia % se agotó. Registra el nuevo rango autorizado por la DGII.', p_tipo using errcode = 'P0001';
  end if;
  if s.vence_en is not null and s.vence_en < current_date then
    raise exception 'La secuencia % venció el %.', p_tipo, s.vence_en using errcode = 'P0001';
  end if;
  update public.secuencias_ncf set siguiente = siguiente + 1 where id = s.id;
  return p_tipo || lpad(s.siguiente::text, case when p_tipo like 'E%' then 10 else 8 end, '0');
end;
$function$;

-- Tipo de comprobante que se emite de verdad: con e-CF activo, el equivalente electrónico.
create or replace function privado.tipo_comprobante(p_sistema uuid, p_tipo text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when p_tipo is null then null
           when coalesce((select ecf_activo from public.sistemas where id = p_sistema), false)
             then case p_tipo when 'B01' then 'E31' when 'B02' then 'E32' when 'B14' then 'E44' when 'B15' then 'E45' else p_tipo end
           else p_tipo
         end;
$$;
revoke all on function privado.tipo_comprobante(uuid, text) from public;

-- ---------------------------------------------------------------------------
-- Documentos e-CF (uno por cobro con e-NCF)
-- ---------------------------------------------------------------------------
create table public.ecf_documentos (
  id               uuid primary key default gen_random_uuid(),
  sistema_id       uuid not null references public.sistemas(id) on delete restrict,
  cobro_id         uuid not null,
  encf             text not null,
  tipo             text not null check (tipo in ('E31', 'E32', 'E33', 'E34', 'E44', 'E45')),
  monto_total      numeric(14, 2) not null,
  -- E32 < RD$250,000: la DGII recibe el resumen (RFCE) en vez del e-CF completo.
  resumen          boolean not null default false,
  estado           text not null default 'pendiente'
                   check (estado in ('pendiente', 'enviado', 'aceptado', 'aceptado_condicional', 'rechazado', 'error')),
  track_id         text,
  codigo_seguridad text,
  fecha_firma      timestamptz,
  qr_url           text,
  xml              text,
  mensajes         jsonb,
  intentos         integer not null default 0,
  ultimo_intento   timestamptz,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  actualizado_por  uuid,
  unique (sistema_id, id),
  unique (sistema_id, encf),
  unique (cobro_id),
  foreign key (sistema_id, cobro_id) references public.cobros (sistema_id, id)
);
create index ix_ecf_pendientes on public.ecf_documentos (estado, ultimo_intento) where estado in ('pendiente', 'enviado', 'error');
create index ix_ecf_sistema_fecha on public.ecf_documentos (sistema_id, creado_en desc);
create trigger trg_ecf_documentos_actualizacion before update on public.ecf_documentos
  for each row execute function privado.tg_marcar_actualizacion();
-- El XML firmado es grande: se audita sin volcar el contenido.
create trigger trg_ecf_documentos_auditoria after insert or update or delete on public.ecf_documentos
  for each row execute function privado.tg_auditar('sin_datos');

-- Solo el servidor (Edge Function, service_role) cambia el estado; el XML firmado
-- emitido no se borra (salvo al eliminar el sistema completo).
create or replace function privado.tg_ecf_sin_borrar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if privado.eliminando_sistema(old.sistema_id) then
    return old;
  end if;
  raise exception 'Un comprobante electrónico emitido no se borra: se anula con una nota de crédito (E34).' using errcode = '42501';
end;
$$;
create trigger trg_ecf_documentos_sin_borrar before delete on public.ecf_documentos
  for each row execute function privado.tg_ecf_sin_borrar();

alter table public.ecf_documentos enable row level security;
revoke all on public.ecf_documentos from anon, authenticated;
grant select on public.ecf_documentos to authenticated;
create policy ecf_documentos_select on public.ecf_documentos for select to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{caja,admin,contabilidad,gerencia,auditor}', 'caja')));

-- Cada cobro con e-NCF nace con su documento pendiente de envío.
create or replace function privado.tg_cobro_crea_ecf()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.ncf like 'E%' then
    insert into public.ecf_documentos (sistema_id, cobro_id, encf, tipo, monto_total, resumen)
    values (new.sistema_id, new.id, new.ncf, new.tipo_ncf, new.total, new.tipo_ncf = 'E32' and new.total < 250000);
  end if;
  return new;
end;
$$;
create trigger trg_cobros_crea_ecf after insert on public.cobros
  for each row execute function privado.tg_cobro_crea_ecf();

-- ---------------------------------------------------------------------------
-- Activar / pausar la facturación electrónica del sistema
-- ---------------------------------------------------------------------------
create or replace function public.activar_facturacion_electronica(p_sistema uuid, p_activo boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_mfa();
  if not (privado.tiene_rol(p_sistema, '{admin,contabilidad}', 'contabilidad') or privado.es_superadmin()) then
    raise exception 'Solo administración o contabilidad activan la facturación electrónica.' using errcode = '42501';
  end if;
  if p_activo then
    if not exists (select 1 from public.integraciones where sistema_id = p_sistema and proveedor = 'dgii_ecf' and estado = 'conectado') then
      raise exception 'Primero conecta la facturación electrónica en Integraciones (certificado probado con la DGII).' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.secuencias_ncf where sistema_id = p_sistema and tipo = 'E32' and activo and siguiente <= hasta) then
      raise exception 'Registra la secuencia E32 (consumo) autorizada por la DGII antes de activar.' using errcode = 'P0001';
    end if;
    if nullif(trim(coalesce((select rnc from public.sistemas where id = p_sistema), '')), '') is null then
      raise exception 'El sistema necesita su RNC (Administración → Sistema y sedes).' using errcode = 'P0001';
    end if;
  end if;
  update public.sistemas set ecf_activo = p_activo where id = p_sistema;
  insert into public.integracion_eventos (sistema_id, proveedor, tipo, detalle)
  values (p_sistema, 'dgii_ecf', 'activacion', jsonb_build_object('facturacion_electronica', p_activo));
end;
$$;
revoke all on function public.activar_facturacion_electronica(uuid, boolean) from public, anon;
grant execute on function public.activar_facturacion_electronica(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- registrar_cobro: emite el comprobante del tipo que corresponda (e-CF si está
-- activo). Resto igual que en 20260930093000_cobro_idempotencia.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_cobro(p_sistema uuid, p_paciente uuid, p_items jsonb, p_pagos jsonb, p_aseguradora uuid DEFAULT NULL::uuid, p_autorizacion text DEFAULT NULL::text, p_descuento numeric DEFAULT 0, p_cita uuid DEFAULT NULL::uuid, p_referencia text DEFAULT NULL::text, p_notas text DEFAULT NULL::text, p_tipo_ncf text DEFAULT NULL::text, p_cliente_rnc text DEFAULT NULL::text, p_cliente_nombre text DEFAULT NULL::text, p_profesional uuid DEFAULT NULL::uuid, p_vendedor uuid DEFAULT NULL::uuid, p_idempotencia text DEFAULT NULL::text)
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
  v_tipo_ncf   text;
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
  v_clave      text := nullif(trim(p_idempotencia), '');
  v_ya         public.cobros;
begin
  if not privado.tiene_rol(p_sistema, '{caja,admin}', 'caja') then
    raise exception 'No tienes permiso para registrar cobros en este sistema.' using errcode = '42501';
  end if;

  -- Idempotencia: si el mismo cobro se reenvia (doble clic, reintento de red) con la
  -- misma clave, se devuelve el que ya se hizo en vez de cobrar dos veces.
  if v_clave is not null then
    select * into v_ya from public.cobros where sistema_id = p_sistema and clave_idempotencia = v_clave;
    if v_ya.id is not null then
      return jsonb_build_object('id', v_ya.id, 'numero', v_ya.numero, 'ncf', v_ya.ncf, 'subtotal', v_ya.subtotal,
        'cobertura', v_ya.cobertura_seguro, 'fondo', v_ya.monto_fondo, 'total', v_ya.total,
        'pagado', v_ya.total - v_ya.monto_credito, 'credito', v_ya.monto_credito, 'repetido', true,
        'turno', (select c.turno from public.citas c where c.id = v_ya.cita_id));
    end if;
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
  if v_anticipo > 0 and v_anticipo > privado.saldo_anticipo(p_sistema, p_paciente) then
    raise exception 'El paciente no tiene suficiente saldo de anticipos.' using errcode = 'P0001';
  end if;
  v_credito := v_total - v_pagado;
  v_principal := coalesce(v_principal, case when v_total = 0 and v_cobertura > 0 then 'seguro' else 'credito' end);

  -- Comprobante: con e-CF activo se emite el electrónico equivalente; un cobro en
  -- cero (todo lo cubre la ARS) no consume e-NCF.
  v_tipo_ncf := privado.tipo_comprobante(p_sistema, p_tipo_ncf);
  if v_tipo_ncf like 'E%' and v_total = 0 then
    v_tipo_ncf := null;
  end if;
  if v_tipo_ncf is not null then
    if v_tipo_ncf in ('B01', 'E31') and nullif(trim(coalesce(p_cliente_rnc, '')), '') is null then
      raise exception 'Para crédito fiscal indica el RNC o cédula del cliente.' using errcode = 'P0001';
    end if;
    v_ncf := privado.siguiente_ncf(p_sistema, v_tipo_ncf);
  end if;

  v_numero := 'REC-' || lpad(privado.siguiente_numero(p_sistema, 'recibo')::text, 7, '0');

  insert into public.cobros (id, sistema_id, sede_id, turno_id, paciente_id, cita_id, numero, subtotal, cobertura_seguro,
    descuento, total, metodo, aseguradora_id, numero_autorizacion, referencia, notas, cajero_id,
    tipo_ncf, ncf, cliente_rnc, cliente_nombre, profesional_id, vendedor_id, monto_credito, monto_fondo, clave_idempotencia)
  values (v_cobro_id, p_sistema, v_turno.sede_id, v_turno.id, p_paciente, p_cita, v_numero, v_subtotal, v_cobertura,
    v_descuento, v_total, v_principal::public.metodo_pago, p_aseguradora, p_autorizacion, p_referencia, p_notas, auth.uid(),
    v_tipo_ncf, v_ncf, nullif(trim(p_cliente_rnc), ''), nullif(trim(p_cliente_nombre), ''), p_profesional, (select auth.uid()), v_credito, v_fondo, v_clave);

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
exception when unique_violation then
  -- Otra peticion con la misma clave gano la carrera: devolver ese cobro.
  select * into v_ya from public.cobros where sistema_id = p_sistema and clave_idempotencia = v_clave;
  if v_ya.id is not null then
    return jsonb_build_object('id', v_ya.id, 'numero', v_ya.numero, 'ncf', v_ya.ncf, 'subtotal', v_ya.subtotal,
      'cobertura', v_ya.cobertura_seguro, 'fondo', v_ya.monto_fondo, 'total', v_ya.total,
      'pagado', v_ya.total - v_ya.monto_credito, 'credito', v_ya.monto_credito, 'repetido', true,
      'turno', (select c.turno from public.citas c where c.id = v_ya.cita_id));
  end if;
  raise;
end;
$function$;

revoke all on function public.registrar_cobro(uuid, uuid, jsonb, jsonb, uuid, text, numeric, uuid, text, text, text, text, text, uuid, uuid, text) from public, anon;
grant execute on function public.registrar_cobro(uuid, uuid, jsonb, jsonb, uuid, text, numeric, uuid, text, text, text, text, text, uuid, uuid, text) to authenticated;

-- Un cobro con e-CF ya aceptado por la DGII no se anula sin nota de crédito (E34).
create or replace function privado.tg_anulacion_respeta_ecf()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.ecf_documentos d
              where d.cobro_id = new.cobro_id and d.estado in ('enviado', 'aceptado', 'aceptado_condicional')) then
    raise exception 'Este cobro tiene un comprobante electrónico enviado a la DGII: se corrige con una nota de crédito (E34), no anulándolo.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger trg_anulaciones_respeta_ecf before insert on public.anulaciones_cobro
  for each row execute function privado.tg_anulacion_respeta_ecf();

-- Reintentos automáticos: cada 10 minutos la Edge Function "ecf" procesa lo
-- pendiente (mismo token de tareas programadas que el respaldo diario).
select cron.schedule('medora-ecf-pendientes', '*/10 * * * *', $cron$
  select net.http_post(
    url := 'https://gprjxsubzocbbflxoggd.supabase.co/functions/v1/ecf',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-respaldo-token', (select decrypted_secret from vault.decrypted_secrets where name = 'respaldo_cron')),
    body := '{"accion":"procesar"}'::jsonb,
    timeout_milliseconds := 120000
  )
  where exists (select 1 from public.ecf_documentos where estado in ('pendiente', 'enviado', 'error') and intentos < 20);
$cron$);
