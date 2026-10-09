-- Aplicada en producción el 7/10/2026 desde otra máquina sin subirla al repo; texto recuperado
-- de supabase_migrations.schema_migrations el 9/10/2026.
create or replace function public.cobros_sin_medico(p_sistema uuid, p_desde date, p_hasta date)
 returns table(cobro_id uuid, numero text, creado_en timestamp with time zone, paciente text, especialidad text, turno text, total numeric)
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
begin
  if not privado.tiene_rol(p_sistema, '{admin,caja,gerencia,contabilidad,auditor}', 'caja') then
    raise exception 'Sin permiso.' using errcode = '42501';
  end if;
  return query
    select co.id, co.numero, co.creado_en,
           trim(coalesce(p.nombres, '') || ' ' || coalesce(p.apellidos, '')),
           coalesce(ci.especialidad,
                    (select d.descripcion from public.cobro_detalles d
                      where d.cobro_id = co.id
                        and d.categoria in ('consulta','procedimiento','imagen','laboratorio')
                      order by d.descripcion limit 1)),
           ci.turno, co.total
      from public.cobros co
      left join public.citas ci on ci.id = co.cita_id
      left join public.pacientes p on p.id = co.paciente_id
     where co.sistema_id = p_sistema and co.profesional_id is null
       and (co.creado_en at time zone 'America/Santo_Domingo')::date between p_desde and p_hasta
       and not exists (select 1 from public.anulaciones_cobro a where a.cobro_id = co.id)
       and (co.cita_id is not null
            or exists (select 1 from public.cobro_detalles d
                        where d.cobro_id = co.id
                          and d.categoria in ('consulta','procedimiento','imagen','laboratorio')))
     order by co.creado_en desc
     limit 500;
end;
$function$;

create or replace function public.reporte_comisiones(p_sistema uuid, p_desde date, p_hasta date)
 returns table(beneficiario_id uuid, nombre text, especialidad text, generado numeric, retencion numeric, liquidado numeric, pendiente numeric, a_pagar numeric, operaciones bigint, pacientes bigint)
 language sql
 stable
 set search_path to ''
as $function$
  with c as (
    select k.*, (k.creado_en at time zone 'America/Santo_Domingo')::date as dia
      from public.comisiones k
     where k.sistema_id = p_sistema
  )
  select c.beneficiario_id, p.nombre_completo, max(m.especialidad),
         coalesce(sum(c.monto) filter (where c.dia between p_desde and p_hasta), 0),
         coalesce(sum(c.retencion) filter (where c.dia between p_desde and p_hasta), 0),
         coalesce(sum(c.monto) filter (where c.dia between p_desde and p_hasta and li.comision_id is not null), 0),
         coalesce(sum(c.monto) filter (where li.comision_id is null and c.dia <= p_hasta), 0),
         coalesce(sum(c.monto - c.retencion) filter (where li.comision_id is null and c.dia <= p_hasta), 0),
         count(*) filter (where c.dia between p_desde and p_hasta),
         count(distinct co.paciente_id) filter (where c.dia between p_desde and p_hasta)
    from c
    join public.perfiles p on p.id = c.beneficiario_id
    join public.cobros co on co.id = c.cobro_id
    left join public.membresias m on m.sistema_id = c.sistema_id and m.usuario_id = c.beneficiario_id
    left join public.liquidacion_items li on li.comision_id = c.id
   group by c.beneficiario_id, p.nombre_completo
   order by p.nombre_completo;
$function$;

create or replace function public.liquidar_comisiones(p_sistema uuid, p_beneficiario uuid, p_hasta date)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_id uuid := gen_random_uuid();
  v_numero text;
  v_total numeric;
  v_ret numeric;
begin
  if not privado.tiene_rol(p_sistema, '{admin,contabilidad,gerencia}', 'comisiones') then
    raise exception 'No tienes permiso para liquidar comisiones.' using errcode = '42501';
  end if;

  select coalesce(sum(c.monto), 0), coalesce(sum(c.retencion), 0) into v_total, v_ret
    from public.comisiones c
   where c.sistema_id = p_sistema and c.beneficiario_id = p_beneficiario
     and (c.creado_en at time zone 'America/Santo_Domingo')::date <= p_hasta
     and not exists (select 1 from public.liquidacion_items li where li.comision_id = c.id);
  if v_total <= 0 then
    raise exception 'No hay comisiones pendientes para liquidar.' using errcode = 'P0001';
  end if;

  v_numero := 'LIQ-' || lpad(privado.siguiente_numero(p_sistema, 'liquidacion')::text, 5, '0');
  insert into public.liquidaciones_comision (id, sistema_id, numero, beneficiario_id, hasta, total, retencion, neto, creado_por)
  values (v_id, p_sistema, v_numero, p_beneficiario, p_hasta, v_total, v_ret, v_total - v_ret, auth.uid());

  insert into public.liquidacion_items (sistema_id, liquidacion_id, comision_id)
  select p_sistema, v_id, c.id
    from public.comisiones c
   where c.sistema_id = p_sistema and c.beneficiario_id = p_beneficiario
     and (c.creado_en at time zone 'America/Santo_Domingo')::date <= p_hasta
     and not exists (select 1 from public.liquidacion_items li where li.comision_id = c.id);

  return jsonb_build_object('id', v_id, 'numero', v_numero, 'total', v_total, 'retencion', v_ret, 'neto', v_total - v_ret);
end;
$function$;

create or replace function public.estado_cuenta(p_sistema uuid, p_tipo text, p_contacto uuid)
 returns jsonb
 language sql
 stable
 set search_path to ''
as $function$
  with cargos as (
    select (c.creado_en at time zone 'America/Santo_Domingo')::date as fecha, 'cargo' as tipo, coalesce(c.ncf, c.numero) as documento,
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
