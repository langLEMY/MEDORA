-- ============================================================================
-- MEDORA · 0014 · Importación masiva desde Excel
--
-- La app lee el Excel (SheetJS), normaliza las columnas y manda las filas en
-- lotes a estas RPC. Igual que en FUNBIDE, reimportar no duplica: cada fila se
-- reconcilia con lo existente (por documento/código y, si no hay, por nombre).
-- Cada fila corre en su propia subtransacción: una fila mala se reporta y no
-- tumba el lote. Todo queda en la auditoría por los triggers de cada tabla.
--
-- Resultado: { creados, actualizados, omitidos, errores: ["Fila 7: …"] }
-- La fila de cada objeto viene en la clave "_fila" (número de fila del Excel).
-- ============================================================================

create or replace function privado.resultado_importacion(c int, a int, o int, e text[])
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('creados', c, 'actualizados', a, 'omitidos', o, 'errores', to_jsonb(coalesce(e[1:200], '{}')));
$$;

create or replace function privado.texto(p jsonb, k text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(trim(p ->> k), '');
$$;

create or replace function privado.numero(p jsonb, k text)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
begin
  return nullif(replace(replace(trim(p ->> k), ',', ''), 'RD$', ''), '')::numeric;
exception when others then
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Pacientes
-- ---------------------------------------------------------------------------
create or replace function public.importar_pacientes(p_sistema uuid, p_filas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  f jsonb;
  v_id uuid;
  v_aseg uuid;
  c int := 0; a int := 0; o int := 0;
  e text[] := '{}';
  v_fila text;
begin
  if not privado.tiene_rol(p_sistema, '{admin,recepcion,medico,enfermeria,caja,psicologia,nutricion,terapia}') then
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
        -- Existente: solo se completan los campos vacíos (no se pisa lo ya cargado).
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
$$;

-- ---------------------------------------------------------------------------
-- Inventario (artículos). "existencia" = conteo físico: si difiere del stock
-- actual se registra un ajuste (o entrada inicial) trazable.
-- ---------------------------------------------------------------------------
create or replace function public.importar_inventario(p_sistema uuid, p_filas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  f jsonb;
  v_item public.inventario_items;
  v_existencia numeric;
  v_delta numeric;
  c int := 0; a int := 0; o int := 0;
  e text[] := '{}';
  v_fila text;
begin
  if not privado.tiene_rol(p_sistema, '{admin,farmacia}') then
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
$$;

-- Movimientos de inventario (entradas, salidas y ajustes) por código o nombre.
create or replace function public.importar_movimientos_inventario(p_sistema uuid, p_filas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  f jsonb;
  v_item uuid;
  v_tipo text;
  c int := 0; o int := 0;
  e text[] := '{}';
  v_fila text;
begin
  if not privado.tiene_rol(p_sistema, '{admin,farmacia}') then
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
$$;

-- ---------------------------------------------------------------------------
-- Empleados (nómina)
-- ---------------------------------------------------------------------------
create or replace function public.importar_empleados(p_sistema uuid, p_filas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  f jsonb;
  v_id uuid;
  c int := 0; a int := 0; o int := 0;
  e text[] := '{}';
  v_fila text;
begin
  if not privado.tiene_rol(p_sistema, '{admin,contabilidad,gerencia}') then
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
$$;

-- ---------------------------------------------------------------------------
-- Servicios (catálogo de precios)
-- ---------------------------------------------------------------------------
create or replace function public.importar_servicios(p_sistema uuid, p_filas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  f jsonb;
  v_id uuid;
  c int := 0; a int := 0; o int := 0;
  e text[] := '{}';
  v_fila text;
begin
  if not privado.tiene_rol(p_sistema, '{admin}') then
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
$$;

-- Tarifario de una aseguradora: cuánto cubre de cada servicio.
create or replace function public.importar_coberturas(p_sistema uuid, p_aseguradora uuid, p_filas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  f jsonb;
  v_serv uuid;
  v_existia boolean;
  c int := 0; a int := 0; o int := 0;
  e text[] := '{}';
  v_fila text;
begin
  if not privado.tiene_rol(p_sistema, '{admin}') then
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
      insert into public.coberturas (sistema_id, aseguradora_id, servicio_id, monto_cubierto)
      values (p_sistema, p_aseguradora, v_serv, privado.numero(f, 'monto_cubierto'))
      on conflict (aseguradora_id, servicio_id) do update set monto_cubierto = excluded.monto_cubierto;
      if v_existia then a := a + 1; else c := c + 1; end if;
    exception when others then
      o := o + 1;
      e := e || ('Fila ' || v_fila || ': ' || sqlerrm);
    end;
  end loop;
  return privado.resultado_importacion(c, a, o, e);
end;
$$;

-- ---------------------------------------------------------------------------
-- Proveedores
-- ---------------------------------------------------------------------------
create or replace function public.importar_proveedores(p_sistema uuid, p_filas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  f jsonb;
  v_id uuid;
  c int := 0; a int := 0; o int := 0;
  e text[] := '{}';
  v_fila text;
begin
  if not privado.tiene_rol(p_sistema, '{admin,farmacia,contabilidad,gerencia}') then
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
$$;

revoke all on function privado.resultado_importacion(int, int, int, text[]) from public, anon, authenticated;
revoke all on function privado.texto(jsonb, text) from public, anon, authenticated;
revoke all on function privado.numero(jsonb, text) from public, anon, authenticated;

revoke all on function public.importar_pacientes(uuid, jsonb) from public, anon;
revoke all on function public.importar_inventario(uuid, jsonb) from public, anon;
revoke all on function public.importar_movimientos_inventario(uuid, jsonb) from public, anon;
revoke all on function public.importar_empleados(uuid, jsonb) from public, anon;
revoke all on function public.importar_servicios(uuid, jsonb) from public, anon;
revoke all on function public.importar_coberturas(uuid, uuid, jsonb) from public, anon;
revoke all on function public.importar_proveedores(uuid, jsonb) from public, anon;
grant execute on function public.importar_pacientes(uuid, jsonb) to authenticated;
grant execute on function public.importar_inventario(uuid, jsonb) to authenticated;
grant execute on function public.importar_movimientos_inventario(uuid, jsonb) to authenticated;
grant execute on function public.importar_empleados(uuid, jsonb) to authenticated;
grant execute on function public.importar_servicios(uuid, jsonb) to authenticated;
grant execute on function public.importar_coberturas(uuid, uuid, jsonb) to authenticated;
grant execute on function public.importar_proveedores(uuid, jsonb) to authenticated;
