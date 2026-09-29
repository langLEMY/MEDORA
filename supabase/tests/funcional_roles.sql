-- ============================================================================
-- MEDORA · Batería funcional por roles (recepción, caja, médico, farmacia,
-- contabilidad, auditor, gerencia, enfermería, quiosco) + nómina e impuestos.
--
-- Corre sobre el sistema de pruebas "FUNBIDE · Pruebas" con usuarios QA creados
-- dentro de la transacción y termina en ROLLBACK: no deja nada en la base.
--   supabase db query --linked --agent no -f supabase/tests/funcional_roles.sql
-- Cada fila del resultado es una prueba (OK / FALLA).
-- ============================================================================
begin;

create temp table r (n serial, area text, prueba text, ok boolean, detalle text) on commit drop;
grant all on r to authenticated;
grant usage on sequence r_n_seq to authenticated;
create temp table ctx (clave text primary key, valor text) on commit drop;
grant all on ctx to authenticated;

create function pg_temp.como(p_uid uuid) returns void language plpgsql as $f$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $f$;
create function pg_temp.yo_postgres() returns void language plpgsql as $f$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $f$;
create function pg_temp.ok(a text, p text, c boolean, d text default null) returns void language sql as $f$
  insert into r (area, prueba, ok, detalle) values (a, p, coalesce(c, false), d);
$f$;
create function pg_temp.c(k text) returns text language sql as $f$ select valor from ctx where clave = k $f$;
create function pg_temp.set(k text, v text) returns void language sql as $f$
  insert into ctx values (k, v) on conflict (clave) do update set valor = excluded.valor;
$f$;
grant execute on all functions in schema pg_temp to authenticated;

-- ---------------------------------------------------------------- preparación
do $$
declare
  v_s uuid := (select id from public.sistemas where es_pruebas and nombre like 'FUNBIDE%' limit 1);
  v_rol text;
  v_uid uuid;
begin
  perform pg_temp.set('s', v_s::text);
  foreach v_rol in array array['admin','recepcion','caja','caja2','medico','odonto','farmacia','contabilidad','gerencia','auditor','enfermeria','quiosco'] loop
    v_uid := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'qa-' || v_rol || '@pruebas.medora.invalid', extensions.crypt('x', extensions.gen_salt('bf')), now(),
            '{}'::jsonb, jsonb_build_object('nombre_completo', 'QA ' || v_rol), now(), now());
    insert into public.membresias (sistema_id, usuario_id, roles, especialidad, consultorio, atiende_agenda, activo)
    values (v_s, v_uid,
            case v_rol when 'caja2' then '{caja}' when 'odonto' then '{medico}' else array[v_rol]::public.rol_sistema[] end,
            case v_rol when 'medico' then 'Medicina general' when 'odonto' then 'Odontología' end,
            case v_rol when 'medico' then '3' when 'odonto' then '7' end,
            v_rol in ('medico', 'odonto'), true);
    perform pg_temp.set(v_rol, v_uid::text);
  end loop;
  perform pg_temp.set('serv', (select id::text from public.servicios where sistema_id = v_s and categoria = 'consulta' and precio = 950 and activo limit 1));
  -- Una consulta con tarifa de ARS que cubra algo (valores reales del tarifario).
  perform pg_temp.set('ars', c.aseguradora_id::text), pg_temp.set('serv_ars', c.servicio_id::text),
          pg_temp.set('ars_precio', coalesce(c.precio, v.precio)::text),
          pg_temp.set('ars_cubre', least(c.monto_cubierto, coalesce(c.precio, v.precio))::text),
          pg_temp.set('ars_fondo', coalesce(c.monto_fondo, 0)::text)
    from public.coberturas c join public.servicios v on v.id = c.servicio_id
   where c.sistema_id = v_s and v.categoria = 'consulta' and c.monto_cubierto > 0
     and coalesce(c.precio, v.precio) > c.monto_cubierto
   order by c.monto_fondo desc nulls last limit 1;
end $$;

