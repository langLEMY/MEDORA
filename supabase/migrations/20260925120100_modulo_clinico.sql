-- ============================================================================
-- MEDORA · 0002 · Módulo clínico
-- Aseguradoras, catálogo de servicios, coberturas, pacientes, citas e historial
-- clínico (append-only). Todas las FK entre tablas de negocio son compuestas
-- (sistema_id, id): Postgres garantiza que una cita nunca apunte a un paciente
-- o médico de otro sistema hospitalario.
-- ============================================================================

-- Aseguradoras (ARS / seguros médicos) --------------------------------------
create table public.aseguradoras (
  id              uuid primary key default gen_random_uuid(),
  sistema_id      uuid not null references public.sistemas(id) on delete restrict,
  nombre          text not null check (char_length(nombre) between 2 and 120),
  codigo          text,
  telefono        text,
  email           text,
  activo          boolean not null default true,
  creado_en       timestamptz not null default now(),
  creado_por      uuid default auth.uid(),
  actualizado_en  timestamptz not null default now(),
  actualizado_por uuid,
  unique (sistema_id, nombre),
  unique (sistema_id, id)
);
create trigger trg_aseguradoras_actualizacion before update on public.aseguradoras
  for each row execute function privado.tg_marcar_actualizacion();

-- Catálogo de servicios ------------------------------------------------------
create table public.servicios (
  id              uuid primary key default gen_random_uuid(),
  sistema_id      uuid not null references public.sistemas(id) on delete restrict,
  codigo          text,
  nombre          text not null check (char_length(nombre) between 2 and 160),
  categoria       text not null default 'consulta'
                  check (categoria in ('consulta', 'procedimiento', 'laboratorio', 'imagen', 'emergencia', 'hospitalizacion', 'farmacia', 'otro')),
  precio          numeric(12, 2) not null default 0 check (precio >= 0),
  duracion_min    integer not null default 30 check (duracion_min between 5 and 720),
  activo          boolean not null default true,
  creado_en       timestamptz not null default now(),
  creado_por      uuid default auth.uid(),
  actualizado_en  timestamptz not null default now(),
  actualizado_por uuid,
  unique (sistema_id, nombre),
  unique (sistema_id, id)
);
create trigger trg_servicios_actualizacion before update on public.servicios
  for each row execute function privado.tg_marcar_actualizacion();

-- Coberturas: cuánto cubre cada aseguradora de cada servicio ----------------
create table public.coberturas (
  id              uuid primary key default gen_random_uuid(),
  sistema_id      uuid not null references public.sistemas(id) on delete restrict,
  aseguradora_id  uuid not null,
  servicio_id     uuid not null,
  monto_cubierto  numeric(12, 2) not null check (monto_cubierto >= 0),
  creado_en       timestamptz not null default now(),
  creado_por      uuid default auth.uid(),
  actualizado_en  timestamptz not null default now(),
  actualizado_por uuid,
  unique (aseguradora_id, servicio_id),
  foreign key (sistema_id, aseguradora_id) references public.aseguradoras (sistema_id, id),
  foreign key (sistema_id, servicio_id) references public.servicios (sistema_id, id)
);
create trigger trg_coberturas_actualizacion before update on public.coberturas
  for each row execute function privado.tg_marcar_actualizacion();

