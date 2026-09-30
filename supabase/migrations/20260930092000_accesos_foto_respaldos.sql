-- ============================================================================
-- MEDORA · Accesos a expedientes, foto de la cédula y respaldos automáticos
--
-- · registrar_acceso_expediente: cada vez que alguien abre un expediente queda
--   en la auditoría (acción VER), como máximo una vez cada 10 min por persona
--   y paciente. accesos_expediente lista quién lo vio (admin, gerencia, auditor).
-- · pacientes.foto_documento: foto de la cédula en el bucket privado
--   documentos-pacientes ({sistema}/{paciente}/{archivo}); solo la ve quien
--   puede ver a ese paciente (el RLS de pacientes se aplica dentro de la política).
-- · respaldos: la Edge Function "respaldo" exporta todas las tablas, las cifra
--   (AES-256-GCM) y las guarda en el bucket privado "respaldos"; pg_cron la
--   llama cada madrugada. El token de pg_cron vive en Vault ("respaldo_cron"),
--   nunca en el repo. También se programa el cierre diario (resumenes_diarios).
-- ============================================================================

-- ------------------------------------------------------------ accesos
create or replace function public.registrar_acceso_expediente(p_paciente uuid, p_recurso text default 'expediente')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sistema uuid;
begin
  select sistema_id into v_sistema from public.pacientes where id = p_paciente;
  if v_sistema is null or v_sistema not in (select privado.mis_sistemas()) then
    return;
  end if;
  if v_sistema not in (select privado.sistemas_vista_completa()) and p_paciente not in (select privado.mis_pacientes()) then
    return;
  end if;
  if exists (select 1 from public.auditoria a
              where a.usuario_id = auth.uid() and a.accion = 'VER' and a.tabla = 'pacientes'
                and a.registro_id = p_paciente::text and a.creado_en > now() - interval '10 minutes') then
    return;
  end if;
  insert into public.auditoria (sistema_id, usuario_id, accion, tabla, registro_id, cambios)
  values (v_sistema, auth.uid(), 'VER', 'pacientes', p_paciente::text,
          jsonb_build_object('recurso', left(coalesce(p_recurso, 'expediente'), 40)));
end;
$$;

create or replace function public.accesos_expediente(p_paciente uuid)
returns table (cuando timestamptz, usuario text, recurso text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_sistema uuid := (select sistema_id from public.pacientes where id = p_paciente);
begin
  if v_sistema is null or not (privado.tiene_rol(v_sistema, '{admin,gerencia,auditor}') or privado.es_superadmin()) then
    raise exception 'Solo la administración y auditoría ven los accesos.' using errcode = '42501';
  end if;
  return query
  select a.creado_en,
         case when coalesce(p.es_superadmin, false) then 'Soporte MEDORA' else coalesce(p.nombre_completo, 'Usuario eliminado') end,
         coalesce(a.cambios ->> 'recurso', 'expediente')
    from public.auditoria a left join public.perfiles p on p.id = a.usuario_id
   where a.sistema_id = v_sistema and a.accion = 'VER' and a.tabla = 'pacientes' and a.registro_id = p_paciente::text
   order by a.creado_en desc
   limit 200;
end;
$$;

create index if not exists ix_auditoria_accesos on public.auditoria (registro_id, creado_en desc) where accion = 'VER';

revoke all on function public.registrar_acceso_expediente(uuid, text) from public, anon;
revoke all on function public.accesos_expediente(uuid) from public, anon;
grant execute on function public.registrar_acceso_expediente(uuid, text) to authenticated;
grant execute on function public.accesos_expediente(uuid) to authenticated;

-- ------------------------------------------------------------ foto de la cédula
alter table public.pacientes add column if not exists foto_documento text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos-pacientes', 'documentos-pacientes', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy documentos_pacientes_select on storage.objects for select to authenticated
  using (
    bucket_id = 'documentos-pacientes'
    and exists (select 1 from public.pacientes p
                 where p.sistema_id::text = (storage.foldername(name))[1] and p.id::text = (storage.foldername(name))[2])
  );
create policy documentos_pacientes_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documentos-pacientes'
    and (storage.foldername(name))[1] in (
      select s::text from privado.mis_sistemas_con_rol('{admin,recepcion,caja,enfermeria,medico,psicologia,nutricion,terapia}', 'pacientes') s)
    and exists (select 1 from public.pacientes p
                 where p.sistema_id::text = (storage.foldername(name))[1] and p.id::text = (storage.foldername(name))[2])
  );

-- ------------------------------------------------------------ respaldos
create table public.respaldos (
  id              uuid primary key default gen_random_uuid(),
  creado_en       timestamptz not null default now(),
  origen          text not null check (origen in ('automatico', 'manual')),
  estado          text not null check (estado in ('ok', 'error')),
  ruta            text,
  bytes           bigint,
  filas           bigint,
  tablas          int,
  duracion_ms     int,
  error           text,
  solicitado_por  uuid references public.perfiles(id) on delete set null
);
create index ix_respaldos_creado on public.respaldos (creado_en desc);
create index ix_fk_respaldos_solicitado_por on public.respaldos (solicitado_por);
alter table public.respaldos enable row level security;
create policy respaldos_select on public.respaldos for select to authenticated using ((select privado.es_superadmin()));
revoke all on public.respaldos from anon;
revoke insert, update, delete, truncate on public.respaldos from authenticated;
grant select on public.respaldos to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('respaldos', 'respaldos', false, 524288000)
on conflict (id) do nothing;

-- Tablas del esquema público a respaldar y su contenido (solo service_role: la Edge Function).
create or replace function public.respaldo_tablas()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select array_agg(table_name::text order by table_name)
    from information_schema.tables
   where table_schema = 'public' and table_type = 'BASE TABLE' and table_name <> 'respaldos';
$$;

create or replace function public.respaldo_tabla(p_tabla text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  if p_tabla is null or not (p_tabla = any (public.respaldo_tablas())) then
    raise exception 'Tabla desconocida.' using errcode = 'P0001';
  end if;
  execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t', p_tabla) into v;
  return v;
end;
$$;
revoke all on function public.respaldo_tablas() from public, anon, authenticated;
revoke all on function public.respaldo_tabla(text) from public, anon, authenticated;
grant execute on function public.respaldo_tablas() to service_role;
grant execute on function public.respaldo_tabla(text) to service_role;

-- ------------------------------------------------------------ tareas programadas
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- 3:00 a. m. en Santo Domingo (07:00 UTC): respaldo cifrado.
select cron.schedule('medora-respaldo-diario', '0 7 * * *', $cron$
  select net.http_post(
    url := 'https://gprjxsubzocbbflxoggd.supabase.co/functions/v1/respaldo',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-respaldo-token', (select decrypted_secret from vault.decrypted_secrets where name = 'respaldo_cron')),
    body := '{"accion":"automatico"}'::jsonb,
    timeout_milliseconds := 120000
  );
$cron$);

-- 12:10 a. m. en Santo Domingo (04:10 UTC): cierre del día anterior.
select cron.schedule('medora-cierre-diario', '10 4 * * *', $cron$ select privado.generar_resumen_diario(); $cron$);
