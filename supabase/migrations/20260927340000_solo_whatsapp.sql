-- ============================================================================
-- MEDORA · Avisos solo por WhatsApp
--
-- Se retiran los conectores de SMS y correo: los avisos (pocos, al personal y a
-- los pacientes) salen por WhatsApp. Integraciones queda con WhatsApp y Azul.
-- En el perfil, "recibir SMS" y "recibir correos" pasan a un solo consentimiento:
-- recibir_whatsapp (exige celular). El correo de contacto se conserva como dato.
-- ============================================================================
alter table public.integraciones drop constraint integraciones_proveedor_check;
alter table public.integraciones add constraint integraciones_proveedor_check check (proveedor in ('whatsapp', 'azul'));

create or replace function privado.campos_integracion(p_proveedor text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case p_proveedor
    when 'whatsapp' then '{"config": ["phone_number_id", "waba_id"], "secretos": ["token"], "requeridos": ["phone_number_id", "token"]}'
    when 'azul'     then '{"config": ["merchant_id", "nombre_comercio", "ambiente"], "secretos": ["auth1", "auth2"], "requeridos": ["merchant_id", "auth1", "auth2"]}'
  end::jsonb;
$$;

alter table public.perfiles
  add column recibir_whatsapp boolean not null default false,
  add constraint perfiles_whatsapp_requiere_telefono check (not recibir_whatsapp or nullif(trim(telefono), '') is not null);
update public.perfiles set recibir_whatsapp = true where recibir_sms;
alter table public.perfiles
  drop constraint perfiles_sms_requiere_telefono,
  drop constraint perfiles_correos_requiere_correo,
  drop column recibir_sms,
  drop column recibir_correos;
grant update (recibir_whatsapp) on public.perfiles to authenticated;