-- Pacientes ------------------------------------------------------------------
create table public.pacientes (
  id                          uuid primary key default gen_random_uuid(),
  sistema_id                  uuid not null references public.sistemas(id) on delete restrict,
  expediente                  text not null,
  nombres                     text not null check (char_length(nombres) between 1 and 120),
  apellidos                   text not null check (char_length(apellidos) between 1 and 120),
  documento_tipo              text not null default 'cedula'
                              check (documento_tipo in ('cedula', 'pasaporte', 'menor', 'otro')),
  documento                   text,
  fecha_nacimiento            date check (fecha_nacimiento <= current_date),
  sexo                        text check (sexo in ('F', 'M', 'X')),
  telefono                    text,
  email                       text,
  direccion                   text,
  tipo_sangre                 text check (tipo_sangre in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  alergias                    text,
  condiciones_cronicas        text,
  aseguradora_id              uuid,
  numero_afiliado             text,
  contacto_emergencia_nombre  text,
  contacto_emergencia_telefono text,
  notas                       text,
  eliminado_en                timestamptz,
  busqueda                    text generated always as (
                                lower(nombres || ' ' || apellidos || ' ' || coalesce(documento, '') || ' ' || expediente)
                              ) stored,
  creado_en                   timestamptz not null default now(),
  creado_por                  uuid default auth.uid(),
  actualizado_en              timestamptz not null default now(),
  actualizado_por             uuid,
  unique (sistema_id, expediente),
  unique (sistema_id, id),
  foreign key (sistema_id, aseguradora_id) references public.aseguradoras (sistema_id, id)
);
create unique index ux_pacientes_documento on public.pacientes (sistema_id, documento_tipo, documento)
  where documento is not null and eliminado_en is null;
create index ix_pacientes_busqueda on public.pacientes using gin (busqueda extensions.gin_trgm_ops);
create index ix_pacientes_sistema_creado on public.pacientes (sistema_id, creado_en desc);

create or replace function privado.tg_asignar_expediente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.expediente is null or new.expediente = '' then
    new.expediente := 'EXP-' || lpad(privado.siguiente_numero(new.sistema_id, 'expediente')::text, 6, '0');
  end if;
  return new;
end;
$$;

create trigger trg_pacientes_expediente before insert on public.pacientes
  for each row execute function privado.tg_asignar_expediente();
create trigger trg_pacientes_actualizacion before update on public.pacientes
  for each row execute function privado.tg_marcar_actualizacion();

-- Citas ----------------------------------------------------------------------
create type public.estado_cita as enum (
  'programada', 'confirmada', 'en_espera', 'en_consulta', 'completada', 'cancelada', 'no_asistio'
);

create table public.citas (
  id               uuid primary key default gen_random_uuid(),
  sistema_id       uuid not null references public.sistemas(id) on delete restrict,
  sede_id          uuid,
  paciente_id      uuid not null,
  medico_id        uuid not null,
  servicio_id      uuid,
  inicio           timestamptz not null,
  fin              timestamptz not null,
  estado           public.estado_cita not null default 'programada',
  motivo           text,
  notas            text,
  llegada_en       timestamptz,
  atendida_en      timestamptz,
  motivo_cancelacion text,
  creado_en        timestamptz not null default now(),
  creado_por       uuid default auth.uid(),
  actualizado_en   timestamptz not null default now(),
  actualizado_por  uuid,
  check (fin > inicio),
  unique (sistema_id, id),
  foreign key (sistema_id, sede_id) references public.sedes (sistema_id, id),
  foreign key (sistema_id, paciente_id) references public.pacientes (sistema_id, id),
  foreign key (sistema_id, medico_id) references public.membresias (sistema_id, usuario_id),
  foreign key (sistema_id, servicio_id) references public.servicios (sistema_id, id),
  -- Un médico no puede tener dos citas activas solapadas.
  constraint ex_citas_medico_sin_solape exclude using gist (
    medico_id with =,
    tstzrange(inicio, fin) with &&
  ) where (estado not in ('cancelada', 'no_asistio'))
);
create index ix_citas_sistema_inicio on public.citas (sistema_id, inicio);
create index ix_citas_paciente on public.citas (paciente_id, inicio desc);
create index ix_citas_medico_inicio on public.citas (medico_id, inicio);

create trigger trg_citas_actualizacion before update on public.citas
  for each row execute function privado.tg_marcar_actualizacion();

-- Historial clínico (append-only) -------------------------------------------
-- Las correcciones se hacen con una nueva entrada tipo 'adenda' que apunta a la
-- original (corrige_a), nunca editando la existente.
create type public.tipo_entrada_clinica as enum (
  'consulta', 'evolucion', 'diagnostico', 'receta', 'signos_vitales',
  'laboratorio', 'imagen', 'procedimiento', 'triaje', 'adenda'
);

create table public.historial_clinico (
  id           uuid primary key default gen_random_uuid(),
  sistema_id   uuid not null references public.sistemas(id) on delete restrict,
  paciente_id  uuid not null,
  cita_id      uuid,
  autor_id     uuid not null default auth.uid(),
  tipo         public.tipo_entrada_clinica not null,
  titulo       text,
  contenido    text not null check (char_length(contenido) between 1 and 20000),
  datos        jsonb not null default '{}'::jsonb,
  corrige_a    uuid references public.historial_clinico(id),
  creado_en    timestamptz not null default now(),
  foreign key (sistema_id, paciente_id) references public.pacientes (sistema_id, id),
  foreign key (sistema_id, cita_id) references public.citas (sistema_id, id)
);
create index ix_historial_paciente on public.historial_clinico (paciente_id, creado_en desc);

create trigger trg_historial_append_only before update or delete on public.historial_clinico
  for each row execute function privado.tg_bloquear_append_only();

-- RLS ------------------------------------------------------------------------
alter table public.aseguradoras      enable row level security;
alter table public.servicios         enable row level security;
alter table public.coberturas        enable row level security;
alter table public.pacientes         enable row level security;
alter table public.citas             enable row level security;
alter table public.historial_clinico enable row level security;

-- Catálogos: lectura para cualquier miembro, escritura admin.
create policy aseguradoras_select on public.aseguradoras for select to authenticated
  using (sistema_id in (select privado.mis_sistemas()));
create policy aseguradoras_insert on public.aseguradoras for insert to authenticated
  with check (sistema_id in (select privado.mis_sistemas_con_rol('{admin}')));
create policy aseguradoras_update on public.aseguradoras for update to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{admin}')))
  with check (sistema_id in (select privado.mis_sistemas_con_rol('{admin}')));

create policy servicios_select on public.servicios for select to authenticated
  using (sistema_id in (select privado.mis_sistemas()));
create policy servicios_insert on public.servicios for insert to authenticated
  with check (sistema_id in (select privado.mis_sistemas_con_rol('{admin}')));
create policy servicios_update on public.servicios for update to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{admin}')))
  with check (sistema_id in (select privado.mis_sistemas_con_rol('{admin}')));

create policy coberturas_select on public.coberturas for select to authenticated
  using (sistema_id in (select privado.mis_sistemas()));
create policy coberturas_insert on public.coberturas for insert to authenticated
  with check (sistema_id in (select privado.mis_sistemas_con_rol('{admin}')));
create policy coberturas_update on public.coberturas for update to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{admin}')))
  with check (sistema_id in (select privado.mis_sistemas_con_rol('{admin}')));
create policy coberturas_delete on public.coberturas for delete to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{admin}')));

-- Pacientes: todo el personal los consulta; registran/editan los roles de
-- atención. No hay DELETE: se archivan con eliminado_en.
create policy pacientes_select on public.pacientes for select to authenticated
  using (sistema_id in (select privado.mis_sistemas()));
create policy pacientes_insert on public.pacientes for insert to authenticated
  with check (sistema_id in (select privado.mis_sistemas_con_rol('{admin,medico,enfermeria,recepcion,caja}')));
create policy pacientes_update on public.pacientes for update to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{admin,medico,enfermeria,recepcion,caja}')))
  with check (sistema_id in (select privado.mis_sistemas_con_rol('{admin,medico,enfermeria,recepcion,caja}')));

-- Citas.
create policy citas_select on public.citas for select to authenticated
  using (sistema_id in (select privado.mis_sistemas()));
create policy citas_insert on public.citas for insert to authenticated
  with check (sistema_id in (select privado.mis_sistemas_con_rol('{admin,medico,enfermeria,recepcion}')));
create policy citas_update on public.citas for update to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{admin,medico,enfermeria,recepcion}')))
  with check (sistema_id in (select privado.mis_sistemas_con_rol('{admin,medico,enfermeria,recepcion}')));

-- Historial clínico: solo personal clínico (y auditoría en lectura). Cada
-- entrada queda firmada por su autor: no se puede insertar a nombre de otro.
create policy historial_select on public.historial_clinico for select to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{medico,enfermeria,auditor}')));
create policy historial_insert on public.historial_clinico for insert to authenticated
  with check (
    sistema_id in (select privado.mis_sistemas_con_rol('{medico,enfermeria}'))
    and autor_id = (select auth.uid())
  );

revoke all on public.aseguradoras, public.servicios, public.coberturas, public.pacientes,
  public.citas, public.historial_clinico from anon;
revoke delete on public.aseguradoras, public.servicios, public.pacientes, public.citas from authenticated;
revoke update, delete, truncate on public.historial_clinico from authenticated;