-- ---------------------------------------------------------------- recepción
do $$
declare v_s uuid := pg_temp.c('s')::uuid; v_p uuid; v_p2 uuid; j jsonb; n int;
begin
  perform pg_temp.como(pg_temp.c('recepcion')::uuid);
  insert into public.pacientes (sistema_id, nombres, apellidos, telefono) values (v_s, 'Paciente', 'Prueba Uno', '8095550001') returning id into v_p;
  insert into public.pacientes (sistema_id, nombres, apellidos) values (v_s, 'Paciente', 'Prueba Dos') returning id into v_p2;
  perform pg_temp.set('pac', v_p::text); perform pg_temp.set('pac2', v_p2::text);
  perform pg_temp.ok('Recepción', 'Crea pacientes (con expediente automático)',
    (select expediente is not null from public.pacientes where id = v_p), (select expediente from public.pacientes where id = v_p));

  j := public.registrar_llegada(v_s, v_p, pg_temp.c('medico')::uuid, null, pg_temp.c('serv')::uuid);
  perform pg_temp.set('cita1', j ->> 'id');
  perform pg_temp.ok('Recepción', 'Registra llegada con turno (cobro antes de consulta → por cobrar)',
    j ->> 'turno' is not null and j ->> 'estado' = 'por_cobrar', j::text);
  j := public.registrar_llegada(v_s, v_p2, pg_temp.c('odonto')::uuid);
  perform pg_temp.set('cita2', j ->> 'id');
  perform pg_temp.ok('Recepción', 'Turno con prefijo por especialidad (Odontología)', j ->> 'turno' like 'OD-%', j ->> 'turno');

  begin
    perform public.registrar_cobro(v_s, v_p, jsonb_build_array(jsonb_build_object('servicio_id', pg_temp.c('serv'))), '[]');
    perform pg_temp.ok('Recepción', 'No puede cobrar', false, 'Se permitió cobrar');
  exception when others then perform pg_temp.ok('Recepción', 'No puede cobrar', sqlstate = '42501', sqlerrm);
  end;
  select count(*) into n from public.cobros where sistema_id = v_s;
  perform pg_temp.ok('Recepción', 'No ve cobros', n = 0, n::text);
  select count(*) into n from public.nomina_lineas where sistema_id = v_s;
  perform pg_temp.ok('Recepción', 'No ve nómina', n = 0, n::text);
  select count(*) into n from public.directorio_medicos(v_s) where estrellas is not null or puntos is not null;
  perform pg_temp.ok('Recepción', 'Directorio sin estrellas', n = 0, n::text);
end $$;

