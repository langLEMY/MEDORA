-- ============================================================================
-- MEDORA · Ayuda y soporte (helpdesk)
--
-- El personal de cada hospital pide ayuda desde la app; Soporte MEDORA (el
-- superadmin) responde desde una bandeja con las solicitudes de todos los
-- sistemas. Cada solicitud es un hilo de mensajes.
--
--   * solicitudes_soporte: la ven quien la creó, los admins (con membresía) de su sistema y
--     los agentes de soporte. No es dato clínico ni financiero, así que el agente la ve sin
--     membresía (regla 9 intacta).
--   * Responder como Soporte MEDORA no basta con ser superadmin: hay que estar en
--     plataforma.agentes_soporte (arranca con los superadmins de hoy: solo lemy).
--   * mensajes_soporte: append-only. Los de soporte se guardan sin autor
--     (superadmin discreto: el hospital solo ve «Soporte MEDORA»).
--   * Todo se escribe por RPC: límite de envíos y datos sensibles tapados en el
--     servidor (cédulas, teléfonos, tokens y números largos), igual que el monitoreo.
--   * Capturas en el bucket privado «soporte»: {sistema_id}/{solicitud_id}/{archivo}.
--   * Como en iMessage: responder a un mensaje concreto, tapbacks (reacciones_soporte),
--     «Deshacer envío» en los primeros 2 minutos (la única forma de vaciar un mensaje:
--     por si alguien pegó datos de un paciente) y, en la bandeja de soporte, fijar y
--     marcar como no leída.
--   * Sin auditoría: no es dinero, clínica ni accesos.
-- ============================================================================

create table public.solicitudes_soporte (
  id                 uuid primary key default gen_random_uuid(),
  sistema_id         uuid not null references public.sistemas(id) on delete restrict,
  numero             bigint not null,
  autor_id           uuid not null references public.perfiles(id) on delete restrict,
  asunto             text not null check (char_length(asunto) between 3 and 120),
  categoria          text not null check (categoria in ('duda', 'problema', 'sugerencia', 'cuenta')),
  prioridad          text not null default 'normal' check (prioridad in ('normal', 'alta', 'urgente')),
  estado             text not null default 'abierta' check (estado in ('abierta', 'en_proceso', 'esperando_respuesta', 'resuelta')),
  -- Versión, pantalla, rol, equipo y errores recientes: lo adjunta la app, sin datos de pacientes.
  contexto           jsonb not null default '{}'::jsonb,
  creado_en          timestamptz not null default now(),
  ultimo_mensaje_en  timestamptz not null default now(),
  ultimo_de_soporte  boolean not null default false,
  vista_autor_en     timestamptz,
  vista_soporte_en   timestamptz,
  resuelta_en        timestamptz,
  -- Bandeja de soporte.
  fijada_soporte     boolean not null default false,
  no_leida_soporte   boolean not null default false,
  unique (sistema_id, id),
  unique (sistema_id, numero)
);
create index ix_solicitudes_soporte_bandeja on public.solicitudes_soporte (ultimo_mensaje_en desc);
create index ix_solicitudes_soporte_autor on public.solicitudes_soporte (autor_id, ultimo_mensaje_en desc);

create table public.mensajes_soporte (
  id            uuid primary key default gen_random_uuid(),
  sistema_id    uuid not null references public.sistemas(id) on delete restrict,
  solicitud_id  uuid not null,
  -- null en los mensajes de soporte y en los eventos.
  autor_id      uuid references public.perfiles(id) on delete restrict,
  de_soporte    boolean not null default false,
  texto         text not null default '' check (char_length(texto) <= 4000),
  adjunto       text check (adjunto is null or char_length(adjunto) <= 300),
  -- Cambios de estado que se muestran en el hilo («Soporte marcó esto como resuelto»).
  evento        text check (evento is null or evento in ('abierta', 'en_proceso', 'esperando_respuesta', 'resuelta')),
  -- Respuesta a un mensaje concreto del mismo hilo.
  responde_a    uuid,
  -- «Deshacer envío»: el mensaje queda vacío y el hilo muestra que se retiró.
  retirado_en   timestamptz,
  creado_en     timestamptz not null default clock_timestamp(),
  check (char_length(texto) > 0 or adjunto is not null or evento is not null or retirado_en is not null),
  unique (sistema_id, id),
  foreign key (sistema_id, solicitud_id) references public.solicitudes_soporte (sistema_id, id) on delete restrict,
  foreign key (sistema_id, responde_a) references public.mensajes_soporte (sistema_id, id) on delete restrict
);
create index ix_mensajes_soporte_hilo on public.mensajes_soporte (solicitud_id, creado_en);
create index ix_mensajes_soporte_sistema on public.mensajes_soporte (sistema_id);
create index ix_mensajes_soporte_responde on public.mensajes_soporte (sistema_id, responde_a) where responde_a is not null;

