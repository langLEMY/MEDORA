-- ============================================================================
-- MEDORA · Pago de médicos por lo facturado (FUNBIDE) y devuelta en efectivo
--
-- 1. Reglas de comisión por ESPECIALIDAD (Odontología 45 %, el resto 50 %) y con
--    RETENCIÓN (10 % de ISR sobre honorarios): el médico cobra el neto y la
--    retención queda por pagar a la DGII (cuenta isr_por_pagar).
--    Prioridad de reglas: persona > servicio > categoría > especialidad > rol.
-- 2. cobro_pagos.recibido: efectivo que entregó el paciente (para la devuelta).
-- ============================================================================

alter table public.reglas_comision
  add column especialidad text,
  add column retencion numeric(5, 2) not null default 0 check (retencion between 0 and 100);
alter table public.reglas_comision drop constraint if exists reglas_comision_check;
alter table public.reglas_comision
  add constraint reglas_comision_a_quien check (beneficiario_id is not null or rol is not null or especialidad is not null);

alter table public.comisiones add column retencion numeric(12, 2) not null default 0;
alter table public.liquidaciones_comision
  add column retencion numeric(12, 2) not null default 0,
  add column neto numeric(12, 2);
update public.liquidaciones_comision set neto = total where neto is null;

alter table public.cobro_pagos add column recibido numeric(12, 2) check (recibido is null or recibido >= 0);

-- ---------------------------------------------------------------------------
create or replace function privado.calcular_comisiones(p_cobro uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
    union all
    select 'vendedor', c.vendedor_id where c.vendedor_id is not null
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
$$;

-- Liquidar: gasto por el bruto; al médico se le debe el neto y a la DGII la retención.
create or replace function public.liquidar_comisiones(p_sistema uuid, p_beneficiario uuid, p_hasta date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
   where c.sistema_id = p_sistema and c.beneficiario_id = p_beneficiario and c.creado_en::date <= p_hasta
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
   where c.sistema_id = p_sistema and c.beneficiario_id = p_beneficiario and c.creado_en::date <= p_hasta
     and not exists (select 1 from public.liquidacion_items li where li.comision_id = c.id);

  perform privado.crear_asiento(p_sistema, current_date, 'Liquidación de comisiones ' || v_numero, 'comision', v_id,
    jsonb_build_array(
      jsonb_build_object('cuenta', privado.cuenta(p_sistema, 'gasto_comisiones'), 'debe', v_total),
      jsonb_build_object('cuenta', privado.cuenta(p_sistema, 'comisiones_por_pagar'), 'haber', v_total - v_ret)
    ) || case when v_ret > 0 then jsonb_build_array(
      jsonb_build_object('cuenta', privado.cuenta(p_sistema, 'isr_por_pagar'), 'haber', v_ret, 'descripcion', 'Retención ISR honorarios')
    ) else '[]'::jsonb end);
  return jsonb_build_object('id', v_id, 'numero', v_numero, 'total', v_total, 'retencion', v_ret, 'neto', v_total - v_ret);
end;
$$;

-- Devuelta: se guarda lo que entregó el paciente en efectivo.
do $$
declare
  v_def text := pg_get_functiondef('public.registrar_cobro'::regproc);
  v_nueva text;
begin
  v_nueva := replace(v_def,
    'insert into public.cobro_pagos (sistema_id, cobro_id, metodo, monto, referencia)
  select p_sistema, v_cobro_id, (p ->> ''metodo'')::public.metodo_pago, round((p ->> ''monto'')::numeric, 2), nullif(p ->> ''referencia'', '''')',
    'insert into public.cobro_pagos (sistema_id, cobro_id, metodo, monto, referencia, recibido)
  select p_sistema, v_cobro_id, (p ->> ''metodo'')::public.metodo_pago, round((p ->> ''monto'')::numeric, 2), nullif(p ->> ''referencia'', ''''),
         case when p ->> ''metodo'' = ''efectivo'' and (p ->> ''recibido'')::numeric >= (p ->> ''monto'')::numeric
              then round((p ->> ''recibido'')::numeric, 2) end');
  if v_nueva = v_def then
    raise exception 'registrar_cobro no tiene el insert de pagos esperado.';
  end if;
  execute v_nueva;
end;
$$;