-- ---------------------------------------------------------------- caja
do $$
declare v_s uuid := pg_temp.c('s')::uuid; j jsonb; v_c uuid; n numeric; m numeric; v_t uuid; e text;
begin
  perform pg_temp.como(pg_temp.c('caja')::uuid);
  j := public.registrar_cobro(v_s, pg_temp.c('pac')::uuid,
         jsonb_build_array(jsonb_build_object('servicio_id', pg_temp.c('serv'))),
         '[{"metodo":"efectivo","monto":950,"recibido":1000}]', p_cita => pg_temp.c('cita1')::uuid);
  v_c := (j ->> 'id')::uuid; perform pg_temp.set('cobro1', v_c::text);
  perform pg_temp.ok('Caja', 'Cobro en efectivo: total calculado en el servidor', (j ->> 'total')::numeric = 950, j::text);
  perform pg_temp.ok('Caja', 'Al cobrar, el turno pasa a sala de espera',
    (select estado::text from public.citas where id = pg_temp.c('cita1')::uuid) = 'en_espera',
    (select estado::text from public.citas where id = pg_temp.c('cita1')::uuid));
  perform pg_temp.yo_postgres();
  select sum(debe) - sum(haber) into n from public.asiento_lineas l join public.asientos a on a.id = l.asiento_id where a.origen_id = v_c;
  perform pg_temp.como(pg_temp.c('caja')::uuid);
  perform pg_temp.ok('Caja', 'Asiento del cobro cuadra', n = 0, n::text);

  -- ARS: precio pactado, lo que cubre y el fondo salen del tarifario del sistema.
  j := public.registrar_cobro(v_s, pg_temp.c('pac2')::uuid,
         jsonb_build_array(jsonb_build_object('servicio_id', pg_temp.c('serv_ars'))),
         jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', pg_temp.c('ars_precio')::numeric - pg_temp.c('ars_cubre')::numeric)), p_aseguradora => pg_temp.c('ars')::uuid, p_autorizacion => 'AUT-1', p_cita => pg_temp.c('cita2')::uuid);
  perform pg_temp.set('cobro_ars', j ->> 'id');
  perform pg_temp.ok('Caja', 'Cobro con ARS: cobertura, fondo y diferencia del paciente',
    (j ->> 'cobertura')::numeric = pg_temp.c('ars_cubre')::numeric and (j ->> 'fondo')::numeric = pg_temp.c('ars_fondo')::numeric
    and (j ->> 'total')::numeric = pg_temp.c('ars_precio')::numeric - pg_temp.c('ars_cubre')::numeric, j::text);
  perform pg_temp.yo_postgres();
  select sum(debe) - sum(haber) into n from public.asiento_lineas l join public.asientos a on a.id = l.asiento_id where a.origen_id = (j ->> 'id')::uuid;
  perform pg_temp.como(pg_temp.c('caja')::uuid);
  perform pg_temp.ok('Caja', 'Asiento con ARS y fondo cuadra', n = 0, n::text);

  begin
    perform public.registrar_cobro(v_s, pg_temp.c('pac')::uuid, jsonb_build_array(jsonb_build_object('servicio_id', pg_temp.c('serv'))), '[{"metodo":"efectivo","monto":2000}]');
    perform pg_temp.ok('Caja', 'Rechaza pagos mayores al total', false, 'aceptado');
  exception when others then perform pg_temp.ok('Caja', 'Rechaza pagos mayores al total', true, sqlerrm);
  end;
  begin
    perform public.registrar_cobro(v_s, pg_temp.c('pac')::uuid, jsonb_build_array(jsonb_build_object('servicio_id', pg_temp.c('serv'))), '[]', p_descuento => 5000);
    perform pg_temp.ok('Caja', 'Rechaza descuento mayor al total', false, 'aceptado');
  exception when others then perform pg_temp.ok('Caja', 'Rechaza descuento mayor al total', true, sqlerrm);
  end;
  begin
    perform public.registrar_cobro(v_s, pg_temp.c('pac')::uuid, '[{"descripcion":"Libre","precio_unitario":-100}]', '[]');
    perform pg_temp.ok('Caja', 'Rechaza precio negativo', false, 'aceptado');
  exception when others then perform pg_temp.ok('Caja', 'Rechaza precio negativo', true, sqlerrm);
  end;
  begin
    perform public.registrar_cobro(v_s, pg_temp.c('pac')::uuid, jsonb_build_array(jsonb_build_object('servicio_id', pg_temp.c('serv'))), '[]', p_tipo_ncf => 'B01');
    perform pg_temp.ok('Caja', 'B01 exige RNC', false, 'aceptado');
  exception when others then perform pg_temp.ok('Caja', 'B01 exige RNC', true, sqlerrm);
  end;
  begin
    perform public.registrar_cobro(v_s, pg_temp.c('pac')::uuid, jsonb_build_array(jsonb_build_object('servicio_id', pg_temp.c('serv'))), '[]', p_tipo_ncf => 'B02');
    perform pg_temp.ok('Caja', 'B02 sin secuencia NCF configurada: mensaje claro', false, 'aceptado sin secuencia');
  exception when others then perform pg_temp.ok('Caja', 'B02 sin secuencia NCF configurada: mensaje claro', sqlstate <> 'XX000', sqlerrm);
  end;

  -- Crédito + abono
  j := public.registrar_cobro(v_s, pg_temp.c('pac')::uuid, jsonb_build_array(jsonb_build_object('servicio_id', pg_temp.c('serv'))), '[{"metodo":"efectivo","monto":500}]');
  perform pg_temp.ok('Caja', 'Cobro parcial deja crédito de 450', (j ->> 'credito')::numeric = 450, j::text);
  perform public.registrar_abono(v_s, (j ->> 'id')::uuid, 'paciente', 450, 'efectivo', null, current_date);
  begin
    perform public.registrar_abono(v_s, (j ->> 'id')::uuid, 'paciente', 1, 'efectivo', null, current_date);
    perform pg_temp.ok('Caja', 'No permite abonar más de lo que se debe', false, 'aceptado');
  exception when others then perform pg_temp.ok('Caja', 'No permite abonar más de lo que se debe', true, sqlerrm);
  end;

  -- Anticipo
  perform public.registrar_anticipo(v_s, pg_temp.c('pac2')::uuid, 1000, 'efectivo', null, current_date, null);
  j := public.registrar_cobro(v_s, pg_temp.c('pac2')::uuid, jsonb_build_array(jsonb_build_object('servicio_id', pg_temp.c('serv'))), '[{"metodo":"anticipo","monto":950}]');
  perform pg_temp.ok('Caja', 'Cobro usando dinero adelantado', (j ->> 'pagado')::numeric = 950, j::text);
  begin
    perform public.registrar_cobro(v_s, pg_temp.c('pac2')::uuid, jsonb_build_array(jsonb_build_object('servicio_id', pg_temp.c('serv'))), '[{"metodo":"anticipo","monto":100}]');
    perform pg_temp.ok('Caja', 'No usa más adelanto del que queda (quedan 50)', false, 'aceptado');
  exception when others then perform pg_temp.ok('Caja', 'No usa más adelanto del que queda (quedan 50)', true, sqlerrm);
  end;

  -- Gasto de caja (egreso) y cierre de turno
  perform public.registrar_movimiento(v_s, 'egreso', 'Mensajería', 200, 'efectivo', 'general');
  v_t := privado.turno_abierto(v_s);
  select monto_apertura into m from public.turnos_caja where id = v_t;
  -- efectivo: 950 + 500 + 450 (abono) + 1000 (anticipo) − 200
  perform pg_temp.set('turno', v_t::text);
  perform public.cerrar_turno_caja(v_t, m + 2700, 'cuadre de prueba');
  select monto_esperado into n from public.turnos_caja where id = v_t;
  perform pg_temp.ok('Caja', 'Cierre de turno: efectivo esperado = fondo + 2,700', n = m + 2700, format('esperado %s, fondo %s', n, m));
end $$;

-- ---------------------------------------------------------------- médico
do $$
declare v_s uuid := pg_temp.c('s')::uuid; j jsonb; n int; e jsonb; v_h uuid;
begin
  perform pg_temp.como(pg_temp.c('medico')::uuid);
  select count(*) into n from public.citas where sistema_id = v_s and medico_id is distinct from pg_temp.c('medico')::uuid;
  perform pg_temp.ok('Médico', 'Solo ve sus citas', n = 0, n::text);
  select count(*) into n from public.cobros where sistema_id = v_s;
  perform pg_temp.ok('Médico', 'No ve cobros', n = 0, n::text);
  j := public.llamar_siguiente(v_s);
  perform pg_temp.ok('Médico', 'Llamar siguiente trae su paciente', (j ->> 'id') = pg_temp.c('cita1'), j::text);
  perform pg_temp.como(pg_temp.c('caja')::uuid);  -- la caja ve la comisión en el cobro
  perform pg_temp.como(pg_temp.c('contabilidad')::uuid);
  perform pg_temp.yo_postgres();
  select jsonb_build_object('monto', sum(monto), 'ret', sum(retencion), 'filas', count(*)) into e
    from public.comisiones where cobro_id = pg_temp.c('cobro1')::uuid;
  perform pg_temp.ok('Médico', 'Comisión 50% de 950 = 475, retención 47.50', (e ->> 'monto')::numeric = 475 and (e ->> 'ret')::numeric = 47.5, e::text);

  perform pg_temp.como(pg_temp.c('medico')::uuid);
  insert into public.historial_clinico (sistema_id, paciente_id, cita_id, autor_id, tipo, titulo, contenido)
  values (v_s, pg_temp.c('pac')::uuid, pg_temp.c('cita1')::uuid, pg_temp.c('medico')::uuid, 'consulta', 'Consulta', 'Paciente estable.')
  returning id into v_h;
  perform pg_temp.ok('Médico', 'Escribe nota clínica de su paciente', v_h is not null);
  begin
    update public.historial_clinico set contenido = 'cambiado' where id = v_h;
    get diagnostics n = row_count;
    perform pg_temp.ok('Médico', 'La nota clínica no se puede editar (append-only)', n = 0, n || ' filas');
  exception when others then perform pg_temp.ok('Médico', 'La nota clínica no se puede editar (append-only)', true, sqlerrm);
  end;
  e := public.estadisticas_medico(v_s, pg_temp.c('medico')::uuid, current_date, current_date);
  perform pg_temp.ok('Médico', 'Mis estadísticas: 1 cobrado, neto 427.50', (e ->> 'cobrados')::int = 1 and (e ->> 'neto')::numeric = 427.5, e::text);
  begin
    perform public.estadisticas_medico(v_s, pg_temp.c('odonto')::uuid, current_date, current_date);
    perform pg_temp.ok('Médico', 'No ve estadísticas de otro médico', false, 'permitido');
  exception when others then perform pg_temp.ok('Médico', 'No ve estadísticas de otro médico', true, sqlerrm);
  end;
  begin
    perform public.registrar_compra(v_s, null, current_date, null, 'efectivo', '[{"descripcion":"x","cantidad":1,"costo_unitario":1,"cuenta":"6.2.99"}]');
    perform pg_temp.ok('Médico', 'No registra gastos', false, 'permitido');
  exception when others then perform pg_temp.ok('Médico', 'No registra gastos', sqlstate = '42501', sqlerrm);
  end;

  -- Odontólogo: el cobro ARS de su paciente (Odontología 45%)
  perform pg_temp.como(pg_temp.c('odonto')::uuid);
  j := public.llamar_siguiente(v_s);
  perform pg_temp.yo_postgres();
  select jsonb_build_object('monto', sum(monto), 'ret', sum(retencion)) into e from public.comisiones where cobro_id = pg_temp.c('cobro_ars')::uuid;
  perform pg_temp.ok('Médico', 'Odontología 45% sobre el precio ARS', (e ->> 'monto')::numeric = round(pg_temp.c('ars_precio')::numeric * 0.45, 2), e::text);
end $$;

-- ---------------------------------------------------------------- anulación
do $$
declare v_s uuid := pg_temp.c('s')::uuid; n numeric; e jsonb;
begin
  perform pg_temp.como(pg_temp.c('admin')::uuid);
  perform public.anular_cobro(pg_temp.c('cobro1')::uuid, 'Prueba de anulación');
  perform pg_temp.yo_postgres();
  -- Por cuenta: asientos del cobro + sus reversos deben netear a cero.
  select count(*) into n from (
    select l.cuenta_codigo from public.asiento_lineas l join public.asientos a on a.id = l.asiento_id
     where a.origen_id = pg_temp.c('cobro1')::uuid
        or a.origen_id in (select id from public.asientos where origen_id = pg_temp.c('cobro1')::uuid)
     group by l.cuenta_codigo having sum(l.debe) <> sum(l.haber)) x;
  perform pg_temp.ok('Anulación', 'Asientos del cobro anulado quedan en cero (por cuenta)', n = 0, n || ' cuentas con saldo');
  select jsonb_build_object('monto', sum(monto), 'ret', sum(retencion)) into e from public.comisiones where cobro_id = pg_temp.c('cobro1')::uuid;
  perform pg_temp.ok('Anulación', 'Comisión del médico revertida a 0', (e ->> 'monto')::numeric = 0 and (e ->> 'ret')::numeric = 0, e::text);
  perform pg_temp.como(pg_temp.c('admin')::uuid);
  begin
    perform public.anular_cobro(pg_temp.c('cobro1')::uuid, 'otra vez');
    perform pg_temp.ok('Anulación', 'No se anula dos veces', false, 'permitido');
  exception when others then perform pg_temp.ok('Anulación', 'No se anula dos veces', true, sqlerrm);
  end;
end $$;

-- ---------------------------------------------------------------- farmacia / gastos / inventario
do $$
declare v_s uuid := pg_temp.c('s')::uuid; v_i uuid; j jsonb; n numeric; s numeric;
begin
  perform pg_temp.como(pg_temp.c('farmacia')::uuid);
  insert into public.inventario_items (sistema_id, nombre, codigo, categoria, unidad, stock_minimo, precio_venta)
  values (v_s, 'Paracetamol QA', 'QA-001', 'medicamento', 'unidad', 5, 10) returning id into v_i;
  perform pg_temp.set('item', v_i::text);
  j := public.registrar_compra(v_s, null, current_date, null, 'efectivo',
         jsonb_build_array(jsonb_build_object('item_id', v_i, 'descripcion', 'Paracetamol', 'cantidad', 10, 'costo_unitario', 50, 'itbis', 90)));
  perform pg_temp.set('compra', j ->> 'id');
  select stock_actual into s from public.inventario_items where id = v_i;
  perform pg_temp.ok('Gastos', 'Gasto con inventario: total 590 y stock +10', (j ->> 'total')::numeric = 590 and s = 10, format('%s · stock %s', j, s));
  perform pg_temp.yo_postgres();
  select sum(debe) - sum(haber) into n from public.asiento_lineas l join public.asientos a on a.id = l.asiento_id where a.origen_id = (j ->> 'id')::uuid;
  perform pg_temp.como(pg_temp.c('farmacia')::uuid);
  perform pg_temp.ok('Gastos', 'Asiento del gasto cuadra', n = 0, n::text);
  begin
    j := public.registrar_compra(v_s, null, current_date, null, 'efectivo', '[{"descripcion":"Luz","cantidad":1,"costo_unitario":1000,"itbis":-180,"cuenta":"6.2.99"}]');
    perform pg_temp.ok('Gastos', 'Rechaza ITBIS negativo', false, 'aceptado: ' || j::text);
  exception when others then perform pg_temp.ok('Gastos', 'Rechaza ITBIS negativo', true, sqlerrm);
  end;
  begin
    j := public.registrar_compra(v_s, null, current_date, null, 'efectivo', '[{"descripcion":"Luz","cantidad":1,"costo_unitario":1000,"itbis":900,"cuenta":"6.2.99"}]');
    perform pg_temp.ok('Gastos', 'Rechaza ITBIS mayor al 18%', false, 'aceptado: ' || j::text);
  exception when others then perform pg_temp.ok('Gastos', 'Rechaza ITBIS mayor al 18%', true, sqlerrm);
  end;
  begin
    j := public.registrar_compra(v_s, null, current_date, null, 'efectivo', '[{"descripcion":"Luz","cantidad":1,"costo_unitario":1000,"cuenta":"9.9.99"}]');
    perform pg_temp.ok('Gastos', 'Rechaza cuenta de gasto inexistente', false, 'aceptado: ' || j::text);
  exception when others then perform pg_temp.ok('Gastos', 'Rechaza cuenta de gasto inexistente', true, sqlerrm);
  end;
  begin
    insert into public.movimientos_inventario (sistema_id, item_id, tipo, cantidad, motivo) values (v_s, v_i, 'salida', 50, 'Despacho QA');
    select stock_actual into s from public.inventario_items where id = v_i;
    perform pg_temp.ok('Inventario', 'No deja el stock en negativo', s >= 0, 'stock ' || s);
  exception when others then perform pg_temp.ok('Inventario', 'No deja el stock en negativo', true, sqlerrm);
  end;
  select count(*) into n from public.cobros where sistema_id = v_s;
  perform pg_temp.ok('Farmacia', 'No ve cobros', n = 0, n::text);
  select count(*) into n from public.historial_clinico where sistema_id = v_s;
  perform pg_temp.ok('Farmacia', 'No ve historial clínico', n = 0, n::text);

  perform pg_temp.como(pg_temp.c('admin')::uuid);
  perform public.anular_compra((pg_temp.c('compra'))::uuid, 'Prueba');
  select stock_actual into s from public.inventario_items where id = v_i;
  perform pg_temp.ok('Gastos', 'Anular gasto devuelve el inventario', s = 0, 'stock ' || s);
end $$;

-- ---------------------------------------------------------------- nómina e impuestos
do $$
declare v_s uuid := pg_temp.c('s')::uuid; v_n uuid; l record; n numeric; e1 uuid; e2 uuid; e3 uuid; e4 uuid;
begin
  perform pg_temp.como(pg_temp.c('contabilidad')::uuid);
  insert into public.empleados (sistema_id, nombres, apellidos, salario_mensual, frecuencia, activo) values (v_s, 'QA', 'Cincuenta', 50000, 'mensual', true) returning id into e1;
  insert into public.empleados (sistema_id, nombres, apellidos, salario_mensual, frecuencia, activo) values (v_s, 'QA', 'Cientocincuenta', 150000, 'mensual', true) returning id into e2;
  insert into public.empleados (sistema_id, nombres, apellidos, salario_mensual, frecuencia, activo) values (v_s, 'QA', 'Minimo', 20000, 'mensual', true) returning id into e3;
  insert into public.empleados (sistema_id, nombres, apellidos, salario_mensual, frecuencia, activo) values (v_s, 'QA', 'Quincenal', 60000, 'quincenal', true) returning id into e4;

  v_n := public.generar_nomina(v_s, date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '1 month - 1 day')::date, 'mensual', 'QA mensual');
  perform pg_temp.set('nomina', v_n::text);

  select * into l from public.nomina_lineas where nomina_id = v_n and empleado_id = e1;
  perform pg_temp.ok('Nómina', '50,000: AFP 1,435.00 · SFS 1,520.00 · ISR 1,854.00 · neto 45,191.00',
    l.afp = 1435 and l.sfs = 1520 and l.isr = 1854 and l.neto = 45191, format('afp %s sfs %s isr %s neto %s', l.afp, l.sfs, l.isr, l.neto));
  perform pg_temp.ok('Nómina', '50,000: aportes patronales AFP 3,550 · SFS 3,545 · SRL 550 · INFOTEP 500',
    l.afp_patronal = 3550 and l.sfs_patronal = 3545 and l.srl_patronal = 550 and l.infotep = 500,
    format('afp %s sfs %s srl %s infotep %s', l.afp_patronal, l.sfs_patronal, l.srl_patronal, l.infotep));
  select * into l from public.nomina_lineas where nomina_id = v_n and empleado_id = e2;
  perform pg_temp.ok('Nómina', '150,000: tramo 25% → ISR 23,866.69', l.isr = 23866.69, format('afp %s sfs %s isr %s neto %s', l.afp, l.sfs, l.isr, l.neto));
  select * into l from public.nomina_lineas where nomina_id = v_n and empleado_id = e3;
  perform pg_temp.ok('Nómina', '20,000: exento de ISR', l.isr = 0, format('isr %s', l.isr));
  perform pg_temp.ok('Nómina', 'La nómina mensual no incluye al empleado quincenal',
    not exists (select 1 from public.nomina_lineas where nomina_id = v_n and empleado_id = e4));

  -- novedades: horas extra y bonos se recalculan en el servidor
  select id into l from public.nomina_lineas where nomina_id = v_n and empleado_id = e1;
  perform public.actualizar_linea_nomina(l.id, 5000, 0, 0, 1000);
  select * into l from public.nomina_lineas where nomina_id = v_n and empleado_id = e1;
  perform pg_temp.ok('Nómina', 'Horas extra 5,000 y otra deducción 1,000 recalculan todo',
    l.bruto = 55000 and l.afp = 1578.5 and l.sfs = 1672 and l.neto = l.bruto - l.afp - l.sfs - l.isr - 1000,
    format('bruto %s afp %s sfs %s isr %s neto %s', l.bruto, l.afp, l.sfs, l.isr, l.neto));

  begin
    perform public.generar_nomina(v_s, date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '1 month - 1 day')::date, 'mensual', 'QA duplicada');
    perform pg_temp.ok('Nómina', 'No permite dos nóminas del mismo período (pago doble)', false, 'se generó una segunda nómina del mismo mes');
  exception when others then perform pg_temp.ok('Nómina', 'No permite dos nóminas del mismo período (pago doble)', true, sqlerrm);
  end;
  begin
    perform public.generar_nomina(v_s, current_date, current_date - 30, 'quincenal', 'QA fechas al revés');
    perform pg_temp.ok('Nómina', 'Rechaza período con fechas al revés', false, 'aceptado');
  exception when others then perform pg_temp.ok('Nómina', 'Rechaza período con fechas al revés', true, sqlerrm);
  end;

  v_n := public.generar_nomina(v_s, date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '14 day')::date, 'quincenal', 'QA quincenal');
  select * into l from public.nomina_lineas where nomina_id = v_n and empleado_id = e4;
  -- 30,000 por quincena: AFP 861, SFS 912, ISR = isr_anual((30000−1773)×24 = 677,448) / 24
  perform pg_temp.ok('Nómina', 'Quincenal 60,000/mes: salario 30,000, AFP 861, SFS 912, ISR 1,743.33',
    l.salario = 30000 and l.afp = 861 and l.sfs = 912 and l.isr = 1743.33, format('salario %s afp %s sfs %s isr %s', l.salario, l.afp, l.sfs, l.isr));

  v_n := pg_temp.c('nomina')::uuid;
  perform pg_temp.como(pg_temp.c('admin')::uuid);
  perform public.aprobar_nomina(v_n);
  perform pg_temp.yo_postgres();
  select sum(al.debe) - sum(al.haber) into n from public.asiento_lineas al join public.asientos a on a.id = al.asiento_id where a.origen_id = v_n;
  perform pg_temp.ok('Nómina', 'Asiento de nómina aprobada cuadra', n = 0, coalesce(n::text, 'sin asiento'));
  perform pg_temp.como(pg_temp.c('admin')::uuid);
  begin
    perform public.actualizar_linea_nomina((select id from public.nomina_lineas where nomina_id = v_n limit 1), 999, 0, 0, 0);
    perform pg_temp.ok('Nómina', 'Nómina aprobada ya no se edita', false, 'se editó');
  exception when others then perform pg_temp.ok('Nómina', 'Nómina aprobada ya no se edita', true, sqlerrm);
  end;
  begin
    perform public.eliminar_nomina_borrador(v_n);
    perform pg_temp.ok('Nómina', 'No se puede eliminar una nómina aprobada', false, 'se eliminó');
  exception when others then perform pg_temp.ok('Nómina', 'No se puede eliminar una nómina aprobada', true, sqlerrm);
  end;
  begin
    perform public.generar_nomina(v_s, current_date, current_date, 'semanal', 'QA');
    perform pg_temp.ok('Nómina', 'Rechaza frecuencia inválida', false, 'aceptada');
  exception when others then perform pg_temp.ok('Nómina', 'Rechaza frecuencia inválida', true, sqlerrm);
  end;
  begin
    update public.parametros_nomina set afp_empleado = 1 where sistema_id = v_s;
    get diagnostics n = row_count;
    perform pg_temp.ok('Nómina', 'El admin no cambia tasas TSS (solo superadmin)', n = 0, n || ' filas');
  end;
