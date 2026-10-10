-- El fondo interno es PARTE de lo que cubre la ARS, no un monto aparte.
--
-- Las tarifas de FUNBIDE traen el fondo ya sumado: SENASA Contributivo 750 = consulta 600 + fondo 150,
-- y la ARS cubre 650 = 500 + 150 (la boleta de SENASA: 650 seguro + 100 paciente). Renacer 850 = 600 + 250
-- y APS igual. registrar_cobro volvía a sumar el fondo: la ARS quedaba debiendo 800 en vez de 650, el
-- ingreso salía en 900 en vez de 750 y la comisión del médico se calculaba sobre 750 en vez de 600.
--
-- Desde ahora:
--   * cobro_detalles.fondo guarda la parte del fondo de cada línea (incluida en su cobertura).
--   * Asiento del cobro: ingreso del servicio = bruto − fondo; ingreso_fondo_interno = fondo; la ARS debe
--     solo la cobertura (sin sumar el fondo otra vez).
--   * Comisión con base bruta = bruto − fondo (el fondo es de la fundación, no del médico).
--   * Cuentas por cobrar, estado de cuenta, abonos e importación de pagos de ARS: cobertura, sin + fondo.
--   * Tarifas de SENASA Contributivo sin fondo (750/650/0): fondo 150, como las demás consultas.
--   * Lo ya registrado se corrige con un asiento de «ajuste» por cobro y el ajuste de su comisión
--     (no se anula ningún cobro ni se toca la caja).

-- 1. Fondo por línea.
alter table public.cobro_detalles add column if not exists fondo numeric(12, 2) not null default 0 check (fondo >= 0);

-- 2. Origen de asiento para los ajustes contables.
alter table public.asientos drop constraint if exists asientos_origen_check;
alter table public.asientos add constraint asientos_origen_check
  check (origen in ('manual', 'cobro', 'anulacion', 'anticipo', 'abono', 'compra', 'nomina', 'comision', 'reverso', 'donacion', 'movimiento', 'ajuste'));

-- 3. Reescrituras puntuales de funciones vivas (cada reemplazo debe encontrarse exactamente una vez).
create or replace function privado._reescribir(p_funcion regprocedure, p_cambios text[][])
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_def text := pg_get_functiondef(p_funcion);
  i int;
  v_veces int;
begin
  for i in 1 .. array_length(p_cambios, 1) loop
    v_veces := (length(v_def) - length(replace(v_def, p_cambios[i][1], ''))) / greatest(length(p_cambios[i][1]), 1);
    if v_veces <> 1 then
      raise exception '%: se esperaba encontrar una vez «%» y aparece % veces', p_funcion, p_cambios[i][1], v_veces;
    end if;
    v_def := replace(v_def, p_cambios[i][1], p_cambios[i][2]);
  end loop;
  execute v_def;
end;
$$;

select privado._reescribir('public.registrar_cobro(uuid, uuid, jsonb, jsonb, uuid, text, numeric, uuid, text, text, text, text, text, uuid, uuid, text)'::regprocedure, array[
  [$a$  v_fondo      numeric := 0;$a$,
   $b$  v_fondo      numeric := 0;
  v_fondo_linea numeric;$b$],
  [$a$    v_cubierto := 0;$a$,
   $b$    v_cubierto := 0;
    v_fondo_linea := 0;$b$],
  [$a$        v_fondo := v_fondo + round(coalesce(v_ars.monto_fondo, 0) * v_cantidad, 2);$a$,
   $b$        -- El fondo va incluido en la cobertura: nunca más que lo cubierto.
        v_fondo_linea := least(round(coalesce(v_ars.monto_fondo, 0) * v_cantidad, 2), v_cubierto);
        v_fondo := v_fondo + v_fondo_linea;$b$],
  [$a$      'cobertura', v_cubierto,$a$,
   $b$      'cobertura', v_cubierto,
      'fondo', v_fondo_linea,$b$],
  [$a$categoria, cantidad, precio_unitario, cobertura, total)$a$,
   $b$categoria, cantidad, precio_unitario, cobertura, total, fondo)$b$],
  [$a$(d ->> 'cobertura')::numeric, (d ->> 'total')::numeric$a$,
   $b$(d ->> 'cobertura')::numeric, (d ->> 'total')::numeric, (d ->> 'fondo')::numeric$b$],
  [$a$'haber', sum((d ->> 'bruto')::numeric)$a$,
   $b$'haber', sum((d ->> 'bruto')::numeric - (d ->> 'fondo')::numeric)$b$],
  [$a$    union all
    select jsonb_build_object('cuenta', privado.cuenta(p_sistema, 'cxc_aseguradoras'), 'debe', v_fondo, 'descripcion', 'Fondo interno ARS')
     where v_fondo > 0
$a$, '']
]);

