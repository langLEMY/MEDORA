-- ============================================================================
-- MEDORA · República Dominicana
--
-- MEDORA opera solo en RD: peso dominicano, hora de Santo Domingo y los
-- documentos de identidad de la JCE y la DGII.
-- - sistemas.moneda / zona_horaria quedan fijos (DOP, America/Santo_Domingo).
--   Las columnas se conservan porque las lee mis_sistemas() y el panel.
-- - Cédula: 11 dígitos, guardada como 000-0000000-0.
-- - RNC (DGII): 9 dígitos, u 11 cuando es la cédula de una persona física;
--   guardado solo con dígitos.
-- Los datos anteriores inválidos no se tocan (p. ej. los migrados de FUNBIDE):
-- la validación corre al insertar o al cambiar el documento.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Moneda y zona horaria
-- ---------------------------------------------------------------------------
update public.sistemas set moneda = 'DOP' where moneda <> 'DOP';
update public.sistemas set zona_horaria = 'America/Santo_Domingo' where zona_horaria <> 'America/Santo_Domingo';

alter table public.sistemas drop constraint if exists sistemas_moneda_check;
alter table public.sistemas
  add constraint sistemas_moneda_dop check (moneda = 'DOP'),
  add constraint sistemas_zona_horaria_rd check (zona_horaria = 'America/Santo_Domingo');

comment on column public.sistemas.moneda is 'Siempre DOP (peso dominicano).';
comment on column public.sistemas.zona_horaria is 'Siempre America/Santo_Domingo.';

-- ---------------------------------------------------------------------------
-- Cédula y RNC
-- ---------------------------------------------------------------------------
create or replace function privado.cedula_formateada(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when length(d) = 11 then substr(d, 1, 3) || '-' || substr(d, 4, 7) || '-' || substr(d, 11, 1) end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') d) x;
$$;

create or replace function privado.rnc_normalizado(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when length(d) in (9, 11) then d end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') d) x;
$$;

-- tg_argv[0] = columna, tg_argv[1] = 'cedula' | 'rnc'.
-- En pacientes solo aplica cuando documento_tipo = 'cedula' (pasaportes y
-- documentos de extranjeros se guardan tal cual).
create or replace function privado.tg_identificacion_rd()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_col  text := tg_argv[0];
  v_tipo text := tg_argv[1];
  v_fila jsonb := to_jsonb(new);
  v      text := nullif(trim(v_fila ->> v_col), '');
  v_norm text;
begin
  if tg_op = 'UPDATE'
     and (to_jsonb(old) ->> v_col) is not distinct from (v_fila ->> v_col)
     and (to_jsonb(old) ->> 'documento_tipo') is not distinct from (v_fila ->> 'documento_tipo') then
    return new;
  end if;
  if v is null or (tg_table_name = 'pacientes' and v_fila ->> 'documento_tipo' <> 'cedula') then
    return jsonb_populate_record(new, jsonb_build_object(v_col, v));
  end if;

  if v_tipo = 'cedula' then
    v_norm := privado.cedula_formateada(v);
    if v_norm is null then
      raise exception 'La cédula "%" no es válida: debe tener 11 dígitos (000-0000000-0).', v using errcode = 'P0001';
    end if;
  else
    v_norm := privado.rnc_normalizado(v);
    if v_norm is null then
      raise exception 'El RNC "%" no es válido: debe tener 9 dígitos, u 11 si es una cédula.', v using errcode = 'P0001';
    end if;
  end if;
  return jsonb_populate_record(new, jsonb_build_object(v_col, v_norm));
end;
$$;
revoke all on function privado.tg_identificacion_rd() from public, anon, authenticated;
revoke all on function privado.cedula_formateada(text) from public, anon;
revoke all on function privado.rnc_normalizado(text) from public, anon;

-- Normaliza lo existente que ya es válido, sin chocar con los índices únicos
-- (si dos filas quedarían iguales, solo se normaliza la primera).
with c as (
  select p.id, privado.cedula_formateada(p.documento) nuevo,
         row_number() over (partition by p.sistema_id, privado.cedula_formateada(p.documento) order by p.creado_en) n
    from public.pacientes p
   where p.documento_tipo = 'cedula' and p.eliminado_en is null
     and privado.cedula_formateada(p.documento) is not null
     and p.documento <> privado.cedula_formateada(p.documento)
)
update public.pacientes p set documento = c.nuevo
  from c
 where p.id = c.id and c.n = 1
   and not exists (select 1 from public.pacientes o
                    where o.sistema_id = p.sistema_id and o.documento_tipo = 'cedula'
                      and o.documento = c.nuevo and o.eliminado_en is null);

with c as (
  select e.id, privado.cedula_formateada(e.cedula) nuevo,
         row_number() over (partition by e.sistema_id, privado.cedula_formateada(e.cedula) order by e.creado_en) n
    from public.empleados e
   where privado.cedula_formateada(e.cedula) is not null and e.cedula <> privado.cedula_formateada(e.cedula)
)
update public.empleados e set cedula = c.nuevo
  from c
 where e.id = c.id and c.n = 1
   and not exists (select 1 from public.empleados o where o.sistema_id = e.sistema_id and o.cedula = c.nuevo);

with c as (
  select p.id, privado.rnc_normalizado(p.rnc) nuevo,
         row_number() over (partition by p.sistema_id, privado.rnc_normalizado(p.rnc) order by p.creado_en) n
    from public.proveedores p
   where privado.rnc_normalizado(p.rnc) is not null and p.rnc <> privado.rnc_normalizado(p.rnc)
)
update public.proveedores p set rnc = c.nuevo
  from c
 where p.id = c.id and c.n = 1
   and not exists (select 1 from public.proveedores o where o.sistema_id = p.sistema_id and o.rnc = c.nuevo);

update public.sistemas set rnc = privado.rnc_normalizado(rnc)
 where privado.rnc_normalizado(rnc) is not null and rnc <> privado.rnc_normalizado(rnc);

-- "a_" para que corran antes que los demás BEFORE (orden alfabético).
create trigger trg_a_pacientes_identificacion before insert or update of documento, documento_tipo on public.pacientes
  for each row execute function privado.tg_identificacion_rd('documento', 'cedula');
create trigger trg_a_empleados_identificacion before insert or update of cedula on public.empleados
  for each row execute function privado.tg_identificacion_rd('cedula', 'cedula');
create trigger trg_a_proveedores_identificacion before insert or update of rnc on public.proveedores
  for each row execute function privado.tg_identificacion_rd('rnc', 'rnc');
create trigger trg_a_sistemas_identificacion before insert or update of rnc on public.sistemas
  for each row execute function privado.tg_identificacion_rd('rnc', 'rnc');
-- cobros es append-only: solo se valida al insertar.
create trigger trg_a_cobros_identificacion before insert on public.cobros
  for each row execute function privado.tg_identificacion_rd('cliente_rnc', 'rnc');
