-- ============================================================================
-- MEDORA · Quiosco de turnos y pantalla de llamados
--
-- 1. El número de turno se da AL LLEGAR (recepción o quiosco), no al pagar: el
--    paciente sale con su número, caja lo llama por él, y tras pagar entra a la
--    cola del médico en el orden en que llegó (turno_en = hora de llegada).
-- 2. Rol "quiosco": la cuenta de la pantalla táctil. No ve pacientes, citas ni
--    nada por RLS; solo usa estas RPC (security definer, validan el rol):
--      quiosco_opciones  especialidades y médicos que atienden hoy
--      quiosco_buscar    por cédula: primer nombre y su cita de hoy, nada más
--      quiosco_tomar_turno  registra la llegada (o un paciente provisional) y numera
-- 3. pantalla_llamados: lo que muestra la TV de la sala (turno y consultorio, sin
--    nombres de pacientes). Cualquier miembro del sistema, incluido el quiosco.
-- ============================================================================

-- El quiosco nunca ve el sistema completo.
create or replace function privado.sistemas_vista_completa()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.sistema_id
  from public.membresias m
  join public.sistemas s on s.id = m.sistema_id
  join public.perfiles p on p.id = m.usuario_id
  where m.usuario_id = (select auth.uid()) and m.activo and s.activo and p.activo
    and (p.es_superadmin or not privado.en_mantenimiento())
    and not (m.roles <@ '{medico,psicologia,nutricion,terapia,quiosco}'::public.rol_sistema[]);
$$;

-- ---------------------------------------------------------------------------
-- Numeración al llegar
-- ---------------------------------------------------------------------------
create or replace function privado.numerar_turno(p_cita uuid)
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
  update public.citas set turno = v_turno, turno_en = now(), llegada_en = coalesce(llegada_en, now()) where id = p_cita;
  return v_turno;
end;
$$;

-- Pagó (o fue exonerado): entra a la cola conservando su hora de llegada.
create or replace function privado.activar_turno(p_cita uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno text := privado.numerar_turno(p_cita);
begin
  update public.citas set estado = 'en_espera'
   where id = p_cita and estado in ('por_cobrar', 'programada', 'confirmada');
  return v_turno;
end;
$$;

do $$
declare
  v_def text := pg_get_functiondef('public.registrar_llegada'::regproc);
  v_nueva text;
begin
  v_nueva := replace(v_def,
    '  if not (select s.cobro_antes_consulta from public.sistemas s where s.id = p_sistema) then',
    '  v_turno := privado.numerar_turno(v_id);' || E'\n' ||
    '  if not (select s.cobro_antes_consulta from public.sistemas s where s.id = p_sistema) then');
  if v_nueva = v_def then
    raise exception 'registrar_llegada no tiene el formato esperado.';
  end if;
  execute v_nueva;
end;
$$;

-- ---------------------------------------------------------------------------
-- Quiosco
-- ---------------------------------------------------------------------------
create or replace function privado.puede_quiosco(p_sistema uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select privado.tiene_rol(p_sistema, '{quiosco,admin,recepcion}');
$$;

create or replace function public.quiosco_opciones(p_sistema uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not privado.puede_quiosco(p_sistema) then
    raise exception 'Este equipo no está autorizado como quiosco.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('especialidad', x.esp, 'prefijo', privado.prefijo_turno(x.esp), 'medicos', x.medicos,
             'en_espera', (select count(*) from public.citas c
                            where c.sistema_id = p_sistema and c.estado in ('por_cobrar', 'en_espera') and c.especialidad = x.esp
                              and (c.inicio at time zone 'America/Santo_Domingo')::date = (now() at time zone 'America/Santo_Domingo')::date))
           order by x.esp)
      from (
        select nullif(trim(m.especialidad), '') as esp,
               jsonb_agg(jsonb_build_object('id', m.usuario_id, 'nombre', p.nombre_completo) order by p.nombre_completo) as medicos
          from public.membresias m join public.perfiles p on p.id = m.usuario_id
         where m.sistema_id = p_sistema and m.activo and p.activo and m.atiende_agenda
           and m.roles && '{medico,psicologia,nutricion,terapia}'::public.rol_sistema[]
           and nullif(trim(m.especialidad), '') is not null
         group by nullif(trim(m.especialidad), '')
      ) x
  ), '[]'::jsonb);
end;
$$;