select privado._reescribir('privado.calcular_comisiones(uuid)'::regprocedure, array[
  [$a$else round(d.precio_unitario * d.cantidad, 2) end;$a$,
   $b$else round(d.precio_unitario * d.cantidad, 2) - coalesce(d.fondo, 0) end;$b$]
]);
select privado._reescribir('privado.calcular_comisiones_profesional(uuid)'::regprocedure, array[
  [$a$else round(d.precio_unitario * d.cantidad, 2) end;$a$,
   $b$else round(d.precio_unitario * d.cantidad, 2) - coalesce(d.fondo, 0) end;$b$]
]);

select privado._reescribir('public.registrar_abono(uuid, uuid, text, numeric, public.metodo_pago, text, date)'::regprocedure, array[
  [$a$v_cobro.cobertura_seguro + v_cobro.monto_fondo$a$, $b$v_cobro.cobertura_seguro$b$]
]);

select privado._reescribir(p.oid::regprocedure, array[
  [$a$co.cobertura_seguro + co.monto_fondo$a$, $b$co.cobertura_seguro$b$]
]) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'importar_pagos_ars';

select privado._reescribir('public.estado_cuenta(uuid, text, uuid)'::regprocedure, array[
  [$a$else c.cobertura_seguro + c.monto_fondo end as cargo$a$, $b$else c.cobertura_seguro end as cargo$b$],
  [$a$and c.cobertura_seguro + c.monto_fondo > 0))$a$, $b$and c.cobertura_seguro > 0))$b$]
]);

drop function privado._reescribir(regprocedure, text[][]);

create or replace view public.cuentas_por_cobrar with (security_invoker = true) as
  select c.id as cobro_id, c.sistema_id, c.numero, c.ncf, c.creado_en, c.paciente_id, c.aseguradora_id, c.numero_autorizacion,
         c.monto_credito, c.cobertura_seguro,
         c.monto_credito - coalesce((select sum(b.monto) from public.abonos b where b.cobro_id = c.id and b.deudor = 'paciente'), 0) as pendiente_paciente,
         -- El fondo va dentro de la cobertura: la ARS debe la cobertura, no cobertura + fondo.
         c.cobertura_seguro - coalesce((select sum(b.monto) from public.abonos b where b.cobro_id = c.id and b.deudor = 'aseguradora'), 0) as pendiente_aseguradora,
         c.monto_fondo
    from public.cobros c
   where (c.monto_credito > 0 or c.cobertura_seguro > 0 or c.monto_fondo > 0)
     and not exists (select 1 from public.anulaciones_cobro x where x.cobro_id = c.id);

-- 4. Tarifas de SENASA Contributivo con el fondo en 0 (750 = 600 + 150; cubre 650 = 500 + 150).
update public.coberturas co
   set monto_fondo = 150
  from public.aseguradoras a, public.servicios s
 where a.id = co.aseguradora_id and s.id = co.servicio_id
   and a.nombre = 'SENASA Contributivo' and s.categoria = 'consulta'
   and coalesce(co.precio, s.precio) = 750 and co.monto_cubierto = 650 and coalesce(co.monto_fondo, 0) = 0;

