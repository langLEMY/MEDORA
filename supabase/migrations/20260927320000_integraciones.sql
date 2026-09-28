-- ============================================================================
-- MEDORA · Conectores (fase 1): centro de integraciones de cada hospital
--
-- Cada sistema conecta SUS cuentas: WhatsApp Business (Cloud API de Meta), Azul
-- (pagos), correo (Resend) y SMS (Twilio). Reglas:
--   · Las claves van cifradas en Supabase Vault. La tabla solo guarda el id del
--     secreto y una pista ("…4f2a"): el admin puede poner o reemplazar una clave,
--     nunca volver a leerla. Solo el service_role (Edge Functions) la descifra.
--   · Toda escritura pasa por RPC que valida que quien llama administra el sistema.
--   · integracion_eventos es una bitácora append-only (configuración, pruebas,
--     activación y, más adelante, envíos y webhooks).
-- ============================================================================

create table public.integraciones (
  id               uuid primary key default gen_random_uuid(),
  sistema_id       uuid not null references public.sistemas(id) on delete restrict,
  proveedor        text not null check (proveedor in ('whatsapp', 'azul', 'correo', 'sms')),
  activo           boolean not null default false,
  estado           text not null default 'sin_configurar' check (estado in ('sin_configurar', 'sin_probar', 'conectado', 'error')),
  config           jsonb not null default '{}' check (jsonb_typeof(config) = 'object'),
  -- {campo: {id: <vault uuid>, pista: "…4f2a", actualizado_en}}; los ids no revelan nada.
  secretos         jsonb not null default '{}' check (jsonb_typeof(secretos) = 'object'),
  detalle_conexion jsonb,
  ultimo_error     text,
  verificado_en    timestamptz,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  actualizado_por  uuid,
  unique (sistema_id, proveedor),
  unique (sistema_id, id),
  check (not activo or estado = 'conectado')
);
create trigger trg_integraciones_actualizacion before update on public.integraciones
  for each row execute function privado.tg_marcar_actualizacion();
create trigger trg_integraciones_auditoria after insert or update or delete on public.integraciones
  for each row execute function privado.tg_auditar();

create table public.integracion_eventos (
  id          uuid primary key default gen_random_uuid(),
  sistema_id  uuid not null references public.sistemas(id) on delete restrict,
  proveedor   text not null,
  tipo        text not null check (tipo in ('configuracion', 'prueba', 'activacion', 'baja', 'envio', 'webhook', 'error')),
  resultado   text not null default 'ok' check (resultado in ('ok', 'error')),
  detalle     jsonb not null default '{}',
  creado_por  uuid default auth.uid(),
  creado_en   timestamptz not null default now()
);
create index ix_integracion_eventos on public.integracion_eventos (sistema_id, creado_en desc);
create trigger trg_integracion_eventos_append_only before update or delete on public.integracion_eventos
  for each row execute function privado.tg_bloquear_append_only();

alter table public.integraciones enable row level security;
alter table public.integracion_eventos enable row level security;
revoke all on public.integraciones, public.integracion_eventos from anon, authenticated;
grant select on public.integraciones, public.integracion_eventos to authenticated;
create policy integraciones_select on public.integraciones for select to authenticated
  using (sistema_id in (select privado.sistemas_administrables()));
create policy integracion_eventos_select on public.integracion_eventos for select to authenticated
  using (sistema_id in (select privado.sistemas_administrables()));