-- Por cédula: solo el primer nombre (para saludar) y su cita de hoy si la tiene.
create or replace function public.quiosco_buscar(p_sistema uuid, p_cedula text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_digitos text := regexp_replace(coalesce(p_cedula, ''), '\D', '', 'g');
  v_pac public.pacientes;
  v_cita jsonb;
begin
  if not privado.puede_quiosco(p_sistema) then
    raise exception 'Este equipo no está autorizado como quiosco.' using errcode = '42501';
  end if;
  if length(v_digitos) < 6 then
    return null;
  end if;
  select * into v_pac from public.pacientes
   where sistema_id = p_sistema and eliminado_en is null and regexp_replace(coalesce(documento, ''), '\D', '', 'g') = v_digitos
   limit 1;
  if v_pac.id is null then
    return null;
  end if;
  select jsonb_build_object('id', c.id, 'inicio', c.inicio, 'medico', p.nombre_completo,
                            'especialidad', coalesce(c.especialidad, nullif(trim(m.especialidad), '')))
    into v_cita
    from public.citas c
    left join public.perfiles p on p.id = c.medico_id
    left join public.membresias m on m.sistema_id = c.sistema_id and m.usuario_id = c.medico_id
   where c.sistema_id = p_sistema and c.paciente_id = v_pac.id and c.estado in ('programada', 'confirmada')
     and (c.inicio at time zone 'America/Santo_Domingo')::date = (now() at time zone 'America/Santo_Domingo')::date
   order by c.inicio
   limit 1;
  return jsonb_build_object('paciente_id', v_pac.id, 'nombre', initcap(split_part(trim(v_pac.nombres), ' ', 1)), 'cita', v_cita);
end;
$$;

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

  -- Si la cédula ya está registrada se usa esa ficha (nunca duplicar pacientes).
  if v_pac is null and length(v_digitos) >= 6 then
    select id into v_pac from public.pacientes
     where sistema_id = p_sistema and eliminado_en is null and regexp_replace(coalesce(documento, ''), '\D', '', 'g') = v_digitos
     limit 1;
  end if;
  -- Sin registrar: ficha provisional que caja o recepción completan.
  if v_pac is null then
    insert into public.pacientes (sistema_id, expediente, nombres, apellidos, documento_tipo, documento, notas)
    values (p_sistema, '', 'Paciente nuevo', 'Por registrar',
            case when length(v_digitos) = 11 then 'cedula' else 'otro' end,
            nullif(v_digitos, ''),
            'Tomó turno en el quiosco: completar sus datos.')
    returning id into v_pac;
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
    insert into public.citas (sistema_id, paciente_id, medico_id, inicio, fin, estado, especialidad, llegada_en,
                              prioridad, motivo_prioridad, motivo)
    values (p_sistema, v_pac, p_medico, now(), now() + interval '30 minutes', 'por_cobrar', v_esp, now(),
            coalesce(p_prioridad, false), nullif(trim(p_motivo_prioridad), ''), 'Turno del quiosco')
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

-- ---------------------------------------------------------------------------
-- Pantalla de la sala: últimos llamados (sin nombres) y cuántos esperan
-- ---------------------------------------------------------------------------
create or replace function public.pantalla_llamados(p_sistema uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoy date := (now() at time zone 'America/Santo_Domingo')::date;
begin
  if p_sistema not in (select privado.mis_sistemas()) then
    raise exception 'Sin acceso.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'llamados', coalesce((
      select jsonb_agg(x order by x.llamado_en desc) from (
        select c.id, c.turno, c.estado, c.llamado_en, c.llamado_veces, m.consultorio,
               p.nombre_completo as medico, c.especialidad
          from public.citas c
          left join public.membresias m on m.sistema_id = c.sistema_id and m.usuario_id = c.medico_id
          left join public.perfiles p on p.id = c.medico_id
         where c.sistema_id = p_sistema and c.estado in ('llamado', 'en_consulta') and c.llamado_en is not null
           and (c.llamado_en at time zone 'America/Santo_Domingo')::date = v_hoy
         order by c.llamado_en desc
         limit 8) x), '[]'::jsonb),
    'espera', coalesce((
      select jsonb_agg(jsonb_build_object('especialidad', especialidad, 'cantidad', n, 'siguiente', siguiente) order by especialidad) from (
        select c.especialidad, count(*) as n, (array_agg(c.turno order by c.prioridad desc, c.turno_en))[1] as siguiente
          from public.citas c
         where c.sistema_id = p_sistema and c.estado = 'en_espera' and c.especialidad is not null
           and (c.inicio at time zone 'America/Santo_Domingo')::date = v_hoy
         group by c.especialidad) y), '[]'::jsonb));
end;
$$;

revoke all on function privado.numerar_turno(uuid) from public, anon, authenticated;
revoke all on function privado.puede_quiosco(uuid) from public, anon, authenticated;
revoke all on function public.quiosco_opciones(uuid) from public, anon;
revoke all on function public.quiosco_buscar(uuid, text) from public, anon;
revoke all on function public.quiosco_tomar_turno(uuid, uuid, text, uuid, uuid, text, boolean, text) from public, anon;
revoke all on function public.pantalla_llamados(uuid) from public, anon;
grant execute on function public.quiosco_opciones(uuid) to authenticated;
grant execute on function public.quiosco_buscar(uuid, text) to authenticated;
grant execute on function public.quiosco_tomar_turno(uuid, uuid, text, uuid, uuid, text, boolean, text) to authenticated;
grant execute on function public.pantalla_llamados(uuid) to authenticated;
