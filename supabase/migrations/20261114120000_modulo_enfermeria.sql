-- ============================================================================
-- MEDORA · Enfermería: indicaciones de medicamentos y Kardex (administración)
--
-- Para sedes con internamiento (clínica/hospital): el médico indica un medicamento
-- con su frecuencia; enfermería registra cada dosis (administrada / omitida /
-- rechazada). El horario lo calcula el servidor (kardex()). Las administraciones son
-- append-only y una misma dosis programada no se registra dos veces (índice único:
-- dos enfermeras que pulsan a la vez no la duplican).
-- En consultorio no se usa: allí enfermería trabaja con preconsulta y procedimientos
-- (historial y órdenes médicas, sin tablas nuevas).
-- ============================================================================

create table if not exists public.indicaciones_medicamento (
  id                 uuid primary key default gen_random_uuid(),
  sistema_id         uuid not null references public.sistemas (id) on delete restrict,
  paciente_id        uuid not null,
  admision_id        uuid,
  medicamento        text not null check (char_length(medicamento) between 2 and 200),
  dosis              text not null check (char_length(dosis) between 1 and 100),
  via                text not null check (via in ('Oral', 'IV', 'IM', 'SC', 'Sublingual', 'Inhalada', 'Tópica', 'Rectal', 'Oftálmica', 'Ótica', 'Nasal', 'Transdérmica')),
  pauta              text not null check (pauta in ('horario', 'unica', 'si_necesario')),
  frecuencia_horas   smallint check (frecuencia_horas between 1 and 168),
  primera_dosis      timestamptz not null default now(),
  dias               smallint check (dias between 1 and 90),
  observaciones      text check (char_length(observaciones) <= 1000),
  estado             text not null default 'activa' check (estado in ('activa', 'suspendida')),
  medico_id          uuid not null references public.perfiles (id),
  creado_en          timestamptz not null default now(),
  suspendida_en      timestamptz,
  suspendida_por     uuid references public.perfiles (id),
  motivo_suspension  text check (char_length(motivo_suspension) <= 500),
  unique (sistema_id, id),
  foreign key (sistema_id, paciente_id) references public.pacientes (sistema_id, id),
  foreign key (sistema_id, admision_id) references public.admisiones (sistema_id, id),
  check ((pauta = 'horario') = (frecuencia_horas is not null))
);
create index if not exists ix_indicaciones_paciente on public.indicaciones_medicamento (sistema_id, paciente_id, creado_en desc);
create index if not exists ix_indicaciones_activas on public.indicaciones_medicamento (sistema_id) where estado = 'activa';
create index if not exists ix_indicaciones_admision on public.indicaciones_medicamento (sistema_id, admision_id) where admision_id is not null;
create index if not exists ix_indicaciones_medico on public.indicaciones_medicamento (medico_id);
create index if not exists ix_indicaciones_suspendida_por on public.indicaciones_medicamento (suspendida_por) where suspendida_por is not null;

create table if not exists public.administraciones_medicamento (
  id               uuid primary key default gen_random_uuid(),
  sistema_id       uuid not null references public.sistemas (id) on delete restrict,
  indicacion_id    uuid not null,
  programada_para  timestamptz,
  estado           text not null check (estado in ('administrada', 'omitida', 'rechazada')),
  motivo           text check (char_length(motivo) <= 500),
  observaciones    text check (char_length(observaciones) <= 1000),
  registrado_por   uuid not null references public.perfiles (id),
  registrado_en    timestamptz not null default now(),
  foreign key (sistema_id, indicacion_id) references public.indicaciones_medicamento (sistema_id, id),
  check (estado = 'administrada' or nullif(trim(coalesce(motivo, '')), '') is not null)
);
-- Una dosis programada se registra una sola vez (las "si es necesario" no tienen hora fija).
create unique index if not exists ux_administraciones_dosis on public.administraciones_medicamento (indicacion_id, programada_para) where programada_para is not null;
create index if not exists ix_administraciones_indicacion on public.administraciones_medicamento (sistema_id, indicacion_id, registrado_en desc);
create index if not exists ix_administraciones_registrado_por on public.administraciones_medicamento (registrado_por);

alter table public.indicaciones_medicamento enable row level security;
alter table public.administraciones_medicamento enable row level security;

-- Lectura: como la historia clínica (incluida la vista del médico: solo sus pacientes).
drop policy if exists indicaciones_select on public.indicaciones_medicamento;
create policy indicaciones_select on public.indicaciones_medicamento for select to authenticated using (
  sistema_id in (select privado.mis_sistemas_con_rol('{medico,enfermeria,auditor,psicologia,nutricion,terapia}'::public.rol_sistema[], 'historial'))
  and (sistema_id in (select privado.sistemas_vista_completa()) or paciente_id in (select privado.mis_pacientes()))
);
drop policy if exists administraciones_select on public.administraciones_medicamento;
create policy administraciones_select on public.administraciones_medicamento for select to authenticated using (
  sistema_id in (select privado.mis_sistemas_con_rol('{medico,enfermeria,auditor,psicologia,nutricion,terapia}'::public.rol_sistema[], 'historial'))
  and indicacion_id in (select i.id from public.indicaciones_medicamento i)
);

revoke all on public.indicaciones_medicamento from anon, authenticated;
revoke all on public.administraciones_medicamento from anon, authenticated;
grant select on public.indicaciones_medicamento to authenticated;
grant select on public.administraciones_medicamento to authenticated;

-- Las administraciones no se tocan nunca; una corrección es otro registro.
drop trigger if exists trg_administraciones_append_only on public.administraciones_medicamento;
create trigger trg_administraciones_append_only before update or delete on public.administraciones_medicamento
  for each row execute function privado.tg_bloquear_append_only();

-- De una indicación solo cambia su suspensión; no se borra.
create or replace function privado.tg_indicacion_solo_suspension()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if privado.eliminando_sistema(old.sistema_id) then
      return old;
    end if;
    raise exception 'Una indicación médica no se borra: se suspende.' using errcode = '42501';
  end if;
  if (new.sistema_id, new.paciente_id, new.admision_id, new.medicamento, new.dosis, new.via, new.pauta,
      new.frecuencia_horas, new.primera_dosis, new.dias, new.observaciones, new.medico_id, new.creado_en)
     is distinct from
     (old.sistema_id, old.paciente_id, old.admision_id, old.medicamento, old.dosis, old.via, old.pauta,
      old.frecuencia_horas, old.primera_dosis, old.dias, old.observaciones, old.medico_id, old.creado_en) then
    raise exception 'Una indicación no se edita: suspéndela e indica una nueva.' using errcode = '42501';
  end if;
  if old.estado = 'suspendida' then
    raise exception 'La indicación ya estaba suspendida.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_indicaciones_solo_suspension on public.indicaciones_medicamento;
create trigger trg_indicaciones_solo_suspension before update or delete on public.indicaciones_medicamento
  for each row execute function privado.tg_indicacion_solo_suspension();

drop trigger if exists trg_indicaciones_medicamento_auditoria on public.indicaciones_medicamento;
create trigger trg_indicaciones_medicamento_auditoria after insert or update or delete on public.indicaciones_medicamento
  for each row execute function privado.tg_auditar('sin_datos');
drop trigger if exists trg_administraciones_medicamento_auditoria on public.administraciones_medicamento;
create trigger trg_administraciones_medicamento_auditoria after insert or update or delete on public.administraciones_medicamento
  for each row execute function privado.tg_auditar('sin_datos');

-- ── RPC ─────────────────────────────────────────────────────────────────────

create or replace function public.indicar_medicamento(
  p_sistema          uuid,
  p_paciente         uuid,
  p_medicamento      text,
  p_dosis            text,
  p_via              text,
  p_pauta            text,
  p_frecuencia_horas smallint default null,
  p_primera_dosis    timestamptz default null,
  p_dias             smallint default null,
  p_observaciones    text default null,
  p_admision         uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
  v_adm uuid := p_admision;
begin
  if not privado.tiene_rol(p_sistema, '{medico}'::public.rol_sistema[], 'historial') then
    raise exception 'Solo un médico indica medicamentos.' using errcode = '42501';
  end if;
  if not (p_sistema in (select privado.sistemas_vista_completa()) or p_paciente in (select privado.mis_pacientes())) then
    raise exception 'No tienes acceso a este paciente.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.pacientes where sistema_id = p_sistema and id = p_paciente and eliminado_en is null) then
    raise exception 'El paciente no existe.' using errcode = 'P0002';
  end if;
  -- Si no se indica la admisión, se liga a la que tenga abierta.
  if v_adm is null then
    select a.id into v_adm from public.admisiones a
     where a.sistema_id = p_sistema and a.paciente_id = p_paciente and a.estado = 'ingresado'
     order by a.ingreso_en desc limit 1;
  elsif not exists (select 1 from public.admisiones where sistema_id = p_sistema and id = v_adm and paciente_id = p_paciente) then
    raise exception 'La admisión no corresponde al paciente.' using errcode = '22023';
  end if;

  insert into public.indicaciones_medicamento
    (sistema_id, paciente_id, admision_id, medicamento, dosis, via, pauta, frecuencia_horas, primera_dosis, dias, observaciones, medico_id)
  values
    (p_sistema, p_paciente, v_adm, trim(p_medicamento), trim(p_dosis), p_via, p_pauta,
     case when p_pauta = 'horario' then p_frecuencia_horas end,
     coalesce(p_primera_dosis, now()),
     case when p_pauta = 'horario' then p_dias end,
     nullif(trim(coalesce(p_observaciones, '')), ''), v_uid)
  returning id into v_id;

  -- Queda también en la historia clínica.
  insert into public.historial_clinico (sistema_id, paciente_id, autor_id, tipo, titulo, contenido, datos)
  values (p_sistema, p_paciente, v_uid, 'formulario', 'Indicación de medicamento',
          trim(p_medicamento) || ' ' || trim(p_dosis) || ' ' || p_via
            || case p_pauta when 'horario' then ' cada ' || p_frecuencia_horas || ' h' || coalesce(' por ' || p_dias || ' días', '')
                            when 'unica' then ', dosis única' else ', si es necesario' end,
          jsonb_strip_nulls(jsonb_build_object(
            'formulario', 'indicacion_medicamento', 'indicacion_id', v_id,
            'medicamento', trim(p_medicamento), 'dosis', trim(p_dosis), 'via', p_via,
            'pauta', case p_pauta when 'horario' then 'Horario fijo' when 'unica' then 'Dosis única' else 'Si es necesario' end,
            'frecuencia', case when p_pauta = 'horario' then 'Cada ' || p_frecuencia_horas || ' h' end,
            'duracion', case when p_pauta = 'horario' and p_dias is not null then p_dias || ' días' end,
            'observaciones', nullif(trim(coalesce(p_observaciones, '')), ''))));
  return v_id;
end;
$$;

create or replace function public.suspender_indicacion(p_indicacion uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.indicaciones_medicamento%rowtype;
begin
  select * into v from public.indicaciones_medicamento where id = p_indicacion for update;
  if v.id is null then
    raise exception 'La indicación no existe.' using errcode = 'P0002';
  end if;
  if not privado.tiene_rol(v.sistema_id, '{medico}'::public.rol_sistema[], 'historial') then
    raise exception 'Solo un médico suspende una indicación.' using errcode = '42501';
  end if;
  if not (v.sistema_id in (select privado.sistemas_vista_completa()) or v.paciente_id in (select privado.mis_pacientes())) then
    raise exception 'No tienes acceso a este paciente.' using errcode = '42501';
  end if;
  if nullif(trim(coalesce(p_motivo, '')), '') is null then
    raise exception 'Escribe el motivo de la suspensión.' using errcode = '22023';
  end if;
  update public.indicaciones_medicamento
     set estado = 'suspendida', suspendida_en = now(), suspendida_por = auth.uid(), motivo_suspension = left(trim(p_motivo), 500)
   where id = p_indicacion;
end;
$$;

create or replace function public.registrar_administracion(
  p_indicacion    uuid,
  p_programada    timestamptz,
  p_estado        text,
  p_motivo        text default null,
  p_observaciones text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v    public.indicaciones_medicamento%rowtype;
  v_id uuid;
begin
  select * into v from public.indicaciones_medicamento where id = p_indicacion;
  if v.id is null then
    raise exception 'La indicación no existe.' using errcode = 'P0002';
  end if;
  if not privado.tiene_rol(v.sistema_id, '{enfermeria,medico}'::public.rol_sistema[], 'historial') then
    raise exception 'Solo enfermería o medicina registran la administración.' using errcode = '42501';
  end if;
  if not (v.sistema_id in (select privado.sistemas_vista_completa()) or v.paciente_id in (select privado.mis_pacientes())) then
    raise exception 'No tienes acceso a este paciente.' using errcode = '42501';
  end if;
  if p_estado not in ('administrada', 'omitida', 'rechazada') then
    raise exception 'Estado inválido.' using errcode = '22023';
  end if;
  if p_estado <> 'administrada' and nullif(trim(coalesce(p_motivo, '')), '') is null then
    raise exception 'Escribe por qué no se administró.' using errcode = '22023';
  end if;
  if v.estado = 'suspendida' and p_estado = 'administrada' then
    raise exception 'La indicación está suspendida: no se administra.' using errcode = '22023';
  end if;
  if v.pauta = 'si_necesario' then
    p_programada := null;
  elsif p_programada is null then
    raise exception 'Falta la hora programada de la dosis.' using errcode = '22023';
  elsif p_programada > now() + interval '2 hours' then
    raise exception 'Esa dosis es para más adelante.' using errcode = '22023';
  end if;

  begin
    insert into public.administraciones_medicamento (sistema_id, indicacion_id, programada_para, estado, motivo, observaciones, registrado_por)
    values (v.sistema_id, v.id, p_programada, p_estado, nullif(left(trim(coalesce(p_motivo, '')), 500), ''),
            nullif(left(trim(coalesce(p_observaciones, '')), 1000), ''), auth.uid())
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Esa dosis ya fue registrada por otra persona.' using errcode = '23505';
  end;
  return v_id;
end;
$$;

-- Dosis del período (horario calculado en el servidor) con lo que ya se registró.
-- security invoker: las políticas RLS deciden qué indicaciones ve cada quien.
create or replace function public.kardex(p_sistema uuid, p_desde timestamptz, p_hasta timestamptz)
returns table (
  indicacion_id   uuid,
  paciente_id     uuid,
  paciente        text,
  cama            text,
  medicamento     text,
  dosis           text,
  via             text,
  pauta           text,
  frecuencia_horas smallint,
  observaciones   text,
  estado_indicacion text,
  programada_para timestamptz,
  administracion_id uuid,
  estado          text,
  motivo          text,
  registrado_en   timestamptz,
  registrado_por  text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with ind as (
    select i.*
      from public.indicaciones_medicamento i
     where i.sistema_id = p_sistema
       and i.primera_dosis <= p_hasta
       and (i.estado = 'activa' or i.suspendida_en > p_desde)
       and (i.dias is null or i.primera_dosis + make_interval(days => i.dias) > p_desde)
  ),
  dosis as (
    -- Horario fijo: cada N horas desde la primera dosis, hasta el fin (días) o la suspensión.
    select i.id, g.t
      from ind i
      cross join lateral generate_series(i.primera_dosis, p_hasta, make_interval(hours => i.frecuencia_horas)) as g (t)
     where i.pauta = 'horario'
       and g.t >= p_desde
       and (i.dias is null or g.t < i.primera_dosis + make_interval(days => i.dias))
       and (i.suspendida_en is null or g.t < i.suspendida_en)
    union all
    select i.id, i.primera_dosis from ind i where i.pauta = 'unica' and i.primera_dosis between p_desde and p_hasta
    union all
    -- "Si es necesario": una fila sin hora (y abajo, las que ya se dieron en el período).
    select i.id, null::timestamptz from ind i where i.pauta = 'si_necesario' and i.estado = 'activa'
  ),
  filas as (
    select d.id, d.t, a.id as administracion_id, a.estado, a.motivo, a.registrado_en, a.registrado_por
      from dosis d
      left join public.administraciones_medicamento a on a.indicacion_id = d.id and a.programada_para = d.t
    union all
    select a.indicacion_id, null, a.id, a.estado, a.motivo, a.registrado_en, a.registrado_por
      from public.administraciones_medicamento a
      join ind i on i.id = a.indicacion_id
     where i.pauta = 'si_necesario' and a.registrado_en between p_desde and p_hasta
  )
  select i.id, i.paciente_id, trim(p.nombres || ' ' || p.apellidos), c.codigo,
         i.medicamento, i.dosis, i.via, i.pauta, i.frecuencia_horas, i.observaciones, i.estado,
         f.t, f.administracion_id, f.estado, f.motivo, f.registrado_en, pr.nombre_completo
    from filas f
    join ind i on i.id = f.id
    join public.pacientes p on p.sistema_id = i.sistema_id and p.id = i.paciente_id
    left join public.admisiones ad on ad.sistema_id = i.sistema_id and ad.id = i.admision_id
    left join public.camas c on c.sistema_id = ad.sistema_id and c.id = ad.cama_id
    left join public.perfiles pr on pr.id = f.registrado_por
   order by f.t nulls last, c.codigo nulls last, i.medicamento;
$$;

revoke all on function public.indicar_medicamento(uuid, uuid, text, text, text, text, smallint, timestamptz, smallint, text, uuid) from public, anon;
revoke all on function public.suspender_indicacion(uuid, text) from public, anon;
revoke all on function public.registrar_administracion(uuid, timestamptz, text, text, text) from public, anon;
revoke all on function public.kardex(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.indicar_medicamento(uuid, uuid, text, text, text, text, smallint, timestamptz, smallint, text, uuid) to authenticated;
grant execute on function public.suspender_indicacion(uuid, text) to authenticated;
grant execute on function public.registrar_administracion(uuid, timestamptz, text, text, text) to authenticated;
grant execute on function public.kardex(uuid, timestamptz, timestamptz) to authenticated;