-- 5. Corrección de lo ya registrado: un ajuste por cobro (idempotente).
-- p_fondo: fondo explícito para un cobro registrado sin él (p. ej. cargas desde el Excel); si es null,
-- se aplica la regla de SENASA Contributivo (consulta 750 que cubre 650 → fondo 150).
create or replace function privado.ajustar_fondo_cobro(p_cobro uuid, p_fondo numeric default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  c        public.cobros;
  v_det    public.cobro_detalles;
  v_fondo  numeric := 0;
  v_caso   text;
  v_dia    date;
  v_ingr   text;
  k        public.comisiones;
  v_adj    numeric;
begin
  select * into c from public.cobros where id = p_cobro;
  if c.id is null
     or exists (select 1 from public.anulaciones_cobro x where x.cobro_id = c.id)
     or exists (select 1 from public.asientos a where a.sistema_id = c.sistema_id and a.origen = 'ajuste' and a.origen_id = c.id) then
    return false;
  end if;

  -- Línea con cobertura (la que lleva el fondo).
  select * into v_det from public.cobro_detalles d where d.cobro_id = c.id order by d.cobertura desc limit 1;

  -- crear_asiento agrupa por cuenta: el doble conteo se ve en que la ARS quedó debiendo más que la cobertura.
  if c.monto_fondo > 0 and (
       select coalesce(sum(l.debe), 0) from public.asientos a join public.asiento_lineas l on l.asiento_id = a.id
        where a.origen = 'cobro' and a.origen_id = c.id
          and l.cuenta_codigo = privado.cuenta(c.sistema_id, 'cxc_aseguradoras')) > c.cobertura_seguro then
    -- Fondo contado dos veces: la ARS quedó debiendo cobertura + fondo y el ingreso del servicio incluyó el fondo.
    v_caso := 'doble';
    v_fondo := c.monto_fondo;
  elsif c.monto_fondo = 0 and coalesce(p_fondo, 0) > 0 and p_fondo <= v_det.cobertura then
    v_caso := 'sin_fondo';
    v_fondo := p_fondo;
  elsif c.monto_fondo = 0 and p_fondo is null
        and exists (select 1 from public.aseguradoras a where a.id = c.aseguradora_id and a.nombre = 'SENASA Contributivo')
        and v_det.categoria = 'consulta' and v_det.precio_unitario = 750 and v_det.cobertura = 650 * v_det.cantidad then
    -- Contributivo sin fondo: la ARS debe bien (650), pero el fondo quedó dentro del ingreso de la consulta.
    v_caso := 'sin_fondo';
    v_fondo := 150 * v_det.cantidad;
  else
    return false;
  end if;

  v_dia  := (c.creado_en at time zone 'America/Santo_Domingo')::date;
  v_ingr := privado.cuenta(c.sistema_id, 'ingreso_' || v_det.categoria);
  perform privado.crear_asiento(c.sistema_id, v_dia, 'Ajuste fondo interno ' || c.numero, 'ajuste', c.id,
    case v_caso
      when 'doble' then jsonb_build_array(
        jsonb_build_object('cuenta', v_ingr, 'debe', v_fondo, 'descripcion', 'Fondo incluido en la cobertura'),
        jsonb_build_object('cuenta', privado.cuenta(c.sistema_id, 'cxc_aseguradoras'), 'haber', v_fondo, 'descripcion', 'La ARS no paga el fondo aparte'))
      else jsonb_build_array(
        jsonb_build_object('cuenta', v_ingr, 'debe', v_fondo, 'descripcion', 'Fondo incluido en la cobertura'),
        jsonb_build_object('cuenta', privado.cuenta(c.sistema_id, 'ingreso_fondo_interno'), 'haber', v_fondo, 'descripcion', 'Fondo interno'))
    end);

  -- Comisión: la base no incluye el fondo (trg_comisiones_asiento asienta el ajuste).
  for k in select * from public.comisiones where cobro_id = c.id and detalle_id = v_det.id and monto > 0 and base_monto > 0 loop
    v_adj := round(v_fondo * k.monto / k.base_monto, 2);
    if v_adj > 0 then
      insert into public.comisiones (sistema_id, cobro_id, detalle_id, beneficiario_id, regla_id, base_monto, monto, retencion, concepto, creado_en)
      values (k.sistema_id, k.cobro_id, k.detalle_id, k.beneficiario_id, k.regla_id, -v_fondo, -v_adj,
              -round(v_adj * k.retencion / k.monto, 2), 'Ajuste fondo interno · ' || k.concepto, k.creado_en + interval '1 second');
    end if;
  end loop;
  return true;
end;
$$;

revoke all on function privado.ajustar_fondo_cobro(uuid, numeric) from public, anon, authenticated;

do $$
declare
  v_id uuid;
  v_n int := 0;
begin
  for v_id in select id from public.cobros order by creado_en loop
    if privado.ajustar_fondo_cobro(v_id) then
      v_n := v_n + 1;
    end if;
  end loop;
  raise notice 'Cobros ajustados por el fondo interno: %', v_n;
end $$;