-- Qué acepta cada proveedor: datos visibles (config) y claves (secretos), y cuáles son obligatorios.
create or replace function privado.campos_integracion(p_proveedor text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case p_proveedor
    when 'whatsapp' then '{"config": ["phone_number_id", "waba_id"], "secretos": ["token"], "requeridos": ["phone_number_id", "token"]}'
    when 'azul'     then '{"config": ["merchant_id", "nombre_comercio", "ambiente"], "secretos": ["auth1", "auth2"], "requeridos": ["merchant_id", "auth1", "auth2"]}'
    when 'correo'   then '{"config": ["remitente", "nombre_remitente"], "secretos": ["api_key"], "requeridos": ["remitente", "api_key"]}'
    when 'sms'      then '{"config": ["account_sid", "numero_origen"], "secretos": ["auth_token"], "requeridos": ["account_sid", "numero_origen", "auth_token"]}'
  end::jsonb;
$$;

-- ---------------------------------------------------------------------------
-- Guardar (config visible + claves a Vault). Claves vacías = no cambiar.
-- ---------------------------------------------------------------------------
create or replace function public.guardar_integracion(p_sistema uuid, p_proveedor text, p_config jsonb, p_secretos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campos jsonb := privado.campos_integracion(p_proveedor);
  v_fila public.integraciones;
  v_config jsonb := '{}';
  v_secretos jsonb;
  v_campo text;
  v_valor text;
  v_id uuid;
  v_cambios text[] := '{}';
  v_completo boolean;
begin
  if p_sistema not in (select privado.sistemas_administrables()) then
    raise exception 'Solo la administración del hospital configura integraciones.' using errcode = '42501';
  end if;
  if v_campos is null then
    raise exception 'Integración desconocida.' using errcode = 'P0001';
  end if;

  insert into public.integraciones (sistema_id, proveedor) values (p_sistema, p_proveedor)
  on conflict (sistema_id, proveedor) do nothing;
  select * into v_fila from public.integraciones where sistema_id = p_sistema and proveedor = p_proveedor for update;
  v_secretos := v_fila.secretos;

  -- Datos visibles: solo los campos conocidos, como texto recortado.
  for v_campo in select jsonb_array_elements_text(v_campos -> 'config') loop
    v_valor := nullif(trim(coalesce(p_config ->> v_campo, '')), '');
    if v_valor is not null then
      if length(v_valor) > 200 then
        raise exception 'El dato "%" es demasiado largo.', v_campo using errcode = 'P0001';
      end if;
      v_config := v_config || jsonb_build_object(v_campo, v_valor);
    end if;
    if (v_fila.config ->> v_campo) is distinct from v_valor then
      v_cambios := v_cambios || v_campo;
    end if;
  end loop;

  -- Claves: a Vault. Solo se guarda su id y los últimos 4 caracteres.
  for v_campo in select jsonb_array_elements_text(v_campos -> 'secretos') loop
    v_valor := nullif(trim(coalesce(p_secretos ->> v_campo, '')), '');
    continue when v_valor is null;
    if length(v_valor) > 4096 then
      raise exception 'La clave "%" es demasiado larga.', v_campo using errcode = 'P0001';
    end if;
    v_id := (v_secretos -> v_campo ->> 'id')::uuid;
    if v_id is not null and exists (select 1 from vault.secrets where id = v_id) then
      perform vault.update_secret(v_id, v_valor);
    else
      v_id := vault.create_secret(v_valor, 'integracion:' || p_sistema || ':' || p_proveedor || ':' || v_campo,
                                  'Clave de la integración ' || p_proveedor || ' del sistema ' || p_sistema);
    end if;
    v_secretos := v_secretos || jsonb_build_object(v_campo,
      jsonb_build_object('id', v_id, 'pista', '…' || right(v_valor, 4), 'actualizado_en', now()));
    v_cambios := v_cambios || v_campo;
  end loop;

  select bool_and(coalesce(v_config ->> r, v_secretos -> r ->> 'id') is not null) into v_completo
    from jsonb_array_elements_text(v_campos -> 'requeridos') r;

  update public.integraciones set
    config = v_config,
    secretos = v_secretos,
    estado = case when not v_completo then 'sin_configurar'
                  when cardinality(v_cambios) > 0 then 'sin_probar' else estado end,
    activo = case when cardinality(v_cambios) > 0 then false else activo end,
    actualizado_por = auth.uid()
  where id = v_fila.id
  returning * into v_fila;

  if cardinality(v_cambios) > 0 then
    insert into public.integracion_eventos (sistema_id, proveedor, tipo, detalle)
    values (p_sistema, p_proveedor, 'configuracion', jsonb_build_object('campos', to_jsonb(v_cambios)));
  end if;
  return jsonb_build_object('estado', v_fila.estado, 'cambios', to_jsonb(v_cambios));
end;
$$;

-- Activar / pausar (solo si la última prueba salió bien).
create or replace function public.activar_integracion(p_sistema uuid, p_proveedor text, p_activo boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estado text;
begin
  if p_sistema not in (select privado.sistemas_administrables()) then
    raise exception 'Solo la administración del hospital configura integraciones.' using errcode = '42501';
  end if;
  select estado into v_estado from public.integraciones where sistema_id = p_sistema and proveedor = p_proveedor;
  if p_activo and v_estado is distinct from 'conectado' then
    raise exception 'Prueba la conexión antes de activarla.' using errcode = 'P0001';
  end if;
  update public.integraciones set activo = p_activo, actualizado_por = auth.uid()
   where sistema_id = p_sistema and proveedor = p_proveedor;
  insert into public.integracion_eventos (sistema_id, proveedor, tipo, detalle)
  values (p_sistema, p_proveedor, 'activacion', jsonb_build_object('activo', p_activo));
end;
$$;

-- Quitar: borra las claves de Vault y deja la integración sin configurar.
create or replace function public.quitar_integracion(p_sistema uuid, p_proveedor text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secretos jsonb;
begin
  if p_sistema not in (select privado.sistemas_administrables()) then
    raise exception 'Solo la administración del hospital configura integraciones.' using errcode = '42501';
  end if;
  select secretos into v_secretos from public.integraciones where sistema_id = p_sistema and proveedor = p_proveedor for update;
  delete from vault.secrets where id in (select (value ->> 'id')::uuid from jsonb_each(coalesce(v_secretos, '{}')));
  update public.integraciones set activo = false, estado = 'sin_configurar', config = '{}', secretos = '{}',
         detalle_conexion = null, ultimo_error = null, verificado_en = null, actualizado_por = auth.uid()
   where sistema_id = p_sistema and proveedor = p_proveedor;
  insert into public.integracion_eventos (sistema_id, proveedor, tipo) values (p_sistema, p_proveedor, 'baja');
end;
$$;

-- ---------------------------------------------------------------------------
-- Solo para la Edge Function "integraciones" (service_role)
-- ---------------------------------------------------------------------------
create or replace function public.integracion_secreto(p_sistema uuid, p_proveedor text, p_campo text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select d.decrypted_secret
    from public.integraciones i
    join vault.decrypted_secrets d on d.id = (i.secretos -> p_campo ->> 'id')::uuid
   where i.sistema_id = p_sistema and i.proveedor = p_proveedor;
$$;

create or replace function public.registrar_prueba_integracion(
  p_sistema uuid, p_proveedor text, p_ok boolean, p_detalle jsonb, p_error text, p_usuario uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.integraciones set
    estado = case when p_ok then 'conectado' else 'error' end,
    activo = case when p_ok then activo else false end,
    detalle_conexion = case when p_ok then p_detalle else detalle_conexion end,
    ultimo_error = case when p_ok then null else left(p_error, 500) end,
    verificado_en = now(),
    actualizado_por = p_usuario
  where sistema_id = p_sistema and proveedor = p_proveedor;
  insert into public.integracion_eventos (sistema_id, proveedor, tipo, resultado, detalle, creado_por)
  values (p_sistema, p_proveedor, 'prueba', case when p_ok then 'ok' else 'error' end,
          case when p_ok then coalesce(p_detalle, '{}') else jsonb_build_object('error', left(p_error, 500)) end, p_usuario);
end;
$$;

revoke all on function privado.campos_integracion(text) from public, anon, authenticated;
revoke all on function public.guardar_integracion(uuid, text, jsonb, jsonb) from public, anon;
revoke all on function public.activar_integracion(uuid, text, boolean) from public, anon;
revoke all on function public.quitar_integracion(uuid, text) from public, anon;
revoke all on function public.integracion_secreto(uuid, text, text) from public, anon, authenticated;
revoke all on function public.registrar_prueba_integracion(uuid, text, boolean, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.guardar_integracion(uuid, text, jsonb, jsonb) to authenticated;
grant execute on function public.activar_integracion(uuid, text, boolean) to authenticated;
grant execute on function public.quitar_integracion(uuid, text) to authenticated;
grant execute on function public.integracion_secreto(uuid, text, text) to service_role;
grant execute on function public.registrar_prueba_integracion(uuid, text, boolean, jsonb, text, uuid) to service_role;
