-- ============================================================================
-- MEDORA · El quiosco ya no crea pacientes
--
-- Antes, "Soy nuevo / no tengo cédula" creaba una ficha "Paciente nuevo · Por
-- registrar" por cada turno: ensuciaba la base de pacientes. Ahora el turno nace
-- SIN paciente (por_identificar), con la cédula que se escribió (cedula_llegada),
-- y queda enlazado cuando caja cobra (el cobro trae el paciente real, buscado o
-- registrado en ese momento) o cuando recepción/caja lo identifica.
-- ============================================================================

alter table public.citas alter column paciente_id drop not null;
alter table public.citas
  add column por_identificar boolean not null default false,
  add column cedula_llegada text,
  add constraint citas_paciente_o_por_identificar check (paciente_id is not null or por_identificar);

-- Enlaza el paciente real a un turno que llegó sin identificar.
create or replace function privado.identificar_cita(p_cita uuid, p_paciente uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.citas c set paciente_id = p_paciente, por_identificar = false
   where c.id = p_cita and c.paciente_id is null
     and exists (select 1 from public.pacientes p where p.id = p_paciente and p.sistema_id = c.sistema_id);
end;
$$;

create or replace function public.identificar_turno(p_cita uuid, p_paciente uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sis uuid;
begin
  select sistema_id into v_sis from public.citas where id = p_cita;
  if v_sis is null or not privado.tiene_rol(v_sis, '{admin,recepcion,caja,enfermeria,gerencia}') then
    raise exception 'Turno no encontrado o sin permiso.' using errcode = '42501';
  end if;
  perform privado.identificar_cita(p_cita, p_paciente);
end;
$$;

-- Al cobrar: primero se enlaza el paciente del cobro y luego entra a la cola.
create or replace function privado.tg_cobro_activa_turno()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.cita_id is not null then
    perform privado.identificar_cita(new.cita_id, new.paciente_id);
    if exists (select 1 from public.citas where id = new.cita_id and estado = 'por_cobrar') then
      perform privado.activar_turno(new.cita_id);
    end if;
  end if;
  return new;
end;
$$;

-- Exonerar exige saber a quién se le perdona el pago.
do $$
declare
  v_def text := pg_get_functiondef('public.exonerar_turno'::regproc);
  v_nueva text;
begin
  v_nueva := replace(v_def,
    '  if c.estado <> ''por_cobrar'' then',
    '  if c.paciente_id is null then' || E'\n' ||
    '    raise exception ''Identifica al paciente antes de exonerarlo.'' using errcode = ''P0001'';' || E'\n' ||
    '  end if;' || E'\n' ||
    '  if c.estado <> ''por_cobrar'' then');
  if v_nueva = v_def then
    raise exception 'exonerar_turno no tiene el formato esperado.';
  end if;
  execute v_nueva;
end;
$$;

-- Quiosco: sin paciente registrado, el turno queda por identificar (nunca una ficha falsa).
create or replace function public.quiosco_tomar_turno(
  p_sistema uuid, p_paciente uuid default null, p_cedula text default null, p_cita uuid default null,
  p_medico uuid default null, p_especialidad text default null, p_prioridad boolean default false, p_motivo_prioridad text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pac uuid := p_paciente;
  v_digitos text := regexp_replace(coalesce(p_cedula, ''), '\D', '', 'g');
  v_id uuid;
  v_esp text;
  v_turno text;
  c public.citas;
  v_delante int;
  v_destino text;
begin
  if not privado.puede_quiosco(p_sistema) then
    raise exception 'Este equipo no está autorizado como quiosco.' using errcode = '42501';
  end if;
  if v_pac is not null and not exists (select 1 from public.pacientes where id = v_pac and sistema_id = p_sistema) then
    raise exception 'Paciente no encontrado.' using errcode = 'P0001';
  end if;
  -- Si la cédula ya está registrada se usa esa ficha.
  if v_pac is null and length(v_digitos) >= 6 then
    select id into v_pac from public.pacientes
     where sistema_id = p_sistema and eliminado_en is null and regexp_replace(coalesce(documento, ''), '\D', '', 'g') = v_digitos
     limit 1;
  end if;

  if p_cita is not null then
    update public.citas set
      llegada_en = now(), estado = 'por_cobrar',
      prioridad = coalesce(p_prioridad, false), motivo_prioridad = nullif(trim(p_motivo_prioridad), ''),
      especialidad = coalesce(especialidad,
        (select nullif(trim(m.especialidad), '') from public.membresias m where m.sistema_id = p_sistema and m.usuario_id = citas.medico_id))
    where id = p_cita and sistema_id = p_sistema and paciente_id = v_pac and estado in ('programada', 'confirmada')
    returning id into v_id;
    if v_id is null then
      raise exception 'No encontramos su cita de hoy. Pase a recepción.' using errcode = 'P0001';
    end if;
  else
    v_esp := coalesce(nullif(trim(p_especialidad), ''),
                      (select nullif(trim(especialidad), '') from public.membresias where sistema_id = p_sistema and usuario_id = p_medico));
    if v_esp is null then
      raise exception 'Elija la especialidad.' using errcode = 'P0001';
    end if;
    if p_medico is not null and not exists (
         select 1 from public.membresias where sistema_id = p_sistema and usuario_id = p_medico and activo and atiende_agenda) then
      raise exception 'Ese médico no está disponible.' using errcode = 'P0001';
    end if;
    insert into public.citas (sistema_id, paciente_id, por_identificar, cedula_llegada, medico_id, inicio, fin, estado, especialidad,
                              llegada_en, prioridad, motivo_prioridad, motivo)
    values (p_sistema, v_pac, v_pac is null, nullif(v_digitos, ''), p_medico, now(), now() + interval '30 minutes', 'por_cobrar', v_esp,
            now(), coalesce(p_prioridad, false), nullif(trim(p_motivo_prioridad), ''), 'Turno del quiosco')
    returning id into v_id;
  end if;

  v_turno := privado.numerar_turno(v_id);
  if not (select s.cobro_antes_consulta from public.sistemas s where s.id = p_sistema) then
    perform privado.activar_turno(v_id);
  end if;

  select * into c from public.citas where id = v_id;
  select count(*) into v_delante from public.citas x
   where x.sistema_id = p_sistema and x.id <> v_id and x.estado in ('por_cobrar', 'en_espera')
     and x.especialidad = c.especialidad and (x.medico_id is null or c.medico_id is null or x.medico_id = c.medico_id)
     and (x.prioridad and not c.prioridad or (x.prioridad = c.prioridad and x.turno_en < c.turno_en));
  select coalesce((select nombre_completo from public.perfiles where id = c.medico_id), c.especialidad) into v_destino;

  return jsonb_build_object('turno', v_turno, 'destino', v_destino, 'especialidad', c.especialidad, 'delante', v_delante,
                            'cobrar', c.estado = 'por_cobrar', 'fecha', c.turno_en);
end;
$$;

-- Limpieza: las fichas provisionales que ya creó el quiosco (sin cobros ni historia).
update public.citas c set paciente_id = null, por_identificar = true, cedula_llegada = nullif(regexp_replace(coalesce(p.documento, ''), '\D', '', 'g'), '')
  from public.pacientes p
 where c.paciente_id = p.id and p.nombres = 'Paciente nuevo' and p.apellidos = 'Por registrar'
   and p.notas = 'Tomó turno en el quiosco: completar sus datos.';
delete from public.pacientes p
 where p.nombres = 'Paciente nuevo' and p.apellidos = 'Por registrar' and p.notas = 'Tomó turno en el quiosco: completar sus datos.'
   and not exists (select 1 from public.citas c where c.paciente_id = p.id)
   and not exists (select 1 from public.cobros c where c.paciente_id = p.id);

revoke all on function privado.identificar_cita(uuid, uuid) from public, anon, authenticated;
revoke all on function public.identificar_turno(uuid, uuid) from public, anon;
grant execute on function public.identificar_turno(uuid, uuid) to authenticated;
