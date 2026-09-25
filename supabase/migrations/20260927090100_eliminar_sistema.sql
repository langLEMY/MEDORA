-- ============================================================================
-- MEDORA · 0016 · Eliminación de un sistema hospitalario sin apagar triggers
--
-- Supabase no deja cambiar session_replication_role desde una función, así que
-- la eliminación usa un permiso acotado: plataforma_eliminar_sistema() marca en
-- la transacción qué sistema se está borrando (GUC medora.eliminando_sistema) y
-- los triggers append-only / de nómina aprobada / de auditoría dejan pasar solo
-- los DELETE de filas de ese sistema, y solo si quien ejecuta es superadmin.
-- PostgREST no permite a los clientes fijar GUCs arbitrarios.
-- ============================================================================

create or replace function privado.eliminando_sistema(p_sistema uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_sistema is not null
     and coalesce(current_setting('medora.eliminando_sistema', true), '') = p_sistema::text
     and privado.es_superadmin();
$$;

create or replace function privado.tg_bloquear_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and privado.eliminando_sistema((to_jsonb(old) ->> 'sistema_id')::uuid) then
    return old;
  end if;
  raise exception 'La tabla %.% es append-only: no se permiten UPDATE ni DELETE.',
    tg_table_schema, tg_table_name
    using errcode = '42501';
end;
$$;

create or replace function privado.tg_lineas_solo_recodificar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and privado.eliminando_sistema(old.sistema_id) then
    return old;
  end if;
  if tg_op = 'DELETE'
     or new.debe is distinct from old.debe or new.haber is distinct from old.haber
     or new.asiento_id is distinct from old.asiento_id or new.sistema_id is distinct from old.sistema_id then
    raise exception 'Las líneas de asiento son append-only.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function privado.tg_nomina_congelada()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_estado text;
begin
  if tg_op = 'DELETE' and privado.eliminando_sistema(old.sistema_id) then
    return old;
  end if;
  if tg_table_name = 'nominas' then
    if old.estado = 'aprobada' then
      raise exception 'La nómina % ya está aprobada y no puede modificarse.', old.numero using errcode = '42501';
    end if;
  else
    select estado into v_estado from public.nominas where id = coalesce(new.nomina_id, old.nomina_id);
    if v_estado = 'aprobada' then
      raise exception 'La nómina ya está aprobada y no puede modificarse.' using errcode = '42501';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

-- Durante la eliminación no se audita fila por fila (la bitácora del sistema
-- también se borra): queda un único evento ELIMINAR_SISTEMA a nivel plataforma.
create or replace function privado.tg_auditar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nuevo   jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_viejo   jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_fila    jsonb := coalesce(v_nuevo, v_viejo);
  v_cambios jsonb;
  v_sistema uuid;
begin
  v_sistema := case when tg_table_name = 'sistemas' then (v_fila ->> 'id')::uuid
                    else (v_fila ->> 'sistema_id')::uuid end;

  if tg_op = 'DELETE' and privado.eliminando_sistema(v_sistema) then
    return null;
  end if;

  if tg_nargs > 0 and tg_argv[0] = 'sin_datos' then
    v_cambios := null;
  elsif tg_op = 'UPDATE' then
    select jsonb_object_agg(n.key, jsonb_build_object('antes', v_viejo -> n.key, 'despues', n.value))
      into v_cambios
      from jsonb_each(v_nuevo) n
     where n.value is distinct from v_viejo -> n.key
       and n.key not in ('actualizado_en', 'actualizado_por', 'busqueda', 'stock_actual');
    if v_cambios is null then
      return null;
    end if;
  elsif tg_op = 'INSERT' then
    v_cambios := v_nuevo - 'busqueda';
  else
    v_cambios := v_viejo;
  end if;

  insert into public.auditoria (sistema_id, usuario_id, accion, tabla, registro_id, cambios)
  values (v_sistema, auth.uid(), tg_op, tg_table_name, v_fila ->> 'id', v_cambios);
  return null;
end;
$$;

-- Borra tabla por tabla en orden de dependencias: cada pasada intenta vaciar las
-- tablas pendientes (una subtransacción por tabla); las que todavía tienen hijos
-- fallan por FK y se reintentan en la siguiente pasada.
create or replace function public.plataforma_eliminar_sistema(p_sistema uuid, p_confirmacion text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre     text;
  v_tabla      text;
  v_n          bigint;
  v_conteos    jsonb := '{}';
  v_pendientes text[];
  v_restantes  text[];
  v_error      text;
begin
  if not privado.es_superadmin() then
    raise exception 'Solo la superadministración puede eliminar sistemas.' using errcode = '42501';
  end if;

  select nombre into v_nombre from public.sistemas where id = p_sistema for update;
  if v_nombre is null then
    raise exception 'El sistema no existe.' using errcode = 'P0002';
  end if;
  if coalesce(trim(p_confirmacion), '') <> v_nombre then
    raise exception 'Para confirmar, escribe exactamente el nombre del sistema.' using errcode = 'P0001';
  end if;

  perform set_config('medora.eliminando_sistema', p_sistema::text, true);

  select array_agg(c.table_name::text)
    into v_pendientes
    from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
   where c.table_schema = 'public' and c.column_name = 'sistema_id' and t.table_type = 'BASE TABLE';

  while cardinality(v_pendientes) > 0 loop
    v_restantes := '{}';
    foreach v_tabla in array v_pendientes loop
      begin
        execute format('delete from public.%I where sistema_id = $1', v_tabla) using p_sistema;
        get diagnostics v_n = row_count;
        if v_n > 0 then
          v_conteos := v_conteos || jsonb_build_object(v_tabla, v_n);
        end if;
      exception when foreign_key_violation then
        v_restantes := v_restantes || v_tabla;
        v_error := sqlerrm;
      end;
    end loop;
    if cardinality(v_restantes) = cardinality(v_pendientes) then
      raise exception 'No se pudo eliminar el sistema: %', v_error;
    end if;
    v_pendientes := v_restantes;
  end loop;

  update public.perfiles set ultimo_sistema_id = null where ultimo_sistema_id = p_sistema;
  delete from public.sistemas where id = p_sistema;

  perform set_config('medora.eliminando_sistema', '', true);

  insert into public.auditoria (usuario_id, accion, tabla, registro_id, cambios)
  values (auth.uid(), 'ELIMINAR_SISTEMA', 'sistemas', p_sistema::text,
          jsonb_build_object('nombre', v_nombre, 'registros', v_conteos));

  return jsonb_build_object('nombre', v_nombre, 'registros', v_conteos);
end;
$$;

revoke all on function privado.eliminando_sistema(uuid) from public, anon;
grant execute on function privado.eliminando_sistema(uuid) to authenticated, service_role;