end $$;

-- ---------------------------------------------------------------- contabilidad
do $$
declare v_s uuid := pg_temp.c('s')::uuid; b record; n numeric;
begin
  perform pg_temp.como(pg_temp.c('contabilidad')::uuid);
  begin
    perform public.registrar_asiento_manual(v_s, current_date, 'Descuadrado', '[{"cuenta":"1.1.01","debe":100},{"cuenta":"6.2.99","haber":90}]');
    perform pg_temp.ok('Contabilidad', 'Rechaza asiento manual descuadrado', false, 'aceptado');
  exception when others then perform pg_temp.ok('Contabilidad', 'Rechaza asiento manual descuadrado', true, sqlerrm);
  end;
  perform public.registrar_asiento_manual(v_s, current_date, 'Ajuste QA', '[{"cuenta":"6.2.99","debe":100},{"cuenta":"1.1.01","haber":100}]');
  select sum(debe) d, sum(haber) h into b from public.balanza_comprobacion(v_s, current_date - 1, current_date + 1);
  perform pg_temp.ok('Contabilidad', 'Balanza de comprobación cuadra (debe = haber)', b.d = b.h, format('debe %s haber %s', b.d, b.h));
  perform pg_temp.yo_postgres();
  select count(*) into n from (
    select a.id from public.asientos a join public.asiento_lineas l on l.asiento_id = a.id
     where a.sistema_id = v_s group by a.id having sum(l.debe) <> sum(l.haber)) x;
  perform pg_temp.ok('Contabilidad', 'Todos los asientos del día cuadran', n = 0, n || ' descuadrados');
