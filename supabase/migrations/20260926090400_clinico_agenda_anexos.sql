-- ============================================================================
-- MEDORA · 0013 · Agenda para todos los profesionales, historia clínica
-- especializada (nutrición, anestesia, psicología) y anexos
-- ============================================================================

-- Quién aparece como columna en la agenda: cualquier profesional (médico,
-- psicología, nutrición, terapia…), no solo el rol "medico".
alter table public.membresias add column atiende_agenda boolean not null default false;
update public.membresias set atiende_agenda = true
 where roles && '{medico,psicologia,nutricion,terapia}'::public.rol_sistema[];

-- Citas: además de recepción/enfermería/médicos, agendan gerencia y los
-- demás profesionales. Contabilidad la ve (lectura para todo miembro).
drop policy citas_insert on public.citas;
drop policy citas_update on public.citas;
create policy citas_insert on public.citas for insert to authenticated
  with check (sistema_id in (select privado.mis_sistemas_con_rol('{admin,medico,enfermeria,recepcion,gerencia,psicologia,nutricion,terapia}')));
create policy citas_update on public.citas for update to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{admin,medico,enfermeria,recepcion,gerencia,psicologia,nutricion,terapia}')))
  with check (sistema_id in (select privado.mis_sistemas_con_rol('{admin,medico,enfermeria,recepcion,gerencia,psicologia,nutricion,terapia}')));

drop policy pacientes_insert on public.pacientes;
drop policy pacientes_update on public.pacientes;
create policy pacientes_insert on public.pacientes for insert to authenticated
  with check (sistema_id in (select privado.mis_sistemas_con_rol('{admin,medico,enfermeria,recepcion,caja,psicologia,nutricion,terapia}')));
create policy pacientes_update on public.pacientes for update to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{admin,medico,enfermeria,recepcion,caja,psicologia,nutricion,terapia}')))
  with check (sistema_id in (select privado.mis_sistemas_con_rol('{admin,medico,enfermeria,recepcion,caja,psicologia,nutricion,terapia}')));

-- Historia clínica: todos los profesionales de la salud. Las notas de
-- psicología son confidenciales: solo las ve psicología (y su autor).
drop policy historial_select on public.historial_clinico;
drop policy historial_insert on public.historial_clinico;
create policy historial_select on public.historial_clinico for select to authenticated
  using (
    sistema_id in (select privado.mis_sistemas_con_rol('{medico,enfermeria,auditor,psicologia,nutricion,terapia}'))
    and (
      tipo <> 'psicologia'
      or autor_id = (select auth.uid())
      or sistema_id in (select privado.mis_sistemas_con_rol('{psicologia}'))
    )
  );
create policy historial_insert on public.historial_clinico for insert to authenticated
  with check (
    sistema_id in (select privado.mis_sistemas_con_rol('{medico,enfermeria,psicologia,nutricion,terapia}'))
    and autor_id = (select auth.uid())
  );

-- Auditoría: gerencia también la consulta.
drop policy auditoria_select on public.auditoria;
create policy auditoria_select on public.auditoria for select to authenticated
  using (
    sistema_id in (select privado.mis_sistemas_con_rol('{admin,auditor,gerencia}'))
    or (select privado.es_superadmin())
  );

-- Anexos (PDF, imágenes) de la historia clínica ---------------------------
-- Ruta: {sistema_id}/{paciente_id}/{uuid}-{nombre}. Privados; se descargan con
-- URL firmada. Sin UPDATE/DELETE: igual que la historia, son permanentes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('anexos-clinicos', 'anexos-clinicos', false, 20971520,
        array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'application/dicom'])
on conflict (id) do nothing;

create policy anexos_select on storage.objects for select to authenticated
  using (
    bucket_id = 'anexos-clinicos'
    and (storage.foldername(name))[1] in (
      select s::text from privado.mis_sistemas_con_rol('{medico,enfermeria,auditor,psicologia,nutricion,terapia}') s
    )
  );
create policy anexos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'anexos-clinicos'
    and (storage.foldername(name))[1] in (
      select s::text from privado.mis_sistemas_con_rol('{medico,enfermeria,psicologia,nutricion,terapia}') s
    )
  );
