-- Aplicada en producción el 7/10/2026 desde otra máquina sin subirla al repo; texto recuperado
-- de supabase_migrations.schema_migrations el 9/10/2026.
-- La pantalla filtra los médicos por especialidad exacta; para cobros sin cita
-- se devolvía la descripción del servicio y el selector quedaba vacío.
-- Ahora la especialidad solo viene de la cita (null sin cita = todos los médicos).
create or replace function public.cobros_sin_medico(p_sistema uuid, p_desde date, p_hasta date)
 returns table(cobro_id uuid, numero text, creado_en timestamp with time zone, paciente text, especialidad text, turno text, total numeric)
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
begin
  if not privado.tiene_rol(p_sistema, '{admin,caja,gerencia,contabilidad,auditor}', 'caja') then
    raise exception 'Sin permiso.' using errcode = '42501';
  end if;
  return query
    select co.id, co.numero, co.creado_en,
           trim(coalesce(p.nombres, '') || ' ' || coalesce(p.apellidos, '')),
           ci.especialidad,
           ci.turno, co.total
      from public.cobros co
      left join public.citas ci on ci.id = co.cita_id
      left join public.pacientes p on p.id = co.paciente_id
     where co.sistema_id = p_sistema and co.profesional_id is null
       and (co.creado_en at time zone 'America/Santo_Domingo')::date between p_desde and p_hasta
       and not exists (select 1 from public.anulaciones_cobro a where a.cobro_id = co.id)
       and (co.cita_id is not null
            or exists (select 1 from public.cobro_detalles d
                        where d.cobro_id = co.id
                          and d.categoria in ('consulta','procedimiento','imagen','laboratorio')))
     order by co.creado_en desc
     limit 500;
end;
$function$;
