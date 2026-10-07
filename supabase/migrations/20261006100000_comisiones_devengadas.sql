-- Las comisiones de los médicos se reconocen como deuda en el momento del cobro (devengo),
-- no al liquidarlas: así Finanzas → "Debemos → Médicos" muestra lo que se les debe hoy.
--   comisión      → debe: gasto_comisiones (bruto) · haber: comisiones_por_pagar (neto) + isr_por_pagar (retención)
--   anulación (−) → el asiento al revés
-- La liquidación ya no hace asiento (la deuda ya está en los libros); solo agrupa lo que se le va a pagar.

-- 1. Asiento por cada comisión que se inserta (cubre todos los caminos: cobro, fijar profesional, anulación, cargas).
create or replace function privado.asentar_comision(p_k public.comisiones)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s     uuid := p_k.sistema_id;
  v_signo int := sign(p_k.monto);
  v_bruto numeric := abs(p_k.monto);
  v_ret   numeric := abs(coalesce(p_k.retencion, 0));
  v_gasto jsonb;
  v_deuda jsonb;
begin
  if v_bruto = 0 then
    return null;
  end if;
  v_gasto := jsonb_build_array(jsonb_build_object('cuenta', privado.cuenta(v_s, 'gasto_comisiones'), 'monto', v_bruto, 'descripcion', 'Comisión'));
  v_deuda := jsonb_build_array(jsonb_build_object('cuenta', privado.cuenta(v_s, 'comisiones_por_pagar'), 'monto', v_bruto - v_ret, 'descripcion', 'Por pagar al médico'))
          || case when v_ret > 0 then jsonb_build_array(
               jsonb_build_object('cuenta', privado.cuenta(v_s, 'isr_por_pagar'), 'monto', v_ret, 'descripcion', 'Retención ISR honorarios'))
             else '[]'::jsonb end;

  return privado.crear_asiento(v_s, (p_k.creado_en at time zone 'America/Santo_Domingo')::date,
    case when v_signo > 0 then 'Comisión · ' else '' end || p_k.concepto, 'comision', p_k.id,
    (select jsonb_agg(jsonb_build_object('cuenta', l ->> 'cuenta', case when v_signo > 0 then 'debe' else 'haber' end, (l ->> 'monto')::numeric,
                                         'descripcion', l ->> 'descripcion'))
       from jsonb_array_elements(v_gasto) l)
    || (select jsonb_agg(jsonb_build_object('cuenta', l ->> 'cuenta', case when v_signo > 0 then 'haber' else 'debe' end, (l ->> 'monto')::numeric,
                                            'descripcion', l ->> 'descripcion'))
          from jsonb_array_elements(v_deuda) l));
end;
$$;

create or replace function privado.tg_comisiones_asiento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.asentar_comision(new);
  return null;
end;
$$;

revoke all on function privado.asentar_comision(public.comisiones) from public, anon, authenticated;
revoke all on function privado.tg_comisiones_asiento() from public, anon, authenticated;

drop trigger if exists trg_comisiones_asiento on public.comisiones;
create trigger trg_comisiones_asiento after insert on public.comisiones
  for each row execute function privado.tg_comisiones_asiento();

-- 2. La liquidación ya no reconoce el gasto otra vez.
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

  -- Sin asiento: cada comisión ya cargó gasto_comisiones contra comisiones_por_pagar al cobrarse
  -- (trg_comisiones_asiento).
  return jsonb_build_object('id', v_id, 'numero', v_numero, 'total', v_total, 'retencion', v_ret, 'neto', v_total - v_ret);
end;
$$;

revoke all on function public.liquidar_comisiones(uuid, uuid, date) from public, anon;
grant execute on function public.liquidar_comisiones(uuid, uuid, date) to authenticated;

-- 3. Limpiar operaciones (entorno de pruebas) borra también los asientos de cada comisión
--    y los de los movimientos manuales de caja (20261006090000).
do $$
declare
  v_def text := pg_get_functiondef('public.plataforma_limpiar_operaciones(uuid,text[],text)'::regprocedure);
  v_ancla text := 'or (a.origen = ''comision'' and a.origen_id in (select id from _liquidaciones)))';
begin
  if position('_comisiones)) or (a.origen = ''movimiento'')' in v_def) > 0 then
    return;
  end if;
  if position(v_ancla in v_def) = 0 then
    raise exception 'plataforma_limpiar_operaciones cambió: no encuentro %', v_ancla;
  end if;
  execute replace(v_def, v_ancla,
    'or (a.origen = ''comision'' and a.origen_id in (select id from _liquidaciones))'
    || ' or (a.origen = ''comision'' and a.origen_id in (select id from _comisiones)) or (a.origen = ''movimiento''))');
end $$;

-- 4. Devengo de las comisiones que ya existían (ninguna estaba liquidada todavía).
do $$
declare
  k public.comisiones;
begin
  if exists (select 1 from public.liquidacion_items) then
    raise exception 'Hay comisiones liquidadas con el esquema anterior: revisar antes de devengar.';
  end if;
  for k in
    select * from public.comisiones c
     where not exists (select 1 from public.asientos a where a.sistema_id = c.sistema_id and a.origen = 'comision' and a.origen_id = c.id)
     order by c.creado_en
  loop
    perform privado.asentar_comision(k);
  end loop;
end $$;