-- Append-only con una sola salida: retirar_mensaje_soporte vacía un mensaje propio en sus
-- primeros 2 minutos (marca medora.retirando_mensaje en la transacción). Nada más cambia.
create or replace function privado.tg_mensajes_soporte_inmutables()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and coalesce(current_setting('medora.retirando_mensaje', true), '') = old.id::text
     and old.retirado_en is null and new.retirado_en is not null
     and new.texto = '' and new.adjunto is null
     and (new.id, new.sistema_id, new.solicitud_id, new.autor_id, new.de_soporte, new.evento, new.responde_a, new.creado_en)
         is not distinct from (old.id, old.sistema_id, old.solicitud_id, old.autor_id, old.de_soporte, old.evento, old.responde_a, old.creado_en) then
    return new;
  end if;
  if tg_op = 'DELETE' and privado.eliminando_sistema(old.sistema_id) then
    return old;
  end if;
  raise exception 'La tabla %.% es append-only: no se permiten UPDATE ni DELETE.', tg_table_schema, tg_table_name
    using errcode = '42501';
end;
$$;

create trigger trg_mensajes_soporte_append_only
  before update or delete on public.mensajes_soporte
  for each row execute function privado.tg_mensajes_soporte_inmutables();

-- Tapbacks: una reacción por persona y mensaje (la de soporte, sin autor). Quitarla deja
-- tipo en null (así Realtime avisa con un UPDATE filtrable, en vez de un DELETE sin datos).
create table public.reacciones_soporte (
  id             uuid primary key default gen_random_uuid(),
  sistema_id     uuid not null references public.sistemas(id) on delete restrict,
  solicitud_id   uuid not null,
  mensaje_id     uuid not null,
  usuario_id     uuid references public.perfiles(id) on delete restrict,
  de_soporte     boolean not null default false,
  tipo           text check (tipo is null or tipo in ('corazon', 'me_gusta', 'no_me_gusta', 'risa', 'exclamacion', 'pregunta')),
  actualizado_en timestamptz not null default clock_timestamp(),
  check (de_soporte = (usuario_id is null)),
  foreign key (sistema_id, solicitud_id) references public.solicitudes_soporte (sistema_id, id) on delete restrict,
  foreign key (sistema_id, mensaje_id) references public.mensajes_soporte (sistema_id, id) on delete restrict
);
create unique index ux_reacciones_soporte_quien
  on public.reacciones_soporte (mensaje_id, coalesce(usuario_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index ix_reacciones_soporte_solicitud on public.reacciones_soporte (solicitud_id);
create index ix_reacciones_soporte_sistema on public.reacciones_soporte (sistema_id);

-- ---------------------------------------------------------------------------
-- Quién atiende el soporte
-- ---------------------------------------------------------------------------
-- Lista explícita de agentes (superadmins que responden como Soporte MEDORA). Un superadmin
-- nuevo no responde solicitudes hasta que se le agregue aquí.
alter table public.plataforma add column agentes_soporte uuid[] not null default '{}';
update public.plataforma set agentes_soporte = array(select p.id from public.perfiles p where p.es_superadmin and p.activo order by p.creado_en);

create or replace function privado.es_agente_soporte()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select privado.es_superadmin()
     and (select auth.uid()) = any (coalesce((select pl.agentes_soporte from public.plataforma pl), '{}'));
$$;

-- La app lo pregunta para mostrar la bandeja de soporte o la vista de hospital.
create or replace function public.soy_agente_soporte()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select privado.es_agente_soporte();
$$;

alter table public.solicitudes_soporte enable row level security;
alter table public.mensajes_soporte enable row level security;
alter table public.reacciones_soporte enable row level security;
revoke all on public.solicitudes_soporte from anon;
revoke all on public.mensajes_soporte from anon;
revoke all on public.reacciones_soporte from anon;
revoke insert, update, delete on public.solicitudes_soporte from authenticated;
revoke insert, update, delete on public.mensajes_soporte from authenticated;
revoke insert, update, delete on public.reacciones_soporte from authenticated;
grant select on public.solicitudes_soporte to authenticated;
grant select on public.mensajes_soporte to authenticated;
grant select on public.reacciones_soporte to authenticated;

create policy solicitudes_soporte_select on public.solicitudes_soporte for select to authenticated
  using (
    autor_id = (select auth.uid())
    or sistema_id in (select privado.mis_sistemas_con_rol('{admin}'::public.rol_sistema[]))
    or (select privado.es_agente_soporte())
  );

-- Un mensaje se ve si se ve su solicitud (el RLS de solicitudes_soporte filtra la subconsulta).
create policy mensajes_soporte_select on public.mensajes_soporte for select to authenticated
  using (solicitud_id in (select s.id from public.solicitudes_soporte s));
create policy reacciones_soporte_select on public.reacciones_soporte for select to authenticated
  using (solicitud_id in (select s.id from public.solicitudes_soporte s));

-- Las conversaciones se actualizan en vivo (Realtime respeta el RLS).
alter publication supabase_realtime add table public.solicitudes_soporte;
alter publication supabase_realtime add table public.mensajes_soporte;
alter publication supabase_realtime add table public.reacciones_soporte;

-- ---------------------------------------------------------------------------
-- Capturas de pantalla
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('soporte', 'soporte', false, 10485760, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy soporte_select on storage.objects for select to authenticated
  using (
    bucket_id = 'soporte'
    and (storage.foldername(name))[2] in (select s.id::text from public.solicitudes_soporte s)
  );
create policy soporte_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'soporte'
    and (storage.foldername(name))[1] || '/' || (storage.foldername(name))[2] in (
      select s.sistema_id::text || '/' || s.id::text from public.solicitudes_soporte s
    )
  );
-- «Deshacer envío» de una foto: quien la subió la puede borrar en sus primeros minutos.
create policy soporte_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'soporte'
    and owner_id = (select auth.uid())::text
    and created_at > now() - interval '5 minutes'
  );

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Tapa lo que nunca debe viajar en un mensaje de soporte (espejo de lib/soporte.ts).
create or replace function privado.limpiar_texto_soporte(p_texto text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(regexp_replace(regexp_replace(regexp_replace(
           btrim(coalesce(p_texto, '')),
           'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', '[token]', 'g'),
           '\m\d{3}-?\d{7}-?\d\M', '[cédula]', 'g'),
           '(\+?1[ -]?)?\m(809|829|849)[ -]?\d{3}[ -]?\d{4}\M', '[teléfono]', 'g'),
           '\m\d{9,11}\M', '[número]', 'g');
$$;

-- Papel de quien llama en una solicitud: 'soporte' (agente de soporte que no la abrió; puede ser
-- también miembro del hospital), 'hospital' (quien la abrió o un admin de su sistema) o null.
create or replace function privado.rol_en_solicitud_soporte(p_sol public.solicitudes_soporte)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when privado.es_agente_soporte() and p_sol.autor_id <> (select auth.uid()) then 'soporte'
    when p_sol.autor_id = (select auth.uid())
      or p_sol.sistema_id in (select privado.mis_sistemas_con_rol('{admin}'::public.rol_sistema[])) then 'hospital'
    else null
  end;
$$;

-- Valida que el adjunto exista y sea de esa solicitud.
create or replace function privado.validar_adjunto_soporte(p_sistema uuid, p_solicitud uuid, p_adjunto text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_adjunto is null or p_adjunto = '' then
    return null;
  end if;
  if p_adjunto not like p_sistema::text || '/' || p_solicitud::text || '/%'
     or not exists (select 1 from storage.objects o where o.bucket_id = 'soporte' and o.name = p_adjunto) then
    raise exception 'La imagen adjunta no es válida.' using errcode = '22023';
  end if;
  return p_adjunto;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC
-- ---------------------------------------------------------------------------

create or replace function public.crear_solicitud_soporte(
  p_sistema uuid,
  p_asunto text,
  p_categoria text,
  p_texto text,
  p_prioridad text default 'normal',
  p_contexto jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_id    uuid;
  v_texto text := privado.limpiar_texto_soporte(p_texto);
begin
  -- Cualquier miembro activo del sistema, salvo el quiosco.
  if not privado.tiene_rol(p_sistema, '{admin,medico,enfermeria,recepcion,caja,farmacia,auditor,gerencia,contabilidad,psicologia,nutricion,terapia,laboratorio}') then
    raise exception 'No tienes acceso a este sistema.' using errcode = '42501';
  end if;
  if not public.consumir_limite('soporte-nueva:' || v_uid::text, 6, 3600) then
    raise exception 'Has enviado muchas solicitudes seguidas. Espera un rato o escribe en una que ya tengas abierta.' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_asunto, ''))) < 3 then
    raise exception 'Escribe un asunto de al menos 3 letras.' using errcode = '22023';
  end if;
  if char_length(v_texto) = 0 then
    raise exception 'Cuéntanos qué pasó.' using errcode = '22023';
  end if;

  insert into public.solicitudes_soporte (sistema_id, numero, autor_id, asunto, categoria, prioridad, contexto, vista_autor_en)
  values (p_sistema, privado.siguiente_numero(p_sistema, 'solicitud_soporte'), v_uid,
          left(privado.limpiar_texto_soporte(p_asunto), 120), p_categoria, coalesce(p_prioridad, 'normal'),
          coalesce(p_contexto, '{}'::jsonb), clock_timestamp())
  returning id into v_id;

  insert into public.mensajes_soporte (sistema_id, solicitud_id, autor_id, texto)
  values (p_sistema, v_id, v_uid, left(v_texto, 4000));

  return v_id;
end;
$$;

create or replace function public.responder_solicitud_soporte(p_solicitud uuid, p_texto text, p_adjunto text default null, p_responde_a uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_sol      public.solicitudes_soporte;
  v_rol      text;
  v_soporte  boolean;
  v_texto    text := privado.limpiar_texto_soporte(p_texto);
  v_adjunto  text;
  v_id       uuid;
begin
  select * into v_sol from public.solicitudes_soporte where id = p_solicitud for update;
  if v_sol.id is null then
    raise exception 'La solicitud no existe.' using errcode = 'P0002';
  end if;
  v_rol := privado.rol_en_solicitud_soporte(v_sol);
  if v_rol is null then
    raise exception 'No puedes escribir en esta solicitud.' using errcode = '42501';
  end if;
  v_soporte := v_rol = 'soporte';
  if p_responde_a is not null and not exists (
       select 1 from public.mensajes_soporte m where m.id = p_responde_a and m.solicitud_id = v_sol.id and m.evento is null) then
    raise exception 'El mensaje al que respondes no es de esta conversación.' using errcode = '22023';
  end if;
  if not public.consumir_limite('soporte-msj:' || v_uid::text, 40, 600) then
    raise exception 'Vas muy rápido. Espera un momento antes de seguir escribiendo.' using errcode = 'P0001';
  end if;
  v_adjunto := privado.validar_adjunto_soporte(v_sol.sistema_id, v_sol.id, p_adjunto);
  if char_length(v_texto) = 0 and v_adjunto is null then
    raise exception 'El mensaje está vacío.' using errcode = '22023';
  end if;

  insert into public.mensajes_soporte (sistema_id, solicitud_id, autor_id, de_soporte, texto, adjunto, responde_a)
  values (v_sol.sistema_id, v_sol.id, case when v_soporte then null else v_uid end, v_soporte, left(v_texto, 4000), v_adjunto, p_responde_a)
  returning id into v_id;

  -- clock_timestamp (no now()): en una misma transacción cada marca queda en su orden real.
  -- Quien escribe ya leyó todo. Si responde soporte, queda esperando al usuario; si responde el
  -- hospital, vuelve a la bandeja (y una resuelta se reabre).
  update public.solicitudes_soporte
     set ultimo_mensaje_en = clock_timestamp(),
         ultimo_de_soporte = v_soporte,
         estado = case
                    when v_soporte and estado in ('abierta', 'en_proceso') then 'esperando_respuesta'
                    when not v_soporte and estado in ('esperando_respuesta', 'resuelta') then 'abierta'
                    else estado end,
         resuelta_en = case when not v_soporte and estado = 'resuelta' then null else resuelta_en end,
         vista_soporte_en = case when v_soporte then clock_timestamp() else vista_soporte_en end,
         vista_autor_en = case when v_sol.autor_id = v_uid then clock_timestamp() else vista_autor_en end
   where id = v_sol.id;

  return v_id;
end;
$$;

-- Soporte puede poner cualquier estado y prioridad; quien la abrió (o un admin) solo puede
-- darla por resuelta o reabrirla.
create or replace function public.cambiar_estado_solicitud_soporte(p_solicitud uuid, p_estado text, p_prioridad text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_sol     public.solicitudes_soporte;
  v_soporte boolean;
begin
  select * into v_sol from public.solicitudes_soporte where id = p_solicitud for update;
  if v_sol.id is null then
    raise exception 'La solicitud no existe.' using errcode = 'P0002';
  end if;
  v_soporte := privado.rol_en_solicitud_soporte(v_sol) = 'soporte';
  if not v_soporte then
    if privado.rol_en_solicitud_soporte(v_sol) is null then
      raise exception 'No puedes cambiar esta solicitud.' using errcode = '42501';
    end if;
    if p_estado not in ('resuelta', 'abierta') or p_prioridad is not null then
      raise exception 'Solo puedes darla por resuelta o reabrirla.' using errcode = '42501';
    end if;
  end if;
  if p_estado not in ('abierta', 'en_proceso', 'esperando_respuesta', 'resuelta') then
    raise exception 'Estado no válido.' using errcode = '22023';
  end if;

  if p_estado <> v_sol.estado then
    insert into public.mensajes_soporte (sistema_id, solicitud_id, autor_id, de_soporte, evento)
    values (v_sol.sistema_id, v_sol.id, case when v_soporte then null else v_uid end, v_soporte, p_estado);
  end if;

  update public.solicitudes_soporte
     set estado = p_estado,
         prioridad = coalesce(p_prioridad, prioridad),
         resuelta_en = case when p_estado = 'resuelta' then coalesce(resuelta_en, clock_timestamp()) else null end,
         ultimo_mensaje_en = case when p_estado <> v_sol.estado then clock_timestamp() else ultimo_mensaje_en end
   where id = v_sol.id;
end;
$$;

-- Marca la conversación como vista por quien la abre (para los «no leídos» y el «Visto»).
create or replace function public.marcar_solicitud_soporte_vista(p_solicitud uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  update public.solicitudes_soporte
     set vista_autor_en = case when autor_id = v_uid then clock_timestamp() else vista_autor_en end,
         vista_soporte_en = case when privado.es_agente_soporte() and autor_id <> v_uid then clock_timestamp() else vista_soporte_en end,
         no_leida_soporte = case when privado.es_agente_soporte() and autor_id <> v_uid then false else no_leida_soporte end
   where id = p_solicitud
     and (autor_id = v_uid or privado.es_agente_soporte());
end;
$$;

-- Solicitudes con algo nuevo para mí: al agente de soporte, lo que escribió el hospital y no ha visto;
-- al resto, las respuestas de soporte en sus propias solicitudes.
create or replace function public.soporte_pendientes()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when privado.es_agente_soporte() then (
      select count(*)::integer from public.solicitudes_soporte
       where autor_id <> (select auth.uid())
         and (no_leida_soporte
              or (not ultimo_de_soporte and estado <> 'resuelta'
                  and (vista_soporte_en is null or vista_soporte_en < ultimo_mensaje_en))))
    else (
      select count(*)::integer from public.solicitudes_soporte
       where autor_id = (select auth.uid()) and ultimo_de_soporte
         and (vista_autor_en is null or vista_autor_en < ultimo_mensaje_en))
  end;
$$;

-- «Deshacer envío»: vacía un mensaje propio en sus primeros 2 minutos. Devuelve la ruta de la
-- foto (si tenía) para que la app la borre del bucket.
create or replace function public.retirar_mensaje_soporte(p_mensaje uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_msj public.mensajes_soporte;
  v_sol public.solicitudes_soporte;
begin
  select * into v_msj from public.mensajes_soporte where id = p_mensaje;
  if v_msj.id is null then
    raise exception 'El mensaje no existe.' using errcode = 'P0002';
  end if;
  select * into v_sol from public.solicitudes_soporte where id = v_msj.solicitud_id;
  if v_msj.evento is not null or v_msj.retirado_en is not null
     or not (case when v_msj.de_soporte then privado.rol_en_solicitud_soporte(v_sol) = 'soporte' else v_msj.autor_id = v_uid end) then
    raise exception 'Solo puedes deshacer el envío de tus propios mensajes.' using errcode = '42501';
  end if;
  if v_msj.creado_en < clock_timestamp() - interval '2 minutes' then
    raise exception 'Ya pasaron los 2 minutos para deshacer el envío.' using errcode = 'P0001';
  end if;

  perform set_config('medora.retirando_mensaje', v_msj.id::text, true);
  update public.mensajes_soporte set texto = '', adjunto = null, retirado_en = clock_timestamp() where id = v_msj.id;
  perform set_config('medora.retirando_mensaje', '', true);
  -- Sus tapbacks se van con él.
  update public.reacciones_soporte set tipo = null, actualizado_en = clock_timestamp() where mensaje_id = v_msj.id and tipo is not null;
  return v_msj.adjunto;
end;
$$;

-- Tapback: pone, cambia o quita (p_tipo null) la reacción de quien llama a un mensaje.
create or replace function public.reaccionar_mensaje_soporte(p_mensaje uuid, p_tipo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_msj public.mensajes_soporte;
  v_sol public.solicitudes_soporte;
  v_rol text;
begin
  select * into v_msj from public.mensajes_soporte where id = p_mensaje;
  select * into v_sol from public.solicitudes_soporte where id = v_msj.solicitud_id;
  v_rol := case when v_sol.id is null then null else privado.rol_en_solicitud_soporte(v_sol) end;
  if v_rol is null then
    raise exception 'No puedes reaccionar en esta conversación.' using errcode = '42501';
  end if;
  if v_msj.evento is not null or v_msj.retirado_en is not null then
    raise exception 'Ese mensaje no admite reacciones.' using errcode = '22023';
  end if;
  if not public.consumir_limite('soporte-reac:' || v_uid::text, 60, 60) then
    raise exception 'Vas muy rápido. Espera un momento.' using errcode = 'P0001';
  end if;

  insert into public.reacciones_soporte (sistema_id, solicitud_id, mensaje_id, usuario_id, de_soporte, tipo)
  values (v_msj.sistema_id, v_msj.solicitud_id, v_msj.id, case when v_rol = 'soporte' then null else v_uid end, v_rol = 'soporte', p_tipo)
  on conflict (mensaje_id, coalesce(usuario_id, '00000000-0000-0000-0000-000000000000'::uuid))
  do update set tipo = excluded.tipo, actualizado_en = clock_timestamp();
end;
$$;

-- Bandeja de soporte: fijar y marcar como no leída (solo el agente de soporte).
create or replace function public.ajustar_bandeja_soporte(p_solicitud uuid, p_fijada boolean default null, p_no_leida boolean default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not privado.es_agente_soporte() then
    raise exception 'Solo Soporte MEDORA ordena su bandeja.' using errcode = '42501';
  end if;
  update public.solicitudes_soporte
     set fijada_soporte = coalesce(p_fijada, fijada_soporte),
         no_leida_soporte = coalesce(p_no_leida, no_leida_soporte)
   where id = p_solicitud;
end;
$$;

revoke all on function privado.limpiar_texto_soporte(text) from public;
revoke all on function privado.es_agente_soporte() from public;
-- La usa la política de lectura de solicitudes_soporte (se evalúa con el rol de quien consulta).
grant execute on function privado.es_agente_soporte() to authenticated;
revoke all on function public.soy_agente_soporte() from public, anon;
grant execute on function public.soy_agente_soporte() to authenticated;
revoke all on function privado.rol_en_solicitud_soporte(public.solicitudes_soporte) from public;
revoke all on function public.retirar_mensaje_soporte(uuid) from public, anon;
revoke all on function public.reaccionar_mensaje_soporte(uuid, text) from public, anon;
revoke all on function public.ajustar_bandeja_soporte(uuid, boolean, boolean) from public, anon;
grant execute on function public.retirar_mensaje_soporte(uuid) to authenticated;
grant execute on function public.reaccionar_mensaje_soporte(uuid, text) to authenticated;
grant execute on function public.ajustar_bandeja_soporte(uuid, boolean, boolean) to authenticated;
revoke all on function privado.validar_adjunto_soporte(uuid, uuid, text) from public;
revoke all on function public.crear_solicitud_soporte(uuid, text, text, text, text, jsonb) from public, anon;
revoke all on function public.responder_solicitud_soporte(uuid, text, text, uuid) from public, anon;
revoke all on function public.cambiar_estado_solicitud_soporte(uuid, text, text) from public, anon;
revoke all on function public.marcar_solicitud_soporte_vista(uuid) from public, anon;
revoke all on function public.soporte_pendientes() from public, anon;
grant execute on function public.crear_solicitud_soporte(uuid, text, text, text, text, jsonb) to authenticated;
grant execute on function public.responder_solicitud_soporte(uuid, text, text, uuid) to authenticated;
grant execute on function public.cambiar_estado_solicitud_soporte(uuid, text, text) to authenticated;
grant execute on function public.marcar_solicitud_soporte_vista(uuid) to authenticated;
grant execute on function public.soporte_pendientes() to authenticated;
