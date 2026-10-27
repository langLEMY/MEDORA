-- ============================================================================
-- MEDORA · Módulo Internamiento (capacidad "internamiento", clínica/hospital)
--
-- MVP: habitaciones y camas (con estado) + admisiones (ingreso/egreso). Los
-- cargos por estancia hacia caja/contabilidad se integran en una fase posterior.
-- Aditivo; no afecta a los sistemas que no lo usen.
-- ============================================================================

create table public.habitaciones (
  id          uuid primary key default gen_random_uuid(),
  sistema_id  uuid not null references public.sistemas(id) on delete restrict,
  sede_id     uuid,
  nombre      text not null,
  tipo        text,            -- individual, compartida, UCI…
  activa      boolean not null default true,
  creado_en   timestamptz not null default now(),
  unique (sistema_id, id)
);
create index ix_habitaciones on public.habitaciones (sistema_id) where activa;

create table public.camas (
  id            uuid primary key default gen_random_uuid(),
  sistema_id    uuid not null references public.sistemas(id) on delete restrict,
  habitacion_id uuid not null,
  codigo        text not null,
  estado        text not null default 'libre' check (estado in ('libre', 'ocupada', 'mantenimiento')),
  creado_en     timestamptz not null default now(),
  unique (sistema_id, id),
  foreign key (sistema_id, habitacion_id) references public.habitaciones (sistema_id, id) on delete cascade
);
create index ix_camas on public.camas (sistema_id, habitacion_id);

create table public.admisiones (
  id            uuid primary key default gen_random_uuid(),
  sistema_id    uuid not null references public.sistemas(id) on delete restrict,
  cama_id       uuid not null,
  paciente_id   uuid not null,
  medico_nombre text,
  motivo        text,
  estado        text not null default 'ingresado' check (estado in ('ingresado', 'egresado')),
  ingreso_en    timestamptz not null default now(),
  egreso_en     timestamptz,
  creado_por    uuid not null default auth.uid(),
  unique (sistema_id, id),
  foreign key (sistema_id, cama_id) references public.camas (sistema_id, id),
  foreign key (sistema_id, paciente_id) references public.pacientes (sistema_id, id)
);
create index ix_admisiones on public.admisiones (sistema_id, estado, ingreso_en desc);

create trigger trg_admisiones_auditoria after insert on public.admisiones
  for each row execute function privado.tg_auditar('sin_datos');

-- RLS -------------------------------------------------------------------------
alter table public.habitaciones enable row level security;
alter table public.camas        enable row level security;
alter table public.admisiones   enable row level security;
revoke all on public.habitaciones, public.camas, public.admisiones from anon;
grant select, insert, update on public.habitaciones to authenticated;
grant select, insert, update on public.camas to authenticated;

-- Habitaciones y camas: las ve cualquier miembro; las configura admin.
create policy habitaciones_select on public.habitaciones for select to authenticated
  using (sistema_id in (select privado.mis_sistemas()));
create policy habitaciones_cud on public.habitaciones for all to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{admin}')))
  with check (sistema_id in (select privado.mis_sistemas_con_rol('{admin}')));
create policy camas_select on public.camas for select to authenticated
  using (sistema_id in (select privado.mis_sistemas()));
create policy camas_cud on public.camas for all to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{admin}')))
  with check (sistema_id in (select privado.mis_sistemas_con_rol('{admin}')));

-- Admisiones: las ven los roles clínicos/recepción; se escriben por RPC.
create policy admisiones_select on public.admisiones for select to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{admin,medico,enfermeria,recepcion,gerencia}')));

-- RPC: admitir (ocupa una cama libre; serializado para no duplicar) -----------
create or replace function public.admitir_paciente(
  p_sistema uuid, p_cama uuid, p_paciente uuid, p_medico text default null, p_motivo text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
  v_cama public.camas;
begin
  if not privado.tiene_rol(p_sistema, '{admin,recepcion,medico,enfermeria}') then
    raise exception 'No tienes permiso para admitir pacientes.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_cama::text, 0));
  select * into v_cama from public.camas where id = p_cama and sistema_id = p_sistema for update;
  if v_cama.id is null then raise exception 'Cama no encontrada.' using errcode = 'P0001'; end if;
  if v_cama.estado <> 'libre' then raise exception 'La cama no está libre.' using errcode = 'P0001'; end if;

  insert into public.admisiones (id, sistema_id, cama_id, paciente_id, medico_nombre, motivo)
  values (v_id, p_sistema, p_cama, p_paciente, nullif(p_medico, ''), nullif(p_motivo, ''));
  update public.camas set estado = 'ocupada' where id = p_cama;
  return v_id;
end;
$$;

-- RPC: dar egreso (libera la cama) --------------------------------------------
create or replace function public.dar_egreso(p_admision uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_adm public.admisiones;
begin
  select * into v_adm from public.admisiones where id = p_admision for update;
  if v_adm.id is null or not privado.tiene_rol(v_adm.sistema_id, '{admin,recepcion,medico,enfermeria}') then
    raise exception 'Admisión no encontrada o sin permiso.' using errcode = '42501';
  end if;
  if v_adm.estado = 'egresado' then
    raise exception 'Esa admisión ya tiene egreso.' using errcode = 'P0001';
  end if;
  update public.admisiones set estado = 'egresado', egreso_en = now() where id = p_admision;
  update public.camas set estado = 'libre' where id = v_adm.cama_id;
end;
$$;

revoke all on function public.admitir_paciente(uuid, uuid, uuid, text, text) from public, anon;
revoke all on function public.dar_egreso(uuid) from public, anon;
grant execute on function public.admitir_paciente(uuid, uuid, uuid, text, text) to authenticated;
grant execute on function public.dar_egreso(uuid) to authenticated;
