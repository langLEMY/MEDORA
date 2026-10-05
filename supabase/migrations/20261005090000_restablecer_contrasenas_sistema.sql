-- ============================================================================
-- MEDORA . Restablecer las contraseñas de todo el personal de un sistema
--
-- Lo usa la Edge Function "plataforma-usuarios" (acción restablecer_sistema, solo
-- superadmin con 2FA y confirmación). Cada persona recibe una contraseña temporal
-- distinta y debe cambiarla al entrar. Esta función, solo para el service_role:
--   - cierra las sesiones abiertas de esas cuentas (nadie sigue dentro con la vieja),
--   - borra sus contraseñas heredadas de FUNBIDE (no se podría volver a la anterior),
--   - deja el registro en la auditoría (sin las contraseñas).
-- ============================================================================

create or replace function public.cerrar_acceso_restablecido(p_sistema uuid, p_usuarios uuid[], p_autor uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sesiones integer;
begin
  delete from auth.sessions where user_id = any (p_usuarios);
  get diagnostics v_sesiones = row_count;
  delete from privado.credenciales_legado where usuario_id = any (p_usuarios);
  insert into public.auditoria (sistema_id, usuario_id, accion, tabla, cambios)
  values (p_sistema, p_autor, 'RESTABLECER_CONTRASENAS', 'auth.users',
          jsonb_build_object('personas', cardinality(p_usuarios), 'sesiones_cerradas', v_sesiones));
  return v_sesiones;
end;
$$;
revoke all on function public.cerrar_acceso_restablecido(uuid, uuid[], uuid) from public, anon, authenticated;
grant execute on function public.cerrar_acceso_restablecido(uuid, uuid[], uuid) to service_role;
