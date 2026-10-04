-- ============================================================================
-- MEDORA . Resultados de laboratorio recibidos por integración
--
-- El laboratorio (externo o propio) envía los resultados a la Edge Function
-- "laboratorio" con el token del hospital. Cada envío queda aquí:
--   - Si la cédula o el expediente coinciden con un paciente, se asigna solo.
--   - Si no, queda "recibido" en la bandeja para que alguien lo asigne.
-- Es contenido clínico: lo ven los roles clínicos (mismas reglas que el
-- historial, incluida la vista del médico) y se audita sin volcar datos.
-- No se borra; asignar es la única modificación (por RPC).
-- ============================================================================

create table public.resultados_laboratorio (
  id               uuid primary key default gen_random_uuid(),
  sistema_id       uuid not null references public.sistemas(id) on delete restrict,
  paciente_id      uuid,
  laboratorio      text not null,
  identificacion   text,
  nombre_paciente  text,
  orden            text,
  fecha_resultado  timestamptz,
  resultados       jsonb not null default '[]' check (jsonb_typeof(resultados) = 'array'),
  observaciones    text,
  pdf_ruta         text,
  estado           text not null default 'recibido' check (estado in ('recibido', 'asignado')),
  recibido_en      timestamptz not null default now(),
  asignado_por     uuid,
  asignado_en      timestamptz,
  unique (sistema_id, id),
  foreign key (sistema_id, paciente_id) references public.pacientes (sistema_id, id),
  check ((estado = 'asignado') = (paciente_id is not null))
);
create index ix_resultados_lab_paciente on public.resultados_laboratorio (sistema_id, paciente_id, fecha_resultado desc);
create index ix_resultados_lab_bandeja on public.resultados_laboratorio (sistema_id, recibido_en desc) where estado = 'recibido';
create unique index ux_resultados_lab_orden on public.resultados_laboratorio (sistema_id, laboratorio, orden) where orden is not null;

create trigger trg_resultados_laboratorio_auditoria after insert or update or delete on public.resultados_laboratorio
  for each row execute function privado.tg_auditar('sin_datos');

-- Solo se puede pasar de "recibido" a "asignado" (y una sola vez); nada se borra.
create or replace function privado.tg_resultado_lab_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if privado.eliminando_sistema(old.sistema_id) then
      return old;
    end if;
    raise exception 'Los resultados de laboratorio no se borran.' using errcode = '42501';
  end if;
  if old.estado <> 'recibido' or new.estado <> 'asignado'
     or (to_jsonb(new) - '{paciente_id,estado,asignado_por,asignado_en}'::text[])
        is distinct from (to_jsonb(old) - '{paciente_id,estado,asignado_por,asignado_en}'::text[]) then
    raise exception 'Un resultado de laboratorio solo se puede asignar a un paciente, una vez.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger trg_resultados_laboratorio_inmutable before update or delete on public.resultados_laboratorio
  for each row execute function privado.tg_resultado_lab_inmutable();

alter table public.resultados_laboratorio enable row level security;
revoke all on public.resultados_laboratorio from anon, authenticated;
grant select on public.resultados_laboratorio to authenticated;
-- Asignados: como el historial clínico. Sin asignar: solo quien tiene vista completa.
create policy resultados_laboratorio_select on public.resultados_laboratorio for select to authenticated
  using (
    sistema_id in (select privado.mis_sistemas_con_rol('{medico,enfermeria,auditor,psicologia,nutricion,terapia}', 'historial'))
    and (sistema_id in (select privado.sistemas_vista_completa()) or paciente_id in (select privado.mis_pacientes()))
  );

create or replace function public.asignar_resultado_laboratorio(p_resultado uuid, p_paciente uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.resultados_laboratorio;
begin
  select * into r from public.resultados_laboratorio where id = p_resultado for update;
  if r.id is null or not privado.tiene_rol(r.sistema_id, '{medico,enfermeria}', 'historial')
     or r.sistema_id not in (select privado.sistemas_vista_completa()) then
    raise exception 'Resultado no encontrado o sin permiso.' using errcode = '42501';
  end if;
  if r.estado <> 'recibido' then
    raise exception 'Ese resultado ya está asignado.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.pacientes where id = p_paciente and sistema_id = r.sistema_id and eliminado_en is null) then
    raise exception 'Paciente no encontrado.' using errcode = 'P0001';
  end if;
  update public.resultados_laboratorio
     set paciente_id = p_paciente, estado = 'asignado', asignado_por = auth.uid(), asignado_en = now()
   where id = p_resultado;
end;
$$;
revoke all on function public.asignar_resultado_laboratorio(uuid, uuid) from public, anon;
grant execute on function public.asignar_resultado_laboratorio(uuid, uuid) to authenticated;
