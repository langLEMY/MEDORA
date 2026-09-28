-- ============================================================================
-- MEDORA · Importar desde Excel la configuración de nómina, contabilidad y
-- comisiones, para que cada hospital se configure sin cargar dato por dato:
--   · importar_parametros_nomina  — tasas TSS/INFOTEP y topes (Concepto | Valor)
--   · importar_escala_isr         — escala anual de ISR (reemplaza la vigente)
--   · importar_novedades_nomina   — horas extra, bonos, etc. de una nómina en borrador
--   · importar_cuentas_contables  — catálogo de cuentas (padre y tipo se deducen del código)
--   · importar_reglas_comision    — reglas de comisión por persona, rol, servicio o categoría
-- Mismo contrato que las demás importaciones: (p_sistema, p_filas[, extra]) →
-- privado.resultado_importacion, una subtransacción por fila.
-- ============================================================================

-- Texto sin tildes, en minúsculas y sin signos: para reconocer conceptos escritos a mano.
create or replace function privado.clave_texto(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(regexp_replace(lower(translate(coalesce(p, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')), '[^a-z0-9%]+', ' ', 'g'));
$$;

-- ---------------------------------------------------------------------------
-- Parámetros TSS
-- ---------------------------------------------------------------------------
create or replace function public.importar_parametros_nomina(p_sistema uuid, p_filas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  f jsonb;
  v_clave text;
  v_valor numeric;
  v_columna text;
  a int := 0; o int := 0;
  e text[] := '{}';
  v_fila text;
begin
  if not privado.tiene_rol(p_sistema, '{admin,contabilidad,gerencia}', 'nomina') then
    raise exception 'No tienes permiso para configurar la nómina.' using errcode = '42501';
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
$$;

-- ---------------------------------------------------------------------------
-- Escala de ISR (anual). Cada fila es un tramo; se ordenan por "hasta" y el
-- último queda abierto. "Excedente de" se deduce del tramo anterior.
-- ---------------------------------------------------------------------------
create or replace function public.importar_escala_isr(p_sistema uuid, p_filas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tramos jsonb;
  v_escala jsonb := '[]';
  t record;
  v_anterior numeric := 0;
  v_n int;
begin
  if not privado.tiene_rol(p_sistema, '{admin,contabilidad,gerencia}', 'nomina') then
    raise exception 'No tienes permiso para configurar la nómina.' using errcode = '42501';
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
$$;

-- ---------------------------------------------------------------------------
-- Novedades de una nómina en borrador (por cédula o nombre del empleado)
-- ---------------------------------------------------------------------------
create or replace function public.importar_novedades_nomina(p_sistema uuid, p_filas jsonb, p_nomina uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  f jsonb;
  n public.nominas;
  v_linea uuid;
  v_nombre text;
  a int := 0; o int := 0;
  e text[] := '{}';
  v_fila text;
begin
  if not privado.tiene_rol(p_sistema, '{admin,contabilidad,gerencia}', 'nomina') then
    raise exception 'No tienes permiso para editar nóminas.' using errcode = '42501';
  end if;
  select * into n from public.nominas where id = p_nomina and sistema_id = p_sistema;
  if n.id is null then
    raise exception 'Nómina no encontrada.' using errcode = 'P0001';
  end if;
  if n.estado <> 'borrador' then
    raise exception 'La nómina ya está aprobada; no se puede modificar.' using errcode = 'P0001';
  end if;

  for f in select * from jsonb_array_elements(p_filas) loop
    v_fila := coalesce(f ->> '_fila', '?');
    begin
      v_linea := null;
      if privado.texto(f, 'cedula') is not null then
        select l.id into v_linea from public.nomina_lineas l join public.empleados em on em.id = l.empleado_id
         where l.nomina_id = p_nomina and regexp_replace(em.cedula, '\D', '', 'g') = regexp_replace(privado.texto(f, 'cedula'), '\D', '', 'g');
      end if;
      if v_linea is null and privado.texto(f, 'empleado') is not null then
        v_nombre := privado.clave_texto(privado.texto(f, 'empleado'));
        select l.id into v_linea from public.nomina_lineas l join public.empleados em on em.id = l.empleado_id
         where l.nomina_id = p_nomina and privado.clave_texto(em.nombres || ' ' || em.apellidos) = v_nombre
         limit 1;
      end if;
      if v_linea is null then
        o := o + 1;
        e := e || ('Fila ' || v_fila || ': el empleado no está en esta nómina.');
        continue;
      end if;
      update public.nomina_lineas set
        horas_extra       = coalesce(privado.numero(f, 'horas_extra'), horas_extra),
        bonos             = coalesce(privado.numero(f, 'bonos'), bonos),
        otros_ingresos    = coalesce(privado.numero(f, 'otros_ingresos'), otros_ingresos),
        otras_deducciones = coalesce(privado.numero(f, 'otras_deducciones'), otras_deducciones)
      where id = v_linea;
      perform privado.calcular_linea_nomina(v_linea);
      a := a + 1;
    exception when others then
      o := o + 1;
      e := e || ('Fila ' || v_fila || ': ' || sqlerrm);
    end;
  end loop;
  return privado.resultado_importacion(0, a, o, e);
end;
$$;

-- ---------------------------------------------------------------------------
-- Catálogo de cuentas. El padre es el código sin su último segmento (6.2.05 → 6.2)
-- y el tipo, si no viene, sale del primer dígito (1 activo … 6 gasto). Las cuentas
-- nuevas que quedan con hijas pasan a ser de agrupación.
-- ---------------------------------------------------------------------------
create or replace function public.importar_cuentas_contables(p_sistema uuid, p_filas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
  if not privado.tiene_rol(p_sistema, '{admin,contabilidad}', 'contabilidad') then
    raise exception 'No tienes permiso para editar el catálogo de cuentas.' using errcode = '42501';
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
$$;

-- ---------------------------------------------------------------------------
-- Reglas de comisión (se actualizan por nombre de la regla)
-- ---------------------------------------------------------------------------
create or replace function public.importar_reglas_comision(p_sistema uuid, p_filas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
        v_rol := coalesce(privado.texto(f, 'rol'), 'medico')::public.rol_sistema;
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
        coalesce(privado.texto(f, 'persona'), initcap(v_rol::text)),
        coalesce(privado.texto(f, 'servicio'), v_categoria, 'todos los servicios'),
        case when v_tipo = 'fijo' then 'RD$' || v_valor || ' c/u' else v_valor || '%' end), 120));

      select id into v_id from public.reglas_comision where sistema_id = p_sistema and lower(nombre) = lower(v_nombre) limit 1;
      if v_id is null then
        insert into public.reglas_comision (sistema_id, nombre, aplica_a, beneficiario_id, rol, servicio_id, categoria, tipo, valor, base,
                                            vigente_desde, vigente_hasta)
        values (p_sistema, v_nombre, v_aplica, v_persona, v_rol, v_servicio, v_categoria, v_tipo, v_valor,
                coalesce(privado.texto(f, 'base'), 'bruto'), (privado.texto(f, 'vigente_desde'))::date, (privado.texto(f, 'vigente_hasta'))::date);
        c := c + 1;
      else
        update public.reglas_comision set
          aplica_a = v_aplica, beneficiario_id = v_persona, rol = v_rol, servicio_id = v_servicio, categoria = v_categoria,
          tipo = v_tipo, valor = v_valor, base = coalesce(privado.texto(f, 'base'), base),
          vigente_desde = coalesce((privado.texto(f, 'vigente_desde'))::date, vigente_desde),
          vigente_hasta = coalesce((privado.texto(f, 'vigente_hasta'))::date, vigente_hasta),
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
$$;

revoke all on function privado.clave_texto(text) from public, anon, authenticated;
revoke all on function public.importar_parametros_nomina(uuid, jsonb) from public, anon;
revoke all on function public.importar_escala_isr(uuid, jsonb) from public, anon;
revoke all on function public.importar_novedades_nomina(uuid, jsonb, uuid) from public, anon;
revoke all on function public.importar_cuentas_contables(uuid, jsonb) from public, anon;
revoke all on function public.importar_reglas_comision(uuid, jsonb) from public, anon;
grant execute on function public.importar_parametros_nomina(uuid, jsonb) to authenticated;
grant execute on function public.importar_escala_isr(uuid, jsonb) to authenticated;
grant execute on function public.importar_novedades_nomina(uuid, jsonb, uuid) to authenticated;
grant execute on function public.importar_cuentas_contables(uuid, jsonb) to authenticated;
grant execute on function public.importar_reglas_comision(uuid, jsonb) to authenticated;
