-- ============================================================================
-- MEDORA · Perfil: foto, correo de contacto y consentimiento de avisos
--
-- · foto: data URL de 256×256 (la app la recorta y comprime); pequeña para poder
--   mostrarse en listados sin un bucket aparte.
-- · correo_contacto: correo real para avisos. El de Auth (perfiles.email) es la
--   identidad de acceso y puede ser interno (@usuarios.medora.invalid).
-- · recibir_sms / recibir_correos: consentimiento del propio usuario. Cada uno
--   exige su dato de contacto. El uso concreto se define más adelante.
-- Solo el dueño los cambia (RLS perfiles_update_propio + permisos por columna).
-- ============================================================================
alter table public.perfiles
  add column foto text check (foto is null or (foto like 'data:image/%' and length(foto) <= 200000)),
  add column correo_contacto text check (correo_contacto is null or correo_contacto ~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$'),
  add column recibir_sms boolean not null default false,
  add column recibir_correos boolean not null default false,
  add constraint perfiles_sms_requiere_telefono check (not recibir_sms or nullif(trim(telefono), '') is not null),
  add constraint perfiles_correos_requiere_correo check (not recibir_correos or correo_contacto is not null);

-- Quien ya tiene un correo real lo conserva como contacto.
update public.perfiles set correo_contacto = lower(email)
 where email is not null and email !~* '\.invalid$' and email ~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$';

grant update (foto, correo_contacto, recibir_sms, recibir_correos) on public.perfiles to authenticated;
