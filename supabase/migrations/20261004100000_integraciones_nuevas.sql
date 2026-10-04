-- ============================================================================
-- MEDORA . Conectores nuevos: e-CF (DGII), SENASA, laboratorio y JCE
--
-- Se suman al centro de integraciones de cada hospital (mismas reglas: datos
-- visibles en config, claves en Supabase Vault, escritura solo por RPC y bitácora
-- append-only):
--   dgii_ecf     Facturación electrónica directa con la DGII: ambiente y el
--                certificado digital del emisor (.p12 en base64 + su clave).
--   ars_senasa   Prestador de SENASA: código de prestador y acceso al portal
--                (validación de afiliación cuando SENASA dé el servicio).
--   laboratorio  Recepción de resultados: el laboratorio envía con un token propio
--                del hospital a la Edge Function "laboratorio".
--   jce          Validación de cédulas con el servicio autorizado (JCE/OGTIC).
-- El certificado .p12 en base64 ocupa varios KB: el límite por clave sube a 16 KB.
-- ============================================================================

alter table public.integraciones drop constraint integraciones_proveedor_check;
alter table public.integraciones add constraint integraciones_proveedor_check
  check (proveedor in ('whatsapp', 'azul', 'dgii_ecf', 'ars_senasa', 'laboratorio', 'jce'));

create or replace function privado.campos_integracion(p_proveedor text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case p_proveedor
    when 'whatsapp'    then '{"config": ["phone_number_id", "waba_id"], "secretos": ["token"], "requeridos": ["phone_number_id", "token"]}'
    when 'azul'        then '{"config": ["merchant_id", "nombre_comercio", "ambiente"], "secretos": ["auth1", "auth2"], "requeridos": ["merchant_id", "auth1", "auth2"]}'
    when 'dgii_ecf'    then '{"config": ["ambiente", "url_ecf", "url_fc"], "secretos": ["certificado", "clave_certificado"], "requeridos": ["ambiente", "certificado", "clave_certificado"]}'
    when 'ars_senasa'  then '{"config": ["codigo_prestador", "usuario_portal", "url_servicio"], "secretos": ["clave_portal"], "requeridos": ["codigo_prestador"]}'
    when 'laboratorio' then '{"config": ["nombre_laboratorio", "contacto"], "secretos": ["token"], "requeridos": ["nombre_laboratorio", "token"]}'
    when 'jce'         then '{"config": ["url_servicio", "usuario"], "secretos": ["clave"], "requeridos": ["url_servicio", "usuario", "clave"]}'
  end::jsonb;
$$;
revoke all on function privado.campos_integracion(text) from public, anon, authenticated;

-- Guardar (config visible + claves a Vault). Igual que antes; solo cambia el límite
-- de tamaño de una clave (el certificado digital en base64 pasa de 4 KB).
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

  for v_campo in select jsonb_array_elements_text(v_campos -> 'secretos') loop
    v_valor := nullif(trim(coalesce(p_secretos ->> v_campo, '')), '');
    continue when v_valor is null;
    if length(v_valor) > 16384 then
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

revoke all on function public.guardar_integracion(uuid, text, jsonb, jsonb) from public, anon;
grant execute on function public.guardar_integracion(uuid, text, jsonb, jsonb) to authenticated;

-- Las Edge Functions (service_role) anotan envíos, avisos recibidos y errores.
create or replace function public.registrar_evento_integracion(
  p_sistema uuid, p_proveedor text, p_tipo text, p_ok boolean, p_detalle jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.integracion_eventos (sistema_id, proveedor, tipo, resultado, detalle, creado_por)
  values (p_sistema, p_proveedor, p_tipo, case when p_ok then 'ok' else 'error' end, coalesce(p_detalle, '{}'), null);
$$;
revoke all on function public.registrar_evento_integracion(uuid, text, text, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.registrar_evento_integracion(uuid, text, text, boolean, jsonb) to service_role;