end $$;

-- ---------------------------------------------------------------- auditor, gerencia, enfermería, quiosco
do $$
declare v_s uuid := pg_temp.c('s')::uuid; n int; j jsonb; v_ok boolean;
begin
  perform pg_temp.como(pg_temp.c('auditor')::uuid);
  begin
    insert into public.pacientes (sistema_id, nombres, apellidos) values (v_s, 'No', 'Debe');
    perform pg_temp.ok('Auditor', 'Solo lectura: no crea pacientes', false, 'creó');
  exception when others then perform pg_temp.ok('Auditor', 'Solo lectura: no crea pacientes', true, sqlerrm);
  end;
  select count(*) into n from public.auditoria where sistema_id = v_s;
  perform pg_temp.ok('Auditor', 'Ve la bitácora de auditoría', n > 0, n::text);

  perform pg_temp.como(pg_temp.c('gerencia')::uuid);
  j := public.resumen_dashboard(v_s);
  perform pg_temp.ok('Gerencia', 'Inicio: resumen del día carga', j is not null and (j ->> 'citas_hoy')::int >= 2, j ->> 'citas_hoy');

  perform pg_temp.como(pg_temp.c('enfermeria')::uuid);
  select count(*) into n from public.cobros where sistema_id = v_s;
  perform pg_temp.ok('Enfermería', 'No ve cobros', n = 0, n::text);

  perform pg_temp.como(pg_temp.c('quiosco')::uuid);
  select count(*) into n from public.pacientes where sistema_id = v_s;
  perform pg_temp.ok('Quiosco', 'No ve la lista de pacientes', n = 0, n::text);
  j := public.quiosco_opciones(v_s);
  perform pg_temp.ok('Quiosco', 'Carga especialidades para tomar turno', j is not null, left(j::text, 120));
  j := public.quiosco_tomar_turno(v_s, null, '40212345678', null, null, 'Odontología', false, null);
  perform pg_temp.ok('Quiosco', 'Toma turno sin ficha (por identificar)', j ->> 'turno' like 'OD-%', j::text);
  select count(*) into n from public.pacientes where sistema_id = v_s;
  perform pg_temp.ok('Quiosco', 'El quiosco no crea pacientes', n = 0, n::text);
end $$;

-- ---------------------------------------------------------------- aislamiento con FUNBIDE real
do $$
declare v_real uuid := (select pruebas_de from public.sistemas where id = pg_temp.c('s')::uuid); n int;
begin
  perform pg_temp.como(pg_temp.c('admin')::uuid);
  select count(*) into n from public.pacientes where sistema_id = v_real;
  perform pg_temp.ok('Aislamiento', 'Admin del sistema de pruebas no ve pacientes de FUNBIDE real', n = 0, n::text);
end $$;

select pg_temp.yo_postgres();
select n, area, prueba, case when ok then 'OK' else 'FALLA' end as resultado, left(coalesce(detalle, ''), 160) as detalle from r order by n;
rollback;
