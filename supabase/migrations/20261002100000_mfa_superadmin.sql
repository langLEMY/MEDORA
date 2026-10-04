-- ============================================================================
-- MEDORA . Verificación en dos pasos (2FA / TOTP)
--
-- Reconstruida el 2026-10-04 a partir de la base de producción (se aplicó el
-- 2026-10-02 desde otra máquina y nunca se subió al repo).
--
-- El 2FA es opcional por cuenta (Supabase Auth MFA, TOTP). Quien lo activa ya no
-- puede usar una sesión de un solo paso (aal1) para lo sensible:
--   - privado.mfa_ok(): la sesión llegó a aal2, o la cuenta no tiene un factor
--     verificado. Espejo en Edge Functions: cumpleMfa() en _shared/comun.ts.
--   - El superadmin con 2FA solo es superadmin en sesiones aal2 (es_superadmin).
--   - Acciones críticas de plataforma exigen el 2FA (exigir_mfa): eliminar un
--     sistema, modo mantenimiento y cierre global de sesiones.
-- ============================================================================

CREATE OR REPLACE FUNCTION privado.mfa_ok()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors f where f.user_id = (select auth.uid()) and f.status = 'verified');
$function$;

CREATE OR REPLACE FUNCTION privado.exigir_mfa()
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not privado.mfa_ok() then
    raise exception 'Esta acción requiere verificación en dos pasos: vuelve a entrar e introduce tu código.' using errcode = '42501';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION privado.es_superadmin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case
           when coalesce((select p.es_superadmin and p.activo from public.perfiles p where p.id = (select auth.uid())), false)
             then privado.mfa_ok()
           else false
         end;
$function$;

-- Para las Edge Functions (service_role): ¿la cuenta tiene un segundo factor verificado?
CREATE OR REPLACE FUNCTION public.cuenta_tiene_mfa(p_usuario uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (select 1 from auth.mfa_factors f where f.user_id = p_usuario and f.status = 'verified');
$function$;

revoke all on function public.cuenta_tiene_mfa(uuid) from public, anon, authenticated;
grant execute on function public.cuenta_tiene_mfa(uuid) to service_role;
grant execute on function privado.mfa_ok() to authenticated, service_role;
grant execute on function privado.exigir_mfa() to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.plataforma_cerrar_sesiones()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v integer;
begin
  perform privado.exigir_mfa();
  if not privado.es_superadmin() then
    raise exception 'Solo la superadministración.' using errcode = '42501';
  end if;
  delete from auth.sessions where user_id is distinct from auth.uid();
  get diagnostics v = row_count;
  insert into public.auditoria (usuario_id, accion, tabla, cambios)
  values (auth.uid(), 'CERRAR_SESIONES', 'auth.sessions', jsonb_build_object('sesiones', v));
  return v;
end;
$function$;

CREATE OR REPLACE FUNCTION public.plataforma_mantenimiento(p_activo boolean, p_mensaje text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform privado.exigir_mfa();
  if not privado.es_superadmin() then
    raise exception 'Solo la superadministración.' using errcode = '42501';
  end if;
  update public.plataforma
     set mantenimiento = p_activo,
         mantenimiento_mensaje = case when p_activo then nullif(trim(p_mensaje), '') end,
         mantenimiento_desde = case when p_activo then now() end,
         actualizado_por = auth.uid(),
         actualizado_en = now();
end;
$function$;

CREATE OR REPLACE FUNCTION public.plataforma_eliminar_sistema(p_sistema uuid, p_confirmacion text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_nombre     text;
  v_tabla      text;
  v_n          bigint;
  v_conteos    jsonb := '{}';
  v_pendientes text[];
  v_restantes  text[];
  v_error      text;
begin
  perform privado.exigir_mfa();
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
$function$;
