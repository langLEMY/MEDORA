-- ============================================================================
-- MEDORA · Directorio de médicos (para quien agenda y da turnos)
--
-- Por médico: estado ahora (en consulta / llamando / disponible / sin actividad),
-- turno que atiende, pacientes en su cola y en la de su especialidad, atendidos
-- y pendientes de hoy, y su calificación por desempeño de los últimos 30 días:
--   · 50 pts pacientes atendidos (frente al que más atendió en el sistema)
--   · 30 pts espera de sus pacientes (≤ 15 min = 30; ≥ 60 min = 0)
--   · 20 pts consultas cerradas (completadas frente a las que quedaron abiertas)
--   → estrellas = puntos / 20, en medias estrellas (mínimo 1). Con menos de 5
--     atendidos en el período no se califica (null).
-- Solo para quien ve todo el sistema (recepción, admin, enfermería, gerencia…):
-- un médico no ve el directorio ni las calificaciones de sus colegas.
-- ============================================================================
create or replace function public.directorio_medicos(p_sistema uuid)
returns table (
  usuario_id uuid, nombre text, especialidad text, exequatur text, consultorio text,
  estado text, turno_actual text, en_cola int, cola_especialidad int, atendidos_hoy int, pendientes_hoy int,
  atendidos_30d int, espera_promedio int, cierre_pct int, puntos int, estrellas numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoy date := (now() at time zone 'America/Santo_Domingo')::date;
begin
  if p_sistema not in (select privado.sistemas_vista_completa()) then
    raise exception 'No tienes acceso al directorio de médicos.' using errcode = '42501';
  end if;

  return query
  with med as (
    select m.usuario_id, p.nombre_completo, nullif(trim(m.especialidad), '') as esp, m.exequatur, m.consultorio
      from public.membresias m join public.perfiles p on p.id = m.usuario_id
     where m.sistema_id = p_sistema and m.activo and p.activo and m.atiende_agenda
       and m.roles && '{medico,psicologia,nutricion,terapia}'::public.rol_sistema[]
  ),
  hoy as (
    select c.* from public.citas c
     where c.sistema_id = p_sistema and (c.inicio at time zone 'America/Santo_Domingo')::date = v_hoy
  ),
  dia as (
    select m.usuario_id,
           max(h.turno) filter (where h.medico_id = m.usuario_id and h.estado in ('llamado', 'en_consulta')) as turno_actual,
           coalesce(bool_or(h.medico_id = m.usuario_id and h.estado = 'en_consulta'), false) as consultando,
           coalesce(bool_or(h.medico_id = m.usuario_id and h.estado = 'llamado'), false) as llamando,
           count(*) filter (where h.medico_id = m.usuario_id and h.estado = 'en_espera')::int as en_cola,
           count(*) filter (where h.medico_id is null and h.estado = 'en_espera')::int as cola_esp,
           count(*) filter (where h.medico_id = m.usuario_id and h.estado = 'completada')::int as atendidos,
           count(*) filter (where h.medico_id = m.usuario_id and h.estado in ('programada', 'confirmada', 'por_cobrar'))::int as pendientes
      from med m
      left join hoy h on h.medico_id = m.usuario_id or (h.medico_id is null and h.especialidad = m.esp)
     group by m.usuario_id
  ),
  mes as (
    select c.medico_id,
           count(*) filter (where c.estado = 'completada')::int as atendidos,
           avg(extract(epoch from (c.llamado_en - c.turno_en)) / 60)
             filter (where c.llamado_en is not null and c.turno_en is not null and c.llamado_en >= c.turno_en) as espera,
           count(*) filter (where c.estado = 'completada')::numeric
             / nullif(count(*) filter (where c.estado = 'completada'
                        or (c.estado in ('llamado', 'en_consulta') and (c.inicio at time zone 'America/Santo_Domingo')::date < v_hoy)), 0) as cierre
      from public.citas c
     where c.sistema_id = p_sistema and c.medico_id is not null and c.inicio >= now() - interval '30 days'
     group by c.medico_id
  ),
  tope as (select greatest(coalesce(max(atendidos), 0), 1) as maximo from mes),
  calif as (
    select m.usuario_id,
           case when coalesce(x.atendidos, 0) < 5 then null
                else round(50.0 * x.atendidos / t.maximo
                           + 30.0 * greatest(0, least(1, (60 - coalesce(x.espera, 15)) / 45.0))
                           + 20.0 * coalesce(x.cierre, 1))::int
           end as puntos
      from med m cross join tope t left join mes x on x.medico_id = m.usuario_id
  )
  select m.usuario_id, m.nombre_completo, m.esp, m.exequatur, m.consultorio,
         case when d.consultando then 'en_consulta'
              when d.llamando then 'llamando'
              when d.en_cola + d.cola_esp + d.atendidos + d.pendientes > 0 then 'disponible'
              else 'sin_actividad' end,
         d.turno_actual, d.en_cola, d.cola_esp, d.atendidos, d.pendientes,
         coalesce(x.atendidos, 0), round(x.espera)::int, round(100 * x.cierre)::int,
         k.puntos,
         case when k.puntos is null then null else greatest(1, round(k.puntos / 10.0) / 2) end
    from med m
    join dia d on d.usuario_id = m.usuario_id
    join calif k on k.usuario_id = m.usuario_id
    left join mes x on x.medico_id = m.usuario_id
   order by m.esp nulls last, m.nombre_completo;
end;
$$;

revoke all on function public.directorio_medicos(uuid) from public, anon;
grant execute on function public.directorio_medicos(uuid) to authenticated;
