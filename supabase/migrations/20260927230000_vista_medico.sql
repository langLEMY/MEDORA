-- ============================================================================
-- MEDORA · Vista del médico: cada profesional ve solo sus citas y sus pacientes
--
-- Quien en un sistema tiene SOLO roles clínicos de consulta (medico, psicologia,
-- nutricion, terapia) ve únicamente:
--   · citas donde es el médico,
--   · pacientes con cita suya, con notas suyas en la historia o creados por él,
--   · la historia clínica, anexos y despachos de inventario de esos pacientes
--     (la historia completa, de todos los autores; psicología sigue confidencial).
-- Con cualquier otro rol (admin, recepción, enfermería, caja, gerencia,
-- auditor…) la vista es completa, como hasta ahora. Se aplica en RLS: la UI solo
-- lo refleja (privacidad de datos de salud, Ley 172-13).
-- ============================================================================

-- Sistemas donde veo todo (tengo algún rol que no es solo de consulta).
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
    and not (m.roles <@ '{medico,psicologia,nutricion,terapia}'::public.rol_sistema[]);
$$;

-- Pacientes que atiendo o atendí (por cita o por nota en la historia).
create or replace function privado.mis_pacientes()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.paciente_id from public.citas c where c.medico_id = (select auth.uid())
  union
  select h.paciente_id from public.historial_clinico h where h.autor_id = (select auth.uid());
$$;

revoke all on function privado.sistemas_vista_completa() from public, anon;
revoke all on function privado.mis_pacientes() from public, anon;
grant execute on function privado.sistemas_vista_completa() to authenticated;
grant execute on function privado.mis_pacientes() to authenticated;

create index if not exists ix_citas_medico_paciente on public.citas (medico_id, paciente_id);
create index if not exists ix_historial_autor_paciente on public.historial_clinico (autor_id, paciente_id);

-- Agrega la restricción a las políticas existentes sin reescribirlas.
do $$
declare
  r record;
  v_extra text;
  v_sql text;
  c_completa constant text := 'sistema_id in (select privado.sistemas_vista_completa())';
  c_mios constant text := 'paciente_id in (select privado.mis_pacientes())';
begin
  for r in
    select c.relname as tabla, n.nspname as esquema, p.polname,
           pg_get_expr(p.polqual, p.polrelid) as usando, pg_get_expr(p.polwithcheck, p.polrelid) as chequeo
      from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace
     where (n.nspname, c.relname, p.polname) in (
       ('public', 'citas', 'citas_select'),
       ('public', 'pacientes', 'pacientes_select'),
       ('public', 'historial_clinico', 'historial_select'),
       ('public', 'historial_clinico', 'historial_insert'),
       ('public', 'movimientos_inventario', 'mov_inventario_select'),
       ('storage', 'objects', 'anexos_select'),
       ('storage', 'objects', 'anexos_insert'))
  loop
    v_extra := case r.polname
      when 'citas_select' then c_completa || ' or medico_id = (select auth.uid())'
      when 'pacientes_select' then c_completa || ' or creado_por = (select auth.uid()) or id in (select privado.mis_pacientes())'
      when 'historial_select' then c_completa || ' or ' || c_mios
      when 'historial_insert' then c_completa || ' or ' || c_mios
      when 'mov_inventario_select' then c_completa || ' or paciente_id is null or ' || c_mios
      else -- anexos: {sistema_id}/{paciente_id}/archivo
        '(storage.foldername(name))[1] in (select s::text from privado.sistemas_vista_completa() s)'
        || ' or (storage.foldername(name))[2] in (select x::text from privado.mis_pacientes() x)'
    end;
    if r.usando is not null and position('mis_pacientes' in r.usando) = 0 then
      v_sql := format('alter policy %I on %I.%I using ((%s) and (%s))', r.polname, r.esquema, r.tabla, r.usando, v_extra);
      execute v_sql;
    end if;
    if r.chequeo is not null and position('mis_pacientes' in r.chequeo) = 0 then
      v_sql := format('alter policy %I on %I.%I with check ((%s) and (%s))', r.polname, r.esquema, r.tabla, r.chequeo, v_extra);
      execute v_sql;
    end if;
  end loop;
end;
$$;
