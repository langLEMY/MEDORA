-- La especialidad del personal se escribe a mano: "Medicina  Interna", "Medicina Interna " o "Pediatra"
-- no coincidían con la del servicio ("Medicina interna", "Pediatría") y Caja no mostraba a esos médicos
-- al filtrar por área. Al guardar se limpian los espacios y, si ya existe esa especialidad en los
-- servicios o en otro miembro (sin importar mayúsculas ni tildes), se usa esa misma escritura.

create or replace function privado.clave_especialidad(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(translate(lower(regexp_replace(trim(coalesce(p, '')), '\s+', ' ', 'g')), 'áéíóúüñ', 'aeiouun'), '');
$$;

create or replace function privado.tg_normalizar_especialidad()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clave text := privado.clave_especialidad(new.especialidad);
  v_canon text;
begin
  if v_clave is null then
    new.especialidad := null;
    return new;
  end if;
  select x.e into v_canon
    from (select s.especialidad e, 1 orden from public.servicios s
           where s.sistema_id = new.sistema_id and privado.clave_especialidad(s.especialidad) = v_clave
          union all
          select m.especialidad, 2 from public.membresias m
           where m.sistema_id = new.sistema_id and m.id is distinct from new.id
             and m.especialidad = regexp_replace(trim(m.especialidad), '\s+', ' ', 'g')
             and privado.clave_especialidad(m.especialidad) = v_clave) x
   order by x.orden
   limit 1;
  new.especialidad := coalesce(v_canon, regexp_replace(trim(new.especialidad), '\s+', ' ', 'g'));
  return new;
end;
$$;

revoke all on function privado.tg_normalizar_especialidad() from public, anon, authenticated;

drop trigger if exists trg_membresias_especialidad on public.membresias;
create trigger trg_membresias_especialidad before insert or update of especialidad on public.membresias
  for each row execute function privado.tg_normalizar_especialidad();

-- Los que ya estaban mal escritos (FUNBIDE: Amelfi Ovalles, René Rodríguez, Marianny Trinidad).
update public.membresias set especialidad = especialidad
 where especialidad is distinct from regexp_replace(trim(especialidad), '\s+', ' ', 'g')
    or exists (select 1 from public.servicios s
                where s.sistema_id = membresias.sistema_id and s.especialidad <> membresias.especialidad
                  and privado.clave_especialidad(s.especialidad) = privado.clave_especialidad(membresias.especialidad));

-- "Pediatra" es la misma área que "Pediatría".
update public.membresias m set especialidad = 'Pediatría'
 where privado.clave_especialidad(m.especialidad) = 'pediatra'
   and exists (select 1 from public.servicios s where s.sistema_id = m.sistema_id and s.especialidad = 'Pediatría');
