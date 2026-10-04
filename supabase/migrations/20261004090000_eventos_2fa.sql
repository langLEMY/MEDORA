-- ============================================================================
-- MEDORA . Eventos de auditoría de la verificación en dos pasos
--
-- registrar_evento solo acepta una lista cerrada de acciones. Se agregan las del
-- 2FA para que la bitácora muestre quién lo activó, lo quitó o entró con código.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.registrar_evento(p_accion text, p_sistema uuid DEFAULT NULL::uuid, p_detalle jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then
    return;
  end if;
  if p_accion not in ('LOGIN', 'LOGOUT', 'CAMBIO_SISTEMA', 'EXPORTAR', 'IMPRIMIR', 'CAMBIO_PASSWORD',
                      'LOGIN_2FA', 'ACTIVAR_2FA', 'DESACTIVAR_2FA') then
    raise exception 'Evento no permitido.' using errcode = 'P0001';
  end if;
  if p_sistema is not null
     and not exists (select 1 from privado.mis_sistemas() s where s = p_sistema)
     and not privado.es_superadmin() then
    p_sistema := null;
  end if;

  insert into public.auditoria (sistema_id, usuario_id, accion, tabla, registro_id, cambios)
  values (p_sistema, auth.uid(), p_accion, null, null, p_detalle);
end;
$function$;
