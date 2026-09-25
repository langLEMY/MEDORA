-- MEDORA · 0012b · registrar_compra: la variable del bucle chocaba con el alias "i" (42702).

create or replace function public.registrar_compra(
  p_sistema uuid, p_proveedor uuid, p_fecha date, p_ncf text, p_forma_pago text, p_items jsonb, p_notas text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
  if not privado.tiene_rol(p_sistema, '{admin,farmacia,contabilidad,gerencia}') then
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

  -- Entrada a inventario y costo actualizado.
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
$$;

