-- ============================================================================
-- MEDORA . Endurecimiento de seguridad
--
-- Reconstruida el 2026-10-04 a partir de la base de producción (la migración se
-- aplicó el 2026-10-02 desde otra máquina y nunca se subió al repo). Recoge el
-- estado real de los objetos que cambió:
--   - Limitador de intentos (privado.limite_tasa + public.consumir_limite), que
--     usan las Edge Functions de acceso, recuperación y configuración inicial.
--   - RPC que validan el rol con el permiso por módulo (tiene_rol con módulo),
--     no solo con el rol.
-- Idempotente: se puede volver a aplicar sin efectos.
-- ============================================================================

-- Limitador de intentos (ventana fija por clave: IP o usuario). Solo el
-- service_role lo usa, desde las Edge Functions.
create table if not exists privado.limite_tasa (
  clave          text primary key,
  ventana_inicio timestamptz not null default now(),
  conteo         integer not null default 0
);

CREATE OR REPLACE FUNCTION public.consumir_limite(p_clave text, p_max integer, p_ventana_seg integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_conteo  integer;
  v_ventana interval := make_interval(secs => p_ventana_seg);
begin
  insert into privado.limite_tasa as l (clave, ventana_inicio, conteo)
  values (p_clave, now(), 1)
  on conflict (clave) do update set
    conteo         = case when l.ventana_inicio < now() - v_ventana then 1 else l.conteo + 1 end,
    ventana_inicio = case when l.ventana_inicio < now() - v_ventana then now() else l.ventana_inicio end
  returning conteo into v_conteo;
  return v_conteo <= p_max;
end;
$function$;

revoke all on function public.consumir_limite(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consumir_limite(text, integer, integer) to service_role;

CREATE OR REPLACE FUNCTION privado.tiene_rol(p_sistema uuid, p_roles public.rol_sistema[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (select 1 from privado.mis_sistemas_con_rol(p_roles) x where x = p_sistema);
$function$;

CREATE OR REPLACE FUNCTION privado.tiene_rol(p_sistema uuid, p_roles public.rol_sistema[], p_modulo text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from privado.mis_sistemas_con_rol(p_roles, p_modulo) x where x = p_sistema
  );
$function$;

CREATE OR REPLACE FUNCTION privado.crear_asiento(p_sistema uuid, p_fecha date, p_concepto text, p_origen text, p_origen_id uuid, p_lineas jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id    uuid := gen_random_uuid();
  v_agr   jsonb;
  v_debe  numeric;
  v_haber numeric;
begin
  with l as (
    select x ->> 'cuenta' as cuenta,
           coalesce((x ->> 'debe')::numeric, 0) as d,
           coalesce((x ->> 'haber')::numeric, 0) as h,
           x ->> 'descripcion' as descr
      from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) x
  ), agr as (
    select cuenta, round(sum(d), 2) as debe, 0::numeric as haber, min(descr) as descripcion from l where d > 0 group by cuenta
    union all
    select cuenta, 0::numeric, round(sum(h), 2), min(descr) from l where h > 0 group by cuenta
  )
  select coalesce(jsonb_agg(to_jsonb(agr)), '[]'::jsonb), coalesce(sum(debe), 0), coalesce(sum(haber), 0)
    into v_agr, v_debe, v_haber
    from agr;

  if v_debe = 0 then
    return null;
  end if;
  if v_debe <> v_haber then
    raise exception 'El asiento no cuadra (debe % ≠ haber %).', v_debe, v_haber using errcode = 'P0001';
  end if;

  insert into public.asientos (id, sistema_id, numero, fecha, concepto, origen, origen_id, creado_por)
  values (v_id, p_sistema, privado.siguiente_numero(p_sistema, 'asiento'), coalesce(p_fecha, current_date),
          p_concepto, p_origen, p_origen_id, auth.uid());

  insert into public.asiento_lineas (sistema_id, asiento_id, cuenta_codigo, debe, haber, descripcion)
  select p_sistema, v_id, r.cuenta, r.debe, r.haber, r.descripcion
    from jsonb_to_recordset(v_agr) as r(cuenta text, debe numeric, haber numeric, descripcion text);

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION privado.calcular_comisiones_profesional(p_cobro uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  c public.cobros;
  d record;
  quien record;
  r public.reglas_comision;
  v_base numeric;
  v_monto numeric;
begin
  select * into c from public.cobros where id = p_cobro;
  for quien in
    select 'profesional' as aplica, c.profesional_id as persona where c.profesional_id is not null

  loop
    for d in select * from public.cobro_detalles where cobro_id = c.id loop
      select rc.* into r
        from public.reglas_comision rc
        left join public.membresias m on m.sistema_id = c.sistema_id and m.usuario_id = quien.persona
       where rc.sistema_id = c.sistema_id and rc.activo and rc.aplica_a = quien.aplica
         and (rc.vigente_desde is null or rc.vigente_desde <= current_date)
         and (rc.vigente_hasta is null or rc.vigente_hasta >= current_date)
         and (rc.beneficiario_id = quien.persona
              or (rc.beneficiario_id is null and (rc.rol is null or rc.rol = any(m.roles))))
         and (rc.especialidad is null or lower(trim(rc.especialidad)) = lower(trim(m.especialidad)))
         and (rc.servicio_id is null or rc.servicio_id = d.servicio_id)
         and (rc.categoria is null or rc.categoria = d.categoria)
       order by (rc.beneficiario_id is not null) desc, (rc.servicio_id is not null) desc,
                (rc.categoria is not null) desc, (rc.especialidad is not null) desc, rc.creado_en desc
       limit 1;
      continue when r.id is null;

      v_base := case r.base when 'neto' then d.total else round(d.precio_unitario * d.cantidad, 2) end;
      v_monto := round(case r.tipo when 'porcentaje' then v_base * r.valor / 100 else r.valor * d.cantidad end, 2);
      if v_monto > 0 then
        insert into public.comisiones (sistema_id, cobro_id, detalle_id, beneficiario_id, regla_id, base_monto, monto, retencion, concepto)
        values (c.sistema_id, c.id, d.id, quien.persona, r.id, v_base, v_monto, round(v_monto * r.retencion / 100, 2),
                c.numero || ' · ' || d.descripcion);
      end if;
      r := null;
    end loop;
  end loop;
end;
$function$;

revoke all on function privado.calcular_comisiones_profesional(uuid) from public;
revoke all on function privado.crear_asiento(uuid, date, text, text, uuid, jsonb) from public;


CREATE OR REPLACE FUNCTION public.anular_cobro(p_cobro uuid, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_cobro public.cobros;
  v_turno uuid;
begin
  select * into v_cobro from public.cobros where id = p_cobro;
  if v_cobro.id is null or not privado.tiene_rol(v_cobro.sistema_id, '{caja,admin}', 'caja') then
    raise exception 'Cobro no encontrado o sin permiso.' using errcode = '42501';
  end if;
  if exists (select 1 from public.abonos where cobro_id = v_cobro.id) then
    raise exception 'El cobro tiene abonos registrados a su cuenta por cobrar; no se puede anular.' using errcode = 'P0001';
  end if;

  insert into public.anulaciones_cobro (sistema_id, cobro_id, motivo, anulado_por)
  values (v_cobro.sistema_id, v_cobro.id, p_motivo, auth.uid());

  v_turno := privado.turno_abierto(v_cobro.sistema_id);
  insert into public.movimientos_financieros (sistema_id, sede_id, turno_id, tipo, categoria, concepto, monto, metodo, cobro_id, creado_por)
  select v_cobro.sistema_id, v_cobro.sede_id, v_turno, 'egreso', 'anulacion', 'Anulación ' || v_cobro.numero, cp.monto, cp.metodo, v_cobro.id, auth.uid()
    from public.cobro_pagos cp
   where cp.cobro_id = v_cobro.id and cp.metodo <> 'anticipo';

  perform privado.revertir_asientos('cobro', v_cobro.id, 'Anulación ' || v_cobro.numero);

  insert into public.comisiones (sistema_id, cobro_id, detalle_id, beneficiario_id, regla_id, base_monto, monto, retencion, concepto)
  select k.sistema_id, k.cobro_id, k.detalle_id, k.beneficiario_id, k.regla_id, -k.base_monto, -k.monto, -k.retencion,
         'Anulación · ' || k.concepto
    from public.comisiones k
   where k.cobro_id = v_cobro.id and k.monto > 0
     and not exists (select 1 from public.comisiones x
                      where x.cobro_id = k.cobro_id and x.detalle_id is not distinct from k.detalle_id
                        and x.beneficiario_id = k.beneficiario_id and x.monto = -k.monto);
exception when unique_violation then
  raise exception 'Ese cobro ya fue anulado.' using errcode = 'P0001';
end;
$function$;

CREATE OR REPLACE FUNCTION public.anular_compra(p_compra uuid, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  c public.compras;
begin
  select * into c from public.compras where id = p_compra;
  if c.id is null or not privado.tiene_rol(c.sistema_id, '{admin,contabilidad,gerencia}', 'compras') then
    raise exception 'Compra no encontrada o sin permiso.' using errcode = '42501';
  end if;

  insert into public.anulaciones_compra (sistema_id, compra_id, motivo, anulado_por)
  values (c.sistema_id, c.id, p_motivo, auth.uid());

  insert into public.movimientos_inventario (sistema_id, item_id, tipo, cantidad, motivo, creado_por)
  select c.sistema_id, item_id, 'salida', cantidad, 'Anulación ' || c.numero, auth.uid()
    from public.compra_items where compra_id = c.id and item_id is not null;

  if c.forma_pago <> 'credito' then
    insert into public.movimientos_financieros (sistema_id, turno_id, tipo, categoria, concepto, monto, metodo, creado_por)
    values (c.sistema_id, privado.turno_abierto(c.sistema_id), 'ingreso', 'anulacion', 'Anulación ' || c.numero, c.total, c.forma_pago::public.metodo_pago, auth.uid());
  end if;

  perform privado.revertir_asientos('compra', c.id, 'Anulación ' || c.numero);
exception when unique_violation then
  raise exception 'Esa compra ya fue anulada.' using errcode = 'P0001';
end;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_abono(p_sistema uuid, p_cobro uuid, p_deudor text, p_monto numeric, p_metodo public.metodo_pago, p_referencia text DEFAULT NULL::text, p_fecha date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid := gen_random_uuid();
  v_numero text;
  v_pendiente numeric;
  v_cobro public.cobros;
  v_turno uuid := privado.turno_abierto(p_sistema);
  v_fecha date := coalesce(p_fecha, current_date);
begin
  if not privado.tiene_rol(p_sistema, '{caja,admin,contabilidad}', 'caja') then
    raise exception 'No tienes permiso para registrar abonos.' using errcode = '42501';
  end if;
  if v_fecha > current_date then
    raise exception 'La fecha no puede ser futura.' using errcode = 'P0001';
  end if;
  if v_turno is null and p_metodo = 'efectivo' then
    v_turno := privado.turno_o_abrir(p_sistema);
  end if;
  select * into v_cobro from public.cobros where id = p_cobro and sistema_id = p_sistema;
  if v_cobro.id is null or exists (select 1 from public.anulaciones_cobro where cobro_id = p_cobro) then
    raise exception 'Cuenta por cobrar no encontrada o anulada.' using errcode = 'P0001';
  end if;

  v_pendiente := case p_deudor when 'paciente' then v_cobro.monto_credito else v_cobro.cobertura_seguro + v_cobro.monto_fondo end
               - coalesce((select sum(monto) from public.abonos where cobro_id = p_cobro and deudor = p_deudor), 0);
  if round(p_monto, 2) > v_pendiente then
    raise exception 'El abono (%) supera el saldo pendiente (%).', round(p_monto, 2), v_pendiente using errcode = 'P0001';
  end if;

  v_numero := 'ABO-' || lpad(privado.siguiente_numero(p_sistema, 'abono')::text, 6, '0');
  insert into public.abonos (id, sistema_id, numero, cobro_id, deudor, monto, metodo, referencia, fecha, turno_id, creado_por)
  values (v_id, p_sistema, v_numero, p_cobro, p_deudor, round(p_monto, 2), p_metodo, nullif(p_referencia, ''), v_fecha, v_turno, auth.uid());

  insert into public.movimientos_financieros (sistema_id, turno_id, tipo, categoria, concepto, monto, metodo, cobro_id, creado_por)
  values (p_sistema, v_turno, 'ingreso', 'abono', 'Abono ' || v_numero || ' a ' || v_cobro.numero, round(p_monto, 2), p_metodo, p_cobro, auth.uid());

  perform privado.crear_asiento(p_sistema, v_fecha, 'Abono ' || v_numero || ' a ' || v_cobro.numero, 'abono', v_id, jsonb_build_array(
    jsonb_build_object('cuenta', privado.cuenta_metodo(p_sistema, p_metodo::text), 'debe', p_monto),
    jsonb_build_object('cuenta', privado.cuenta(p_sistema, case p_deudor when 'paciente' then 'cxc_pacientes' else 'cxc_aseguradoras' end), 'haber', p_monto)
  ));
  return jsonb_build_object('id', v_id, 'numero', v_numero);
end;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_anticipo(p_sistema uuid, p_paciente uuid, p_monto numeric, p_metodo public.metodo_pago, p_referencia text DEFAULT NULL::text, p_fecha date DEFAULT CURRENT_DATE, p_notas text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid := gen_random_uuid();
  v_numero text;
  v_turno uuid := privado.turno_abierto(p_sistema);
  v_fecha date := coalesce(p_fecha, current_date);
begin
  if not privado.tiene_rol(p_sistema, '{caja,admin}', 'caja') then
    raise exception 'No tienes permiso para registrar anticipos.' using errcode = '42501';
  end if;
  if v_fecha > current_date then
    raise exception 'La fecha no puede ser futura.' using errcode = 'P0001';
  end if;
  if v_turno is null and p_metodo = 'efectivo' then
    v_turno := privado.turno_o_abrir(p_sistema);
  end if;

  v_numero := 'ANT-' || lpad(privado.siguiente_numero(p_sistema, 'anticipo')::text, 6, '0');
  insert into public.anticipos (id, sistema_id, numero, paciente_id, monto, metodo, referencia, fecha, notas, turno_id, creado_por)
  values (v_id, p_sistema, v_numero, p_paciente, round(p_monto, 2), p_metodo, nullif(p_referencia, ''), v_fecha, nullif(p_notas, ''), v_turno, auth.uid());

  insert into public.movimientos_financieros (sistema_id, turno_id, tipo, categoria, concepto, monto, metodo, creado_por)
  values (p_sistema, v_turno, 'ingreso', 'anticipo', 'Anticipo ' || v_numero, round(p_monto, 2), p_metodo, auth.uid());

  perform privado.crear_asiento(p_sistema, v_fecha, 'Anticipo ' || v_numero, 'anticipo', v_id, jsonb_build_array(
    jsonb_build_object('cuenta', privado.cuenta_metodo(p_sistema, p_metodo::text), 'debe', p_monto),
    jsonb_build_object('cuenta', privado.cuenta(p_sistema, 'anticipos_pacientes'), 'haber', p_monto)
  ));
  return jsonb_build_object('id', v_id, 'numero', v_numero);
end;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_asiento_manual(p_sistema uuid, p_fecha date, p_concepto text, p_lineas jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not privado.tiene_rol(p_sistema, '{admin,contabilidad}', 'contabilidad') then
    raise exception 'Solo administración o contabilidad registran asientos manuales.' using errcode = '42501';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lineas) l
     where not exists (select 1 from public.cuentas_contables c
                        where c.sistema_id = p_sistema and c.codigo = l ->> 'cuenta' and c.acepta_movimiento and c.activo)
  ) then
    raise exception 'Hay cuentas inexistentes, inactivas o de agrupación (no aceptan movimiento).' using errcode = 'P0001';
  end if;
  return privado.crear_asiento(p_sistema, p_fecha, p_concepto, 'manual', null, p_lineas);
end;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_movimiento(p_sistema uuid, p_tipo text, p_concepto text, p_monto numeric, p_metodo public.metodo_pago DEFAULT 'efectivo'::public.metodo_pago, p_categoria text DEFAULT 'general'::text)
 RETURNS public.movimientos_financieros
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_mov public.movimientos_financieros;
  v_turno uuid := privado.turno_abierto(p_sistema);
begin
  if not privado.tiene_rol(p_sistema, '{caja,admin}', 'caja') then
    raise exception 'No tienes permiso para registrar movimientos.' using errcode = '42501';
  end if;
  if p_categoria in ('cobro', 'anulacion') then
    raise exception 'Categoría reservada.' using errcode = 'P0001';
  end if;

  insert into public.movimientos_financieros (sistema_id, sede_id, turno_id, tipo, categoria, concepto, monto, metodo, creado_por)
  values (p_sistema, (select sede_id from public.turnos_caja where id = v_turno), v_turno, p_tipo,
    coalesce(nullif(trim(p_categoria), ''), 'general'), p_concepto, p_monto, p_metodo, auth.uid())
  returning * into v_mov;
  return v_mov;
end;
$function$;


CREATE OR REPLACE FUNCTION public.actualizar_linea_nomina(p_linea uuid, p_horas_extra numeric, p_bonos numeric, p_otros_ingresos numeric, p_otras_deducciones numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_sistema uuid;
begin
  select sistema_id into v_sistema from public.nomina_lineas where id = p_linea;
  if v_sistema is null or not privado.tiene_rol(v_sistema, '{admin,contabilidad,gerencia}', 'nomina') then
    raise exception 'Línea no encontrada o sin permiso.' using errcode = '42501';
  end if;
  update public.nomina_lineas set
    horas_extra = coalesce(p_horas_extra, 0), bonos = coalesce(p_bonos, 0),
    otros_ingresos = coalesce(p_otros_ingresos, 0), otras_deducciones = coalesce(p_otras_deducciones, 0)
  where id = p_linea;
  perform privado.calcular_linea_nomina(p_linea);
end;
$function$;

CREATE OR REPLACE FUNCTION public.aprobar_nomina(p_nomina uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  n public.nominas;
  v_asiento uuid;
begin
  select * into n from public.nominas where id = p_nomina for update;
  if n.id is null or not privado.tiene_rol(n.sistema_id, '{admin,contabilidad,gerencia}', 'nomina') then
    raise exception 'Nómina no encontrada o sin permiso.' using errcode = '42501';
  end if;
  if n.estado <> 'borrador' then
    raise exception 'La nómina ya está aprobada.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.nomina_lineas where nomina_id = p_nomina) then
    raise exception 'La nómina no tiene empleados.' using errcode = 'P0001';
  end if;

  v_asiento := privado.crear_asiento(n.sistema_id, n.hasta, n.descripcion || ' (' || n.numero || ')', 'nomina', n.id,
                                     privado.lineas_asiento_nomina(p_nomina));
  update public.nominas set estado = 'aprobada', aprobada_en = now(), aprobada_por = auth.uid() where id = p_nomina;
  return v_asiento;
end;
$function$;

CREATE OR REPLACE FUNCTION public.estado_cuenta(p_sistema uuid, p_tipo text, p_contacto uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with cargos as (
    select c.creado_en::date as fecha, 'cargo' as tipo, coalesce(c.ncf, c.numero) as documento,
           case when p_tipo = 'paciente' then 'Servicios ' || c.numero
                else 'Cobertura · ' || p.nombres || ' ' || p.apellidos || coalesce(' · Aut. ' || c.numero_autorizacion, '') end as descripcion,
           case when p_tipo = 'paciente' then c.monto_credito else c.cobertura_seguro + c.monto_fondo end as cargo,
           0::numeric as abono, c.creado_en as orden
      from public.cobros c
      join public.pacientes p on p.id = c.paciente_id
     where c.sistema_id = p_sistema
       and ((p_tipo = 'paciente' and c.paciente_id = p_contacto and c.monto_credito > 0)
         or (p_tipo = 'aseguradora' and c.aseguradora_id = p_contacto and c.cobertura_seguro + c.monto_fondo > 0))
       and not exists (select 1 from public.anulaciones_cobro x where x.cobro_id = c.id)
  ), pagos as (
    select b.fecha, 'abono', b.numero, 'Abono a ' || c.numero || ' · ' || b.metodo::text, 0::numeric, b.monto, b.creado_en
      from public.abonos b
      join public.cobros c on c.id = b.cobro_id
     where b.sistema_id = p_sistema and b.deudor = p_tipo
       and ((p_tipo = 'paciente' and c.paciente_id = p_contacto) or (p_tipo = 'aseguradora' and c.aseguradora_id = p_contacto))
  ), todo as (
    select * from cargos union all select * from pagos
  )
  select jsonb_build_object(
    'movimientos', coalesce((select jsonb_agg(jsonb_build_object('fecha', fecha, 'tipo', tipo, 'documento', documento,
                     'descripcion', descripcion, 'cargo', cargo, 'abono', abono) order by fecha, orden) from todo), '[]'::jsonb),
    'saldo', coalesce((select sum(cargo) - sum(abono) from todo), 0),
    'anticipos', case when p_tipo = 'paciente' then
                   coalesce((select jsonb_agg(jsonb_build_object('fecha', fecha, 'numero', numero, 'monto', monto, 'metodo', metodo) order by fecha)
                               from public.anticipos where sistema_id = p_sistema and paciente_id = p_contacto), '[]'::jsonb)
                 else '[]'::jsonb end,
    'saldo_anticipos', case when p_tipo = 'paciente' then
                   (select coalesce(sum(anticipado - aplicado), 0) from public.saldos_anticipo where sistema_id = p_sistema and paciente_id = p_contacto)
                 else 0 end
  );
$function$;

CREATE OR REPLACE FUNCTION public.exonerar_turno(p_cita uuid, p_motivo text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  c public.citas;
begin
  select * into c from public.citas where id = p_cita;
  if c.id is null or not privado.tiene_rol(c.sistema_id, '{admin}') then
    raise exception 'Solo administración puede exonerar el pago.' using errcode = '42501';
  end if;
  if c.paciente_id is null then
    raise exception 'Identifica al paciente antes de exonerarlo.' using errcode = 'P0001';
  end if;
  if c.estado <> 'por_cobrar' then
    raise exception 'Este paciente no está pendiente de cobro.' using errcode = 'P0001';
  end if;
  if char_length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Escribe el motivo de la exoneración.' using errcode = 'P0001';
  end if;
  update public.citas set exonerado_por = auth.uid(), motivo_exoneracion = trim(p_motivo) where id = p_cita;
  return privado.activar_turno(p_cita);
end;
$function$;

CREATE OR REPLACE FUNCTION public.generar_codigo_invitacion(p_descripcion text, p_sistema uuid, p_roles public.rol_sistema[], p_superadmin boolean, p_usos integer, p_dias integer)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes    bytea := extensions.gen_random_bytes(12);
  v_codigo   text := 'INV-';
begin
  if not privado.es_superadmin() then
    raise exception 'Solo la superadministración puede generar códigos.' using errcode = '42501';
  end if;

  if not coalesce(p_superadmin, false) and (p_sistema is null or not ('admin' = any(coalesce(p_roles, '{}')))) then
    raise exception 'Los códigos de invitación son solo para administradores. El resto del personal lo crea un admin desde Personal, con su nombre de usuario.' using errcode = 'P0001';
  end if;

  for i in 0..11 loop
    v_codigo := v_codigo || substr(v_alfabeto, (get_byte(v_bytes, i) % 32) + 1, 1);
    if i in (3, 7) then
      v_codigo := v_codigo || '-';
    end if;
  end loop;

  insert into public.codigos_invitacion
    (codigo_hash, pista, descripcion, sistema_id, roles, otorga_superadmin, usos_maximos, expira_en, creado_por)
  values (
    encode(extensions.digest(v_codigo, 'sha256'), 'hex'),
    right(v_codigo, 4),
    nullif(trim(p_descripcion), ''),
    case when coalesce(p_superadmin, false) and p_sistema is null then null else p_sistema end,
    coalesce(p_roles, '{}'),
    coalesce(p_superadmin, false),
    greatest(1, least(coalesce(p_usos, 1), 500)),
    now() + make_interval(days => greatest(1, least(coalesce(p_dias, 7), 365))),
    auth.uid()
  );
  return v_codigo;
end;
$function$;

CREATE OR REPLACE FUNCTION public.llamar_turno(p_cita uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  c public.citas;
begin
  select * into c from public.citas where id = p_cita for update;
  if c.id is null or not privado.tiene_rol(c.sistema_id, '{medico,psicologia,nutricion,terapia}') then
    raise exception 'Turno no encontrado o sin permiso.' using errcode = '42501';
  end if;
  if c.estado not in ('en_espera', 'llamado') then
    raise exception 'Ese paciente ya no está en espera.' using errcode = 'P0001';
  end if;
  if not (c.medico_id = auth.uid() or (c.medico_id is null and c.especialidad in (select privado.mis_especialidades()))) then
    raise exception 'Ese turno es de otro médico.' using errcode = '42501';
  end if;
  update public.citas set
    medico_id = auth.uid(), estado = 'llamado', llamado_en = now(), llamado_veces = llamado_veces + 1
  where id = p_cita;
  -- Pago por paciente: el cobro de esta cita es de quien lo atiende.
  perform privado.fijar_profesional(k.id, auth.uid())
     from public.cobros k
    where k.cita_id = c.id
      and not exists (select 1 from public.anulaciones_cobro a where a.cobro_id = k.id);
  return jsonb_build_object('id', c.id, 'turno', c.turno, 'paciente_id', c.paciente_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.recalcular_nomina(p_nomina uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  n public.nominas;
  l record;
begin
  select * into n from public.nominas where id = p_nomina;
  if n.id is null or not privado.tiene_rol(n.sistema_id, '{admin,contabilidad,gerencia}', 'nomina') then
    raise exception 'Nómina no encontrada o sin permiso.' using errcode = '42501';
  end if;
  for l in select id from public.nomina_lineas where nomina_id = p_nomina loop
    perform privado.calcular_linea_nomina(l.id);
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.vista_previa_asiento_nomina(p_nomina uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  n public.nominas;
begin
  select * into n from public.nominas where id = p_nomina;
  if n.id is null or not privado.tiene_rol(n.sistema_id, '{admin,contabilidad,gerencia,auditor}', 'nomina') then
    raise exception 'Nómina no encontrada o sin permiso.' using errcode = '42501';
  end if;
  return (
    select jsonb_agg(l || jsonb_build_object('nombre', c.nombre))
      from jsonb_array_elements(privado.lineas_asiento_nomina(p_nomina)) l
      left join public.cuentas_contables c on c.sistema_id = n.sistema_id and c.codigo = l ->> 'cuenta'
     where coalesce((l ->> 'debe')::numeric, (l ->> 'haber')::numeric, 0) > 0
  );
end;
$function$;


CREATE OR REPLACE FUNCTION public.importar_coberturas(p_sistema uuid, p_aseguradora uuid, p_filas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  f jsonb;
  v_serv uuid;
  v_existia boolean;
  c int := 0; a int := 0; o int := 0;
  e text[] := '{}';
  v_fila text;
begin
  if not privado.tiene_rol(p_sistema, '{admin}', 'catalogos') then
    raise exception 'Solo administración importa tarifarios.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.aseguradoras where id = p_aseguradora and sistema_id = p_sistema) then
    raise exception 'Aseguradora no encontrada.' using errcode = 'P0001';
  end if;
  for f in select * from jsonb_array_elements(p_filas) loop
    v_fila := coalesce(f ->> '_fila', '?');
    begin
      v_serv := null;
      if privado.texto(f, 'codigo') is not null then
        select id into v_serv from public.servicios where sistema_id = p_sistema and codigo = privado.texto(f, 'codigo') limit 1;
      end if;
      if v_serv is null and privado.texto(f, 'servicio') is not null then
        select id into v_serv from public.servicios where sistema_id = p_sistema and lower(nombre) = lower(privado.texto(f, 'servicio'));
      end if;
      if v_serv is null then
        o := o + 1;
        e := e || ('Fila ' || v_fila || ': servicio "' || coalesce(privado.texto(f, 'codigo'), privado.texto(f, 'servicio'), '?') || '" no existe en el catálogo.');
        continue;
      end if;
      select exists (select 1 from public.coberturas where aseguradora_id = p_aseguradora and servicio_id = v_serv) into v_existia;
      -- Monto cubierto explícito, o derivado del total pactado menos la diferencia del paciente.
      insert into public.coberturas (sistema_id, aseguradora_id, servicio_id, monto_cubierto, precio, monto_fondo)
      values (p_sistema, p_aseguradora, v_serv,
              coalesce(privado.numero(f, 'monto_cubierto'),
                       privado.numero(f, 'precio') - privado.numero(f, 'monto_paciente')),
              privado.numero(f, 'precio'), privado.numero(f, 'monto_fondo'))
      on conflict (aseguradora_id, servicio_id) do update
        set monto_cubierto = excluded.monto_cubierto, precio = excluded.precio, monto_fondo = excluded.monto_fondo;
      if v_existia then a := a + 1; else c := c + 1; end if;
    exception when others then
      o := o + 1;
      e := e || ('Fila ' || v_fila || ': ' || sqlerrm);
    end;
  end loop;
  return privado.resultado_importacion(c, a, o, e);
end;
$function$;

CREATE OR REPLACE FUNCTION public.importar_cuentas_contables(p_sistema uuid, p_filas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  f record;
  v_codigo text;
  v_padre text;
  v_tipo text;
  v_existe boolean;
  v_nuevas text[] := '{}';
  c int := 0; a int := 0; o int := 0;
  e text[] := '{}';
begin
  if not (privado.tiene_rol(p_sistema, '{contabilidad}', 'contabilidad') or privado.es_superadmin()) then
    raise exception 'El catálogo de cuentas solo lo cambia el contador.' using errcode = '42501';
  end if;

  -- Padres antes que hijas.
  for f in
    select x, coalesce(x ->> '_fila', '?') as fila, regexp_replace(coalesce(privado.texto(x, 'codigo'), ''), '[\s-]+', '', 'g') as codigo
      from jsonb_array_elements(p_filas) x
     order by array_length(string_to_array(regexp_replace(coalesce(privado.texto(x, 'codigo'), ''), '[\s-]+', '', 'g'), '.'), 1) nulls last
  loop
    begin
      v_existe := false;
      v_codigo := f.codigo;
      if v_codigo !~ '^[0-9]+(\.[0-9]+)*$' then
        o := o + 1;
        e := e || ('Fila ' || f.fila || ': código "' || coalesce(privado.texto(f.x, 'codigo'), '') || '" no válido (ej. 6.2.05).');
        continue;
      end if;
      if privado.texto(f.x, 'nombre') is null then
        o := o + 1;
        e := e || ('Fila ' || f.fila || ': falta el nombre de la cuenta.');
        continue;
      end if;
      v_padre := nullif(regexp_replace(v_codigo, '\.?[0-9]+$', ''), '');
      if v_padre is not null and not exists (select 1 from public.cuentas_contables where sistema_id = p_sistema and codigo = v_padre) then
        v_padre := null;
      end if;
      v_tipo := coalesce(privado.texto(f.x, 'tipo'), case left(v_codigo, 1)
        when '1' then 'activo' when '2' then 'pasivo' when '3' then 'patrimonio'
        when '4' then 'ingreso' when '5' then 'costo' else 'gasto' end);
      v_existe := exists (select 1 from public.cuentas_contables where sistema_id = p_sistema and codigo = v_codigo);

      if v_existe then
        update public.cuentas_contables set
          nombre = privado.texto(f.x, 'nombre'),
          tipo = v_tipo,
          padre_codigo = coalesce(v_padre, padre_codigo),
          acepta_movimiento = coalesce((f.x ->> 'acepta_movimiento')::boolean, acepta_movimiento),
          activo = true
        where sistema_id = p_sistema and codigo = v_codigo;
        a := a + 1;
      else
        insert into public.cuentas_contables (sistema_id, codigo, nombre, tipo, padre_codigo, acepta_movimiento)
        values (p_sistema, v_codigo, privado.texto(f.x, 'nombre'), v_tipo, v_padre, coalesce((f.x ->> 'acepta_movimiento')::boolean, true));
        v_nuevas := v_nuevas || v_codigo;
        c := c + 1;
      end if;
    exception when others then
      o := o + 1;
      e := e || ('Fila ' || f.fila || ': ' || sqlerrm);
    end;
  end loop;

  update public.cuentas_contables p set acepta_movimiento = false
   where p.sistema_id = p_sistema and p.codigo = any (v_nuevas)
     and exists (select 1 from public.cuentas_contables h where h.sistema_id = p_sistema and h.padre_codigo = p.codigo);

  return privado.resultado_importacion(c, a, o, e);
end;
$function$;

CREATE OR REPLACE FUNCTION public.importar_empleados(p_sistema uuid, p_filas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  f jsonb;
  v_id uuid;
  c int := 0; a int := 0; o int := 0;
  e text[] := '{}';
  v_fila text;
begin
  if not privado.tiene_rol(p_sistema, '{admin,contabilidad,gerencia}', 'nomina') then
    raise exception 'No tienes permiso para importar empleados.' using errcode = '42501';
  end if;

  for f in select * from jsonb_array_elements(p_filas) loop
    v_fila := coalesce(f ->> '_fila', '?');
    begin
      if privado.texto(f, 'nombres') is null then
        o := o + 1;
        e := e || ('Fila ' || v_fila || ': sin nombre, omitida.');
        continue;
      end if;
      v_id := null;
      if privado.texto(f, 'cedula') is not null then
        select id into v_id from public.empleados where sistema_id = p_sistema and cedula = privado.texto(f, 'cedula');
      end if;
      if v_id is null then
        select id into v_id from public.empleados where sistema_id = p_sistema
           and lower(nombres) = lower(privado.texto(f, 'nombres')) and lower(apellidos) = lower(coalesce(privado.texto(f, 'apellidos'), '-')) limit 1;
      end if;

      if v_id is null then
        insert into public.empleados (sistema_id, nombres, apellidos, cedula, cargo, departamento, fecha_ingreso, salario_mensual,
          frecuencia, banco, cuenta_bancaria)
        values (p_sistema, privado.texto(f, 'nombres'), coalesce(privado.texto(f, 'apellidos'), '-'), privado.texto(f, 'cedula'),
          privado.texto(f, 'cargo'), privado.texto(f, 'departamento'), (privado.texto(f, 'fecha_ingreso'))::date,
          coalesce(privado.numero(f, 'salario_mensual'), 0), coalesce(privado.texto(f, 'frecuencia'), 'mensual'),
          privado.texto(f, 'banco'), privado.texto(f, 'cuenta_bancaria'));
        c := c + 1;
      else
        update public.empleados set
          cedula = coalesce(privado.texto(f, 'cedula'), cedula),
          cargo = coalesce(privado.texto(f, 'cargo'), cargo),
          departamento = coalesce(privado.texto(f, 'departamento'), departamento),
          fecha_ingreso = coalesce((privado.texto(f, 'fecha_ingreso'))::date, fecha_ingreso),
          salario_mensual = coalesce(privado.numero(f, 'salario_mensual'), salario_mensual),
          frecuencia = coalesce(privado.texto(f, 'frecuencia'), frecuencia),
          banco = coalesce(privado.texto(f, 'banco'), banco),
          cuenta_bancaria = coalesce(privado.texto(f, 'cuenta_bancaria'), cuenta_bancaria),
          activo = true
        where id = v_id;
        a := a + 1;
      end if;
    exception when others then
      o := o + 1;
      e := e || ('Fila ' || v_fila || ': ' || sqlerrm);
    end;
  end loop;
  return privado.resultado_importacion(c, a, o, e);
end;
$function$;

CREATE OR REPLACE FUNCTION public.importar_escala_isr(p_sistema uuid, p_filas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_tramos jsonb;
  v_escala jsonb := '[]';
  t record;
  v_anterior numeric := 0;
  v_n int;
begin
  if not privado.es_superadmin() then
    raise exception 'Los parámetros de TSS e ISR solo los cambia el soporte de MEDORA.' using errcode = '42501';
  end if;

  select jsonb_agg(x order by (x ->> 'hasta') is null, (x ->> 'hasta')::numeric), count(*)
    into v_tramos, v_n
    from (
      select jsonb_build_object('hasta', privado.numero(f, 'hasta'), 'tasa', coalesce(privado.numero(f, 'tasa'), 0),
                                'fijo', coalesce(privado.numero(f, 'fijo'), 0)) x
        from jsonb_array_elements(p_filas) f
       where privado.numero(f, 'hasta') is not null or privado.numero(f, 'tasa') is not null
    ) s;
  if coalesce(v_n, 0) < 2 then
    raise exception 'La escala necesita al menos dos tramos (el exento y uno gravado).' using errcode = 'P0001';
  end if;

  for t in select value as x, ordinality as i from jsonb_array_elements(v_tramos) with ordinality loop
    if (t.x ->> 'tasa')::numeric not between 0 and 100 then
      raise exception 'Tramo %: la tasa debe estar entre 0 y 100.', t.i using errcode = 'P0001';
    end if;
    v_escala := v_escala || jsonb_build_array(jsonb_build_object(
      'hasta', case when t.i = v_n then null else (t.x ->> 'hasta')::numeric end,
      'exceso_de', case when t.i = 1 then 0 else v_anterior + 0.01 end,
      'tasa', (t.x ->> 'tasa')::numeric,
      'fijo', (t.x ->> 'fijo')::numeric));
    v_anterior := (t.x ->> 'hasta')::numeric;
  end loop;

  insert into public.parametros_nomina (sistema_id, escala_isr) values (p_sistema, v_escala)
  on conflict (sistema_id) do update set escala_isr = excluded.escala_isr;
  return privado.resultado_importacion(0, v_n, 0, '{}');
end;
$function$;


CREATE OR REPLACE FUNCTION public.importar_inventario(p_sistema uuid, p_filas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  f jsonb;
  v_item public.inventario_items;
  v_existencia numeric;
  v_delta numeric;
  c int := 0; a int := 0; o int := 0;
  e text[] := '{}';
  v_fila text;
begin
  if not privado.tiene_rol(p_sistema, '{admin,farmacia}', 'inventario') then
    raise exception 'Solo farmacia o administración importan inventario.' using errcode = '42501';
  end if;

  for f in select * from jsonb_array_elements(p_filas) loop
    v_fila := coalesce(f ->> '_fila', '?');
    begin
      if privado.texto(f, 'nombre') is null then
        o := o + 1;
        e := e || ('Fila ' || v_fila || ': sin nombre, omitida.');
        continue;
      end if;

      v_item := null;
      if privado.texto(f, 'codigo') is not null then
        select * into v_item from public.inventario_items where sistema_id = p_sistema and codigo = privado.texto(f, 'codigo');
      end if;
      if v_item.id is null then
        select * into v_item from public.inventario_items
         where sistema_id = p_sistema and lower(nombre) = lower(privado.texto(f, 'nombre')) limit 1;
      end if;

      if v_item.id is null then
        insert into public.inventario_items (sistema_id, codigo, nombre, descripcion, categoria, unidad, stock_minimo,
          costo_unitario, precio_venta, requiere_receta)
        values (p_sistema, privado.texto(f, 'codigo'), privado.texto(f, 'nombre'), privado.texto(f, 'descripcion'),
          coalesce(privado.texto(f, 'categoria'), 'medicamento'), coalesce(privado.texto(f, 'unidad'), 'unidad'),
          coalesce(privado.numero(f, 'stock_minimo'), 0), privado.numero(f, 'costo_unitario'), privado.numero(f, 'precio_venta'),
          coalesce((f ->> 'requiere_receta')::boolean, false))
        returning * into v_item;
        c := c + 1;
      else
        update public.inventario_items set
          codigo = coalesce(privado.texto(f, 'codigo'), codigo),
          descripcion = coalesce(privado.texto(f, 'descripcion'), descripcion),
          categoria = coalesce(privado.texto(f, 'categoria'), categoria),
          unidad = coalesce(privado.texto(f, 'unidad'), unidad),
          stock_minimo = coalesce(privado.numero(f, 'stock_minimo'), stock_minimo),
          costo_unitario = coalesce(privado.numero(f, 'costo_unitario'), costo_unitario),
          precio_venta = coalesce(privado.numero(f, 'precio_venta'), precio_venta),
          requiere_receta = coalesce((f ->> 'requiere_receta')::boolean, requiere_receta),
          activo = true
        where id = v_item.id
        returning * into v_item;
        a := a + 1;
      end if;

      v_existencia := privado.numero(f, 'existencia');
      if v_existencia is not null and v_existencia >= 0 then
        v_delta := v_existencia - v_item.stock_actual;
        if v_delta <> 0 then
          insert into public.movimientos_inventario (sistema_id, item_id, tipo, cantidad, lote, vence_en, motivo, creado_por)
          values (p_sistema, v_item.id,
                  case when v_item.stock_actual = 0 and v_delta > 0 then 'entrada' else 'ajuste' end,
                  v_delta, privado.texto(f, 'lote'), (privado.texto(f, 'vence_en'))::date,
                  case when v_item.stock_actual = 0 then 'Carga inicial desde Excel' else 'Ajuste por conteo (Excel)' end,
                  auth.uid());
        end if;
      end if;
    exception when others then
      o := o + 1;
      e := e || ('Fila ' || v_fila || ': ' || sqlerrm);
    end;
  end loop;

  return privado.resultado_importacion(c, a, o, e);
end;
$function$;

CREATE OR REPLACE FUNCTION public.importar_movimientos_inventario(p_sistema uuid, p_filas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  f jsonb;
  v_item uuid;
  v_tipo text;
  c int := 0; o int := 0;
  e text[] := '{}';
  v_fila text;
begin
  if not privado.tiene_rol(p_sistema, '{admin,farmacia}', 'inventario') then
    raise exception 'Solo farmacia o administración importan movimientos.' using errcode = '42501';
  end if;

  for f in select * from jsonb_array_elements(p_filas) loop
    v_fila := coalesce(f ->> '_fila', '?');
    begin
      v_item := null;
      if privado.texto(f, 'codigo') is not null then
        select id into v_item from public.inventario_items where sistema_id = p_sistema and codigo = privado.texto(f, 'codigo');
      end if;
      if v_item is null and privado.texto(f, 'nombre') is not null then
        select id into v_item from public.inventario_items where sistema_id = p_sistema and lower(nombre) = lower(privado.texto(f, 'nombre')) limit 1;
      end if;
      if v_item is null then
        o := o + 1;
        e := e || ('Fila ' || v_fila || ': artículo "' || coalesce(privado.texto(f, 'codigo'), privado.texto(f, 'nombre'), '?') || '" no existe en el inventario.');
        continue;
      end if;

      v_tipo := coalesce(privado.texto(f, 'tipo'), 'entrada');
      insert into public.movimientos_inventario (sistema_id, item_id, tipo, cantidad, lote, vence_en, motivo, creado_por)
      values (p_sistema, v_item, v_tipo,
              case when v_tipo = 'ajuste' then privado.numero(f, 'cantidad') else abs(privado.numero(f, 'cantidad')) end,
              privado.texto(f, 'lote'), (privado.texto(f, 'vence_en'))::date,
              coalesce(privado.texto(f, 'motivo'), 'Importado desde Excel')
                || coalesce(' · ' || privado.texto(f, 'fecha'), ''),
              auth.uid());
      c := c + 1;
    exception when others then
      o := o + 1;
      e := e || ('Fila ' || v_fila || ': ' || sqlerrm);
    end;
  end loop;

  return privado.resultado_importacion(c, 0, o, e);
end;
$function$;

CREATE OR REPLACE FUNCTION public.importar_pacientes(p_sistema uuid, p_filas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  f jsonb;
  v_id uuid;
  v_aseg uuid;
  c int := 0; a int := 0; o int := 0;
  e text[] := '{}';
  v_fila text;
begin
  if not privado.tiene_rol(p_sistema, '{admin,recepcion,medico,enfermeria,caja,psicologia,nutricion,terapia}', 'pacientes') then
    raise exception 'No tienes permiso para importar pacientes.' using errcode = '42501';
  end if;

  for f in select * from jsonb_array_elements(p_filas) loop
    v_fila := coalesce(f ->> '_fila', '?');
    begin
      if privado.texto(f, 'nombres') is null then
        o := o + 1;
        e := e || ('Fila ' || v_fila || ': sin nombre, omitida.');
        continue;
      end if;

      v_aseg := null;
      if privado.texto(f, 'aseguradora') is not null then
        select id into v_aseg from public.aseguradoras
         where sistema_id = p_sistema and lower(nombre) = lower(privado.texto(f, 'aseguradora'));
        if v_aseg is null then
          e := e || ('Fila ' || v_fila || ': aseguradora "' || privado.texto(f, 'aseguradora') || '" no existe; se importó sin seguro.');
        end if;
      end if;

      v_id := null;
      if privado.texto(f, 'documento') is not null then
        select id into v_id from public.pacientes
         where sistema_id = p_sistema and documento = privado.texto(f, 'documento') and eliminado_en is null limit 1;
      end if;
      if v_id is null then
        select id into v_id from public.pacientes
         where sistema_id = p_sistema and eliminado_en is null
           and lower(nombres) = lower(privado.texto(f, 'nombres'))
           and lower(apellidos) = lower(coalesce(privado.texto(f, 'apellidos'), '-'))
           and (privado.texto(f, 'fecha_nacimiento') is null or fecha_nacimiento is null
                or fecha_nacimiento = (f ->> 'fecha_nacimiento')::date)
         limit 1;
      end if;

      if v_id is not null then
        update public.pacientes p set
          documento = coalesce(p.documento, privado.texto(f, 'documento')),
          documento_tipo = case when p.documento is null and privado.texto(f, 'documento_tipo') is not null
                                then privado.texto(f, 'documento_tipo') else p.documento_tipo end,
          fecha_nacimiento = coalesce(p.fecha_nacimiento, (privado.texto(f, 'fecha_nacimiento'))::date),
          sexo = coalesce(p.sexo, privado.texto(f, 'sexo')),
          telefono = coalesce(p.telefono, privado.texto(f, 'telefono')),
          email = coalesce(p.email, privado.texto(f, 'email')),
          direccion = coalesce(p.direccion, privado.texto(f, 'direccion')),
          tipo_sangre = coalesce(p.tipo_sangre, privado.texto(f, 'tipo_sangre')),
          alergias = coalesce(p.alergias, privado.texto(f, 'alergias')),
          condiciones_cronicas = coalesce(p.condiciones_cronicas, privado.texto(f, 'condiciones_cronicas')),
          aseguradora_id = coalesce(p.aseguradora_id, v_aseg),
          numero_afiliado = coalesce(p.numero_afiliado, privado.texto(f, 'numero_afiliado')),
          contacto_emergencia_nombre = coalesce(p.contacto_emergencia_nombre, privado.texto(f, 'contacto_emergencia_nombre')),
          contacto_emergencia_telefono = coalesce(p.contacto_emergencia_telefono, privado.texto(f, 'contacto_emergencia_telefono')),
          notas = coalesce(p.notas, privado.texto(f, 'notas'))
        where p.id = v_id;
        a := a + 1;
      else
        insert into public.pacientes (sistema_id, expediente, nombres, apellidos, documento_tipo, documento, fecha_nacimiento, sexo,
          telefono, email, direccion, tipo_sangre, alergias, condiciones_cronicas, aseguradora_id, numero_afiliado,
          contacto_emergencia_nombre, contacto_emergencia_telefono, notas)
        values (p_sistema, coalesce(privado.texto(f, 'expediente'), ''), privado.texto(f, 'nombres'),
          coalesce(privado.texto(f, 'apellidos'), '-'), coalesce(privado.texto(f, 'documento_tipo'), 'cedula'),
          privado.texto(f, 'documento'), (privado.texto(f, 'fecha_nacimiento'))::date, privado.texto(f, 'sexo'),
          privado.texto(f, 'telefono'), privado.texto(f, 'email'), privado.texto(f, 'direccion'), privado.texto(f, 'tipo_sangre'),
          privado.texto(f, 'alergias'), privado.texto(f, 'condiciones_cronicas'), v_aseg, privado.texto(f, 'numero_afiliado'),
          privado.texto(f, 'contacto_emergencia_nombre'), privado.texto(f, 'contacto_emergencia_telefono'), privado.texto(f, 'notas'));
        c := c + 1;
      end if;
    exception when others then
      o := o + 1;
      e := e || ('Fila ' || v_fila || ': ' || sqlerrm);
    end;
  end loop;

  return privado.resultado_importacion(c, a, o, e);
end;
$function$;


CREATE OR REPLACE FUNCTION public.importar_parametros_nomina(p_sistema uuid, p_filas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  f jsonb;
  v_clave text;
  v_valor numeric;
  v_columna text;
  a int := 0; o int := 0;
  e text[] := '{}';
  v_fila text;
begin
  if not privado.es_superadmin() then
    raise exception 'Los parámetros de TSS e ISR solo los cambia el soporte de MEDORA.' using errcode = '42501';
  end if;
  insert into public.parametros_nomina (sistema_id) values (p_sistema) on conflict do nothing;

  for f in select * from jsonb_array_elements(p_filas) loop
    v_fila := coalesce(f ->> '_fila', '?');
    v_clave := privado.clave_texto(privado.texto(f, 'concepto'));
    v_valor := privado.numero(f, 'valor');
    v_columna := case
      when v_clave ~ 'tope' and v_clave ~ 'afp' then 'tope_afp_mensual'
      when v_clave ~ 'tope' and v_clave ~ 'sfs|salud' then 'tope_sfs_mensual'
      when v_clave ~ 'afp|pension' and v_clave ~ 'emplead[oa]r|patron' then 'afp_empleador'
      when v_clave ~ 'afp|pension' then 'afp_empleado'
      when v_clave ~ 'sfs|salud' and v_clave ~ 'emplead[oa]r|patron' then 'sfs_empleador'
      when v_clave ~ 'sfs|salud' then 'sfs_empleado'
      when v_clave ~ 'srl|riesgo' then 'srl_empleador'
      when v_clave ~ 'infotep' then 'infotep'
    end;
    if v_columna is null then
      o := o + 1;
      e := e || ('Fila ' || v_fila || ': concepto "' || coalesce(privado.texto(f, 'concepto'), '') || '" no reconocido.');
      continue;
    end if;
    if v_columna like 'tope%' then
      if v_valor is not null and v_valor <= 0 then v_valor := null; end if;  -- 0 o vacío = sin tope
    elsif v_valor is null or v_valor < 0 or v_valor > 100 then
      o := o + 1;
      e := e || ('Fila ' || v_fila || ': el porcentaje debe estar entre 0 y 100.');
      continue;
    end if;
    execute format('update public.parametros_nomina set %I = $1 where sistema_id = $2', v_columna) using v_valor, p_sistema;
    a := a + 1;
  end loop;
  return privado.resultado_importacion(0, a, o, e);
end;
$function$;

CREATE OR REPLACE FUNCTION public.importar_proveedores(p_sistema uuid, p_filas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  f jsonb;
  v_id uuid;
  c int := 0; a int := 0; o int := 0;
  e text[] := '{}';
  v_fila text;
begin
  if not privado.tiene_rol(p_sistema, '{admin,farmacia,contabilidad,gerencia}', 'compras') then
    raise exception 'No tienes permiso para importar proveedores.' using errcode = '42501';
  end if;
  for f in select * from jsonb_array_elements(p_filas) loop
    v_fila := coalesce(f ->> '_fila', '?');
    begin
      if privado.texto(f, 'nombre') is null then
        o := o + 1;
        e := e || ('Fila ' || v_fila || ': sin nombre, omitida.');
        continue;
      end if;
      v_id := null;
      if privado.texto(f, 'rnc') is not null then
        select id into v_id from public.proveedores where sistema_id = p_sistema and rnc = privado.texto(f, 'rnc');
      end if;
      if v_id is null then
        select id into v_id from public.proveedores where sistema_id = p_sistema and lower(nombre) = lower(privado.texto(f, 'nombre')) limit 1;
      end if;
      if v_id is null then
        insert into public.proveedores (sistema_id, nombre, rnc, telefono, email, contacto, direccion)
        values (p_sistema, privado.texto(f, 'nombre'), privado.texto(f, 'rnc'), privado.texto(f, 'telefono'),
          privado.texto(f, 'email'), privado.texto(f, 'contacto'), privado.texto(f, 'direccion'));
        c := c + 1;
      else
        update public.proveedores set
          rnc = coalesce(privado.texto(f, 'rnc'), rnc),
          telefono = coalesce(privado.texto(f, 'telefono'), telefono),
          email = coalesce(privado.texto(f, 'email'), email),
          contacto = coalesce(privado.texto(f, 'contacto'), contacto),
          direccion = coalesce(privado.texto(f, 'direccion'), direccion),
          activo = true
        where id = v_id;
        a := a + 1;
      end if;
    exception when others then
      o := o + 1;
      e := e || ('Fila ' || v_fila || ': ' || sqlerrm);
    end;
  end loop;
  return privado.resultado_importacion(c, a, o, e);
end;
$function$;

CREATE OR REPLACE FUNCTION public.importar_reglas_comision(p_sistema uuid, p_filas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  f jsonb;
  v_id uuid;
  v_persona uuid;
  v_rol public.rol_sistema;
  v_servicio uuid;
  v_categoria text;
  v_tipo text;
  v_valor numeric;
  v_nombre text;
  v_aplica text;
  c int := 0; a int := 0; o int := 0;
  e text[] := '{}';
  v_fila text;
begin
  if not privado.tiene_rol(p_sistema, '{admin,contabilidad,gerencia}', 'comisiones') then
    raise exception 'No tienes permiso para configurar comisiones.' using errcode = '42501';
  end if;

  for f in select * from jsonb_array_elements(p_filas) loop
    v_fila := coalesce(f ->> '_fila', '?');
    begin
      v_persona := null; v_rol := null; v_servicio := null; v_categoria := null;

      if privado.texto(f, 'persona') is not null then
        select m.usuario_id into v_persona
          from public.membresias m join public.perfiles p on p.id = m.usuario_id
         where m.sistema_id = p_sistema and m.activo
           and (p.nombre_usuario = lower(privado.texto(f, 'persona'))
                or privado.clave_texto(p.nombre_completo) = privado.clave_texto(privado.texto(f, 'persona')))
         limit 1;
        if v_persona is null then
          o := o + 1;
          e := e || ('Fila ' || v_fila || ': no hay nadie del personal llamado "' || privado.texto(f, 'persona') || '".');
          continue;
        end if;
      else
        v_rol := coalesce(privado.texto(f, 'rol'), case when privado.texto(f, 'especialidad') is null then 'medico' end)::public.rol_sistema;
      end if;

      if privado.texto(f, 'servicio') is not null then
        select s.id into v_servicio from public.servicios s
         where s.sistema_id = p_sistema
           and (lower(s.codigo) = lower(privado.texto(f, 'servicio'))
                or privado.clave_texto(s.nombre) = privado.clave_texto(privado.texto(f, 'servicio')))
         limit 1;
        if v_servicio is null then
          o := o + 1;
          e := e || ('Fila ' || v_fila || ': el servicio "' || privado.texto(f, 'servicio') || '" no existe en el catálogo.');
          continue;
        end if;
      else
        v_categoria := privado.texto(f, 'categoria');
      end if;

      v_tipo := coalesce(privado.texto(f, 'tipo'), 'porcentaje');
      v_valor := privado.numero(f, 'valor');
      if v_valor is null or v_valor <= 0 or (v_tipo = 'porcentaje' and v_valor > 100) then
        o := o + 1;
        e := e || ('Fila ' || v_fila || ': el valor debe ser mayor que 0' || case when v_tipo = 'porcentaje' then ' y no pasar de 100%.' else '.' end);
        continue;
      end if;
      v_aplica := coalesce(privado.texto(f, 'aplica_a'), 'profesional');

      v_nombre := coalesce(privado.texto(f, 'nombre'), left(concat_ws(' · ',
        coalesce(privado.texto(f, 'persona'), privado.texto(f, 'especialidad'), initcap(v_rol::text)),
        coalesce(privado.texto(f, 'servicio'), v_categoria, 'todos los servicios'),
        case when v_tipo = 'fijo' then 'RD$' || v_valor || ' c/u' else v_valor || '%' end), 120));

      select id into v_id from public.reglas_comision where sistema_id = p_sistema and lower(nombre) = lower(v_nombre) limit 1;
      if v_id is null then
        insert into public.reglas_comision (sistema_id, nombre, aplica_a, beneficiario_id, rol, servicio_id, categoria, tipo, valor, base,
                                            vigente_desde, vigente_hasta, especialidad, retencion)
        values (p_sistema, v_nombre, v_aplica, v_persona, v_rol, v_servicio, v_categoria, v_tipo, v_valor,
                coalesce(privado.texto(f, 'base'), 'bruto'), (privado.texto(f, 'vigente_desde'))::date, (privado.texto(f, 'vigente_hasta'))::date, privado.texto(f, 'especialidad'), coalesce(privado.numero(f, 'retencion'), 0));
        c := c + 1;
      else
        update public.reglas_comision set
          aplica_a = v_aplica, beneficiario_id = v_persona, rol = v_rol, servicio_id = v_servicio, categoria = v_categoria,
          tipo = v_tipo, valor = v_valor, base = coalesce(privado.texto(f, 'base'), base),
          vigente_desde = coalesce((privado.texto(f, 'vigente_desde'))::date, vigente_desde),
          vigente_hasta = coalesce((privado.texto(f, 'vigente_hasta'))::date, vigente_hasta),
          especialidad = privado.texto(f, 'especialidad'), retencion = coalesce(privado.numero(f, 'retencion'), retencion),
          activo = true
        where id = v_id;
        a := a + 1;
      end if;
      v_id := null;
    exception when others then
      o := o + 1;
      e := e || ('Fila ' || v_fila || ': ' || sqlerrm);
    end;
  end loop;
  return privado.resultado_importacion(c, a, o, e);
end;
$function$;

CREATE OR REPLACE FUNCTION public.importar_servicios(p_sistema uuid, p_filas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  f jsonb;
  v_id uuid;
  c int := 0; a int := 0; o int := 0;
  e text[] := '{}';
  v_fila text;
begin
  if not privado.tiene_rol(p_sistema, '{admin}', 'catalogos') then
    raise exception 'Solo administración importa servicios.' using errcode = '42501';
  end if;
  for f in select * from jsonb_array_elements(p_filas) loop
    v_fila := coalesce(f ->> '_fila', '?');
    begin
      if privado.texto(f, 'nombre') is null then
        o := o + 1;
        e := e || ('Fila ' || v_fila || ': sin nombre, omitida.');
        continue;
      end if;
      v_id := null;
      if privado.texto(f, 'codigo') is not null then
        select id into v_id from public.servicios where sistema_id = p_sistema and codigo = privado.texto(f, 'codigo') limit 1;
      end if;
      if v_id is null then
        select id into v_id from public.servicios where sistema_id = p_sistema and lower(nombre) = lower(privado.texto(f, 'nombre'));
      end if;
      if v_id is null then
        insert into public.servicios (sistema_id, codigo, nombre, categoria, precio, duracion_min)
        values (p_sistema, privado.texto(f, 'codigo'), privado.texto(f, 'nombre'), coalesce(privado.texto(f, 'categoria'), 'consulta'),
          coalesce(privado.numero(f, 'precio'), 0), coalesce(privado.numero(f, 'duracion_min')::int, 30));
        c := c + 1;
      else
        update public.servicios set
          codigo = coalesce(privado.texto(f, 'codigo'), codigo),
          categoria = coalesce(privado.texto(f, 'categoria'), categoria),
          precio = coalesce(privado.numero(f, 'precio'), precio),
          duracion_min = coalesce(privado.numero(f, 'duracion_min')::int, duracion_min),
          activo = true
        where id = v_id;
        a := a + 1;
      end if;
    exception when others then
      o := o + 1;
      e := e || ('Fila ' || v_fila || ': ' || sqlerrm);
    end;
  end loop;
  return privado.resultado_importacion(c, a, o, e);
end;
$function$;


-- Las RPC anteriores no se exponen a anon (los privilegios por defecto ya están revocados).