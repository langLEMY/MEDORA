-- ============================================================================
-- MEDORA · Turnos de pacientes (2/2)
--
-- Recorrido (con cobro antes de la consulta, como FUNBIDE):
--   recepción registra la llegada (con o sin cita; a un médico o a la cola de una
--   especialidad) → estado por_cobrar → caja cobra el cobro con esa cita (o un
--   admin la exonera) → se activa el turno "MG-012" y pasa a en_espera → el
--   médico "llama al siguiente" (prioridad legal primero, luego orden de llegada)
--   → llamado → en_consulta → completada / no_asistio.
-- Si el sistema no cobra antes (sistemas.cobro_antes_consulta = false), el
-- turno se activa al registrar la llegada.
-- ============================================================================

alter table public.citas alter column medico_id drop not null;
alter table public.citas
  add column especialidad       text,
  add column turno              text,
  add column turno_en           timestamptz,
  add column prioridad          boolean not null default false,
  add column motivo_prioridad   text,
  add column llamado_en         timestamptz,
  add column llamado_veces      int not null default 0,
  add column exonerado_por      uuid references public.perfiles(id),
  add column motivo_exoneracion text,
  add constraint citas_medico_o_especialidad check (medico_id is not null or especialidad is not null);
create index ix_citas_cola on public.citas (sistema_id, especialidad, turno_en) where estado in ('en_espera', 'llamado');
create index ix_fk_citas_exonerado_por on public.citas (exonerado_por);

alter table public.sistemas add column cobro_antes_consulta boolean not null default true;
alter table public.membresias add column consultorio text;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- "Medicina general y familiar" → MG · "Odontología" → OD · sin especialidad → GE
create or replace function privado.prefijo_turno(p_especialidad text)
returns text
language sql
immutable
set search_path = ''
as $$
  with palabras as (
    select array_remove(regexp_split_to_array(
      upper(translate(coalesce(trim(p_especialidad), ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')), '[^A-Z]+'), '') as p
  ), utiles as (
    select array(select x from unnest(p) x where x not in ('Y', 'DE', 'DEL', 'LA', 'LAS', 'LOS', 'EL', 'E')) as u from palabras
  )
  select case
    when cardinality(u) = 0 then 'GE'
    when cardinality(u) = 1 then left(u[1], 2)
    else left(u[1], 1) || left(u[2], 1)
  end from utiles;
$$;

create or replace function privado.mis_especialidades()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select distinct trim(m.especialidad) from public.membresias m
   where m.usuario_id = (select auth.uid()) and m.activo and nullif(trim(m.especialidad), '') is not null;
$$;

-- Los pacientes en la cola de mi especialidad también son "míos" mientras esperan.
create or replace function privado.mis_pacientes()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.paciente_id from public.citas c where c.medico_id = (select auth.uid())
  union
  select h.paciente_id from public.historial_clinico h where h.autor_id = (select auth.uid())
  union
  select c.paciente_id from public.citas c
   where c.medico_id is null and c.estado = 'en_espera' and c.especialidad in (select privado.mis_especialidades());
$$;

alter policy citas_select on public.citas using (
  sistema_id in (select privado.mis_sistemas())
  and (
    sistema_id in (select privado.sistemas_vista_completa())
    or medico_id = (select auth.uid())
    or (medico_id is null and especialidad in (select privado.mis_especialidades()))
  )
);

-- Asigna el número del día (por especialidad) y pone al paciente en la cola.
create or replace function privado.activar_turno(p_cita uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.citas;
  v_pref text;
  v_n bigint;
  v_turno text;
begin
  select * into c from public.citas where id = p_cita for update;
  if c.turno is not null then
    return c.turno;
  end if;
  v_pref := privado.prefijo_turno(c.especialidad);
  v_n := privado.siguiente_numero(c.sistema_id,
           'turno:' || to_char(now() at time zone 'America/Santo_Domingo', 'YYYYMMDD') || ':' || v_pref);
  v_turno := v_pref || '-' || lpad(v_n::text, 3, '0');
  update public.citas set
    turno = v_turno, turno_en = now(), estado = 'en_espera', llegada_en = coalesce(llegada_en, now())
  where id = p_cita;
  return v_turno;
end;
$$;

-- ---------------------------------------------------------------------------
-- Llegada (recepción)
-- ---------------------------------------------------------------------------
create or replace function public.registrar_llegada(
  p_sistema uuid, p_paciente uuid, p_medico uuid default null, p_especialidad text default null,
  p_servicio uuid default null, p_cita uuid default null, p_prioridad boolean default false, p_motivo_prioridad text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_esp text;
  v_turno text;
  v_estado public.estado_cita;
begin
  if not privado.tiene_rol(p_sistema, '{admin,recepcion,enfermeria,gerencia}', 'agenda') then
    raise exception 'No tienes permiso para registrar llegadas.' using errcode = '42501';
  end if;
  if p_medico is not null and not exists (
       select 1 from public.membresias where sistema_id = p_sistema and usuario_id = p_medico and activo and atiende_agenda) then
    raise exception 'Ese médico no atiende en este sistema.' using errcode = 'P0001';
  end if;
  v_esp := coalesce(nullif(trim(p_especialidad), ''),
                    (select nullif(trim(especialidad), '') from public.membresias where sistema_id = p_sistema and usuario_id = p_medico));

  if p_cita is not null then
    update public.citas set
      medico_id = coalesce(p_medico, medico_id),
      especialidad = coalesce(v_esp, especialidad,
        (select nullif(trim(m.especialidad), '') from public.membresias m where m.sistema_id = p_sistema and m.usuario_id = citas.medico_id)),
      servicio_id = coalesce(p_servicio, servicio_id),
      prioridad = coalesce(p_prioridad, false),
      motivo_prioridad = nullif(trim(p_motivo_prioridad), ''),
      llegada_en = now(),
      estado = 'por_cobrar'
    where id = p_cita and sistema_id = p_sistema and estado in ('programada', 'confirmada')
    returning id into v_id;
    if v_id is null then
      raise exception 'La cita no existe o ya fue atendida.' using errcode = 'P0001';
    end if;
  else
    if p_medico is null and v_esp is null then
      raise exception 'Elige el médico o la especialidad.' using errcode = 'P0001';
    end if;
    insert into public.citas (sistema_id, paciente_id, medico_id, servicio_id, inicio, fin, estado, especialidad,
                              llegada_en, prioridad, motivo_prioridad, motivo)
    values (p_sistema, p_paciente, p_medico, p_servicio, now(), now() + interval '30 minutes', 'por_cobrar', v_esp,
            now(), coalesce(p_prioridad, false), nullif(trim(p_motivo_prioridad), ''), 'Llegada sin cita')
    returning id into v_id;
  end if;

  if not (select s.cobro_antes_consulta from public.sistemas s where s.id = p_sistema) then
    v_turno := privado.activar_turno(v_id);
  end if;
  select estado into v_estado from public.citas where id = v_id;
  return jsonb_build_object('id', v_id, 'estado', v_estado, 'turno', v_turno);
end;
$$;

-- Al cobrar una cita que está por cobrar, entra a la cola.
create or replace function privado.tg_cobro_activa_turno()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.cita_id is not null and exists (select 1 from public.citas where id = new.cita_id and estado = 'por_cobrar') then
    perform privado.activar_turno(new.cita_id);
  end if;
  return new;
end;
$$;
create trigger trg_cobros_activa_turno after insert on public.cobros
  for each row execute function privado.tg_cobro_activa_turno();

-- Pacientes que la fundación atiende sin cobrar: solo administración, con motivo.
create or replace function public.exonerar_turno(p_cita uuid, p_motivo text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.citas;
begin
  select * into c from public.citas where id = p_cita;
  if c.id is null or not privado.tiene_rol(c.sistema_id, '{admin}') then
    raise exception 'Solo administración puede exonerar el pago.' using errcode = '42501';
  end if;
  if c.estado <> 'por_cobrar' then
    raise exception 'Este paciente no está pendiente de cobro.' using errcode = 'P0001';
  end if;
  if char_length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Escribe el motivo de la exoneración.' using errcode = 'P0001';
  end if;
  update public.citas set exonerado_por = auth.uid(), motivo_exoneracion = trim(p_motivo) where id = p_cita;
  return privado.activar_turno(p_cita);
end;
$$;

-- ---------------------------------------------------------------------------
-- Médico: llamar
-- ---------------------------------------------------------------------------
-- Siguiente de mi cola (los míos y los de mi especialidad sin médico): primero
-- prioridad legal, después orden de llegada. SKIP LOCKED: dos médicos que llaman
-- a la vez nunca se llevan al mismo paciente.
create or replace function public.llamar_siguiente(p_sistema uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not privado.tiene_rol(p_sistema, '{medico,psicologia,nutricion,terapia}') then
    raise exception 'Solo los médicos llaman pacientes.' using errcode = '42501';
  end if;
  select id into v_id from public.citas
   where sistema_id = p_sistema and estado = 'en_espera' and turno is not null
     and (medico_id = auth.uid() or (medico_id is null and especialidad in (select privado.mis_especialidades())))
   order by prioridad desc, turno_en
   limit 1
   for update skip locked;
  if v_id is null then
    return null;
  end if;
  return public.llamar_turno(v_id);
end;
$$;

-- Llamar (o volver a llamar) un turno concreto.
create or replace function public.llamar_turno(p_cita uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.citas;
begin
  select * into c from public.citas where id = p_cita for update;
  if c.id is null or not privado.tiene_rol(c.sistema_id, '{medico,psicologia,nutricion,terapia}') then
    raise exception 'Turno no encontrado o sin permiso.' using errcode = '42501';
  end if;
  if c.estado not in ('en_espera', 'llamado') then
    raise exception 'Ese paciente ya no está en espera.' using errcode = 'P0001';
  end if;
  if not (c.medico_id = auth.uid() or (c.medico_id is null and c.especialidad in (select privado.mis_especialidades()))) then
    raise exception 'Ese turno es de otro médico.' using errcode = '42501';
  end if;
  update public.citas set
    medico_id = auth.uid(), estado = 'llamado', llamado_en = now(), llamado_veces = llamado_veces + 1
  where id = p_cita;
  return jsonb_build_object('id', c.id, 'turno', c.turno, 'paciente_id', c.paciente_id);
end;
$$;

revoke all on function privado.prefijo_turno(text) from public, anon;
revoke all on function privado.mis_especialidades() from public, anon;
revoke all on function privado.activar_turno(uuid) from public, anon, authenticated;
revoke all on function privado.tg_cobro_activa_turno() from public, anon, authenticated;
revoke all on function public.registrar_llegada(uuid, uuid, uuid, text, uuid, uuid, boolean, text) from public, anon;
revoke all on function public.exonerar_turno(uuid, text) from public, anon;
revoke all on function public.llamar_siguiente(uuid) from public, anon;
revoke all on function public.llamar_turno(uuid) from public, anon;
grant execute on function privado.prefijo_turno(text) to authenticated;
grant execute on function privado.mis_especialidades() to authenticated;
grant execute on function public.registrar_llegada(uuid, uuid, uuid, text, uuid, uuid, boolean, text) to authenticated;
grant execute on function public.exonerar_turno(uuid, text) to authenticated;
grant execute on function public.llamar_siguiente(uuid) to authenticated;
grant execute on function public.llamar_turno(uuid) to authenticated;
