-- Expediente ampliado (inspirado en los portales clínicos que usan las instituciones del país):
--   1. Tipos nuevos de entrada clínica: formulario (catálogo de formularios estructurados de la app,
--      datos.formulario = clave), vacuna, licencia y consentimiento.
--   2. Cabecera clínica del paciente: hábitos tóxicos, antecedentes, condiciones especiales y médico de cabecera.
--   3. Órdenes médicas con estado por prueba (pendiente / entregada / cancelada). Cada orden también
--      queda en la historia clínica (tipo 'orden'); el estado vive en orden_items y se cambia solo por RPC.
--      Si llega un resultado de laboratorio con el número de la orden, sus pruebas pasan a "entregada".
--   4. checkout_consulta(): cierra la consulta (nota de egreso + cita completada) en una sola transacción.

-- 1 ─────────────────────────────────────────────────────────────────────────────
alter type public.tipo_entrada_clinica add value if not exists 'formulario';
alter type public.tipo_entrada_clinica add value if not exists 'vacuna';
alter type public.tipo_entrada_clinica add value if not exists 'licencia';
alter type public.tipo_entrada_clinica add value if not exists 'consentimiento';

-- 2 ─────────────────────────────────────────────────────────────────────────────
alter table public.pacientes
  add column if not exists habitos jsonb not null default '{}'::jsonb,
  add column if not exists antecedentes jsonb not null default '{}'::jsonb,
  add column if not exists condiciones_especiales text[] not null default '{}',
  add column if not exists medico_cabecera_id uuid references public.perfiles (id) on delete set null;

alter table public.pacientes drop constraint if exists pacientes_habitos_objeto;
alter table public.pacientes add constraint pacientes_habitos_objeto check (jsonb_typeof(habitos) = 'object');
alter table public.pacientes drop constraint if exists pacientes_antecedentes_objeto;
alter table public.pacientes add constraint pacientes_antecedentes_objeto check (jsonb_typeof(antecedentes) = 'object');
alter table public.pacientes drop constraint if exists pacientes_condiciones_especiales_validas;
alter table public.pacientes add constraint pacientes_condiciones_especiales_validas check (
  condiciones_especiales <@ array['embarazo', 'lactancia', 'discapacidad', 'movilidad_reducida', 'inmunosuprimido',
                                  'dialisis', 'anticoagulado', 'diabetico', 'hipertenso', 'marcapasos']::text[]
);

create index if not exists ix_pacientes_medico_cabecera on public.pacientes (medico_cabecera_id) where medico_cabecera_id is not null;

-- 3 ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.ordenes_medicas (
  id           uuid primary key default gen_random_uuid(),
  sistema_id   uuid not null references public.sistemas (id) on delete restrict,
  paciente_id  uuid not null,
  cita_id      uuid,
  numero       text not null,
  tipo         text not null check (tipo in ('laboratorio', 'imagen', 'procedimiento', 'otro')),
  proveedor    text check (char_length(proveedor) <= 150),
  diagnostico  text check (char_length(diagnostico) <= 500),
  indicaciones text check (char_length(indicaciones) <= 4000),
  medico_id    uuid not null references public.perfiles (id),
  creado_en    timestamptz not null default now(),
  unique (sistema_id, id),
  unique (sistema_id, numero),
  foreign key (sistema_id, paciente_id) references public.pacientes (sistema_id, id),
  foreign key (sistema_id, cita_id) references public.citas (sistema_id, id)
);
create index if not exists ix_ordenes_medicas_paciente on public.ordenes_medicas (sistema_id, paciente_id, creado_en desc);
create index if not exists ix_ordenes_medicas_medico on public.ordenes_medicas (medico_id);
create index if not exists ix_ordenes_medicas_cita on public.ordenes_medicas (sistema_id, cita_id) where cita_id is not null;

create table if not exists public.orden_items (
  id              uuid primary key default gen_random_uuid(),
  sistema_id      uuid not null references public.sistemas (id) on delete restrict,
  orden_id        uuid not null,
  posicion        smallint not null,
  descripcion     text not null check (char_length(descripcion) between 1 and 200),
  estado          text not null default 'pendiente' check (estado in ('pendiente', 'entregada', 'cancelada')),
  actualizado_en  timestamptz,
  actualizado_por uuid references public.perfiles (id),
  foreign key (sistema_id, orden_id) references public.ordenes_medicas (sistema_id, id)
);
create index if not exists ix_orden_items_orden on public.orden_items (sistema_id, orden_id, posicion);
create index if not exists ix_orden_items_actualizado_por on public.orden_items (actualizado_por) where actualizado_por is not null;

alter table public.ordenes_medicas enable row level security;
alter table public.orden_items enable row level security;

-- Lectura: los mismos que leen la historia clínica (incluida la vista del médico: solo sus pacientes).
drop policy if exists ordenes_medicas_select on public.ordenes_medicas;
create policy ordenes_medicas_select on public.ordenes_medicas for select to authenticated using (
  sistema_id in (select privado.mis_sistemas_con_rol('{medico,enfermeria,auditor,psicologia,nutricion,terapia}'::public.rol_sistema[], 'historial'))
  and (sistema_id in (select privado.sistemas_vista_completa()) or paciente_id in (select privado.mis_pacientes()))
);
drop policy if exists orden_items_select on public.orden_items;
create policy orden_items_select on public.orden_items for select to authenticated using (
  sistema_id in (select privado.mis_sistemas_con_rol('{medico,enfermeria,auditor,psicologia,nutricion,terapia}'::public.rol_sistema[], 'historial'))
  and orden_id in (select o.id from public.ordenes_medicas o)
);

-- Nadie escribe directo: solo las RPC de abajo.
revoke all on public.ordenes_medicas from anon, authenticated;
revoke all on public.orden_items from anon, authenticated;
grant select on public.ordenes_medicas to authenticated;
grant select on public.orden_items to authenticated;

-- La orden es inmutable; sus renglones solo cambian de estado y nunca se borran.
drop trigger if exists trg_ordenes_medicas_append_only on public.ordenes_medicas;
create trigger trg_ordenes_medicas_append_only before update or delete on public.ordenes_medicas
  for each row execute function privado.tg_bloquear_append_only();

create or replace function privado.tg_orden_item_solo_estado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if privado.eliminando_sistema(old.sistema_id) then
      return old;
    end if;
    raise exception 'Las pruebas de una orden no se borran: se cancelan.' using errcode = '42501';
  end if;
  if new.sistema_id <> old.sistema_id or new.orden_id <> old.orden_id
     or new.posicion <> old.posicion or new.descripcion <> old.descripcion then
    raise exception 'De una prueba ordenada solo puede cambiar su estado.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orden_items_solo_estado on public.orden_items;
create trigger trg_orden_items_solo_estado before update or delete on public.orden_items
  for each row execute function privado.tg_orden_item_solo_estado();

drop trigger if exists trg_ordenes_medicas_auditoria on public.ordenes_medicas;
create trigger trg_ordenes_medicas_auditoria after insert or update or delete on public.ordenes_medicas
  for each row execute function privado.tg_auditar('sin_datos');
drop trigger if exists trg_orden_items_auditoria on public.orden_items;
create trigger trg_orden_items_auditoria after insert or update or delete on public.orden_items
  for each row execute function privado.tg_auditar('sin_datos');

-- Crea la orden, sus pruebas y su entrada en la historia clínica.
create or replace function public.crear_orden_medica(
  p_sistema      uuid,
  p_paciente     uuid,
  p_tipo         text,
  p_items        text[],
  p_proveedor    text default null,
  p_diagnostico  text default null,
  p_indicaciones text default null,
  p_cita         uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_items  text[];
  v_id     uuid;
  v_numero text;
  v_medico jsonb;
  v_titulo text;
begin
  if not privado.tiene_rol(p_sistema, '{medico}'::public.rol_sistema[], 'historial') then
    raise exception 'Solo un médico puede emitir órdenes médicas.' using errcode = '42501';
  end if;
  if not (p_sistema in (select privado.sistemas_vista_completa()) or p_paciente in (select privado.mis_pacientes())) then
    raise exception 'No tienes acceso a este paciente.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.pacientes where sistema_id = p_sistema and id = p_paciente and eliminado_en is null) then
    raise exception 'El paciente no existe.' using errcode = 'P0002';
  end if;
  if p_tipo not in ('laboratorio', 'imagen', 'procedimiento', 'otro') then
    raise exception 'Tipo de orden inválido.' using errcode = '22023';
  end if;
  if p_cita is not null and not exists (select 1 from public.citas where sistema_id = p_sistema and id = p_cita and paciente_id = p_paciente) then
    raise exception 'La cita no corresponde al paciente.' using errcode = '22023';
  end if;

  select coalesce(array_agg(x order by o), '{}')
    into v_items
    from (select left(trim(x), 200) x, min(o) o
            from unnest(coalesce(p_items, '{}')) with ordinality as t (x, o)
           where trim(coalesce(x, '')) <> ''
           group by left(trim(x), 200)) s;
  if cardinality(v_items) = 0 then
    raise exception 'La orden necesita al menos una prueba o estudio.' using errcode = '22023';
  end if;
  if cardinality(v_items) > 60 then
    raise exception 'Una orden admite hasta 60 renglones.' using errcode = '22023';
  end if;

  v_numero := 'OM-' || to_char(now() at time zone 'America/Santo_Domingo', 'YYYY') || '-'
              || lpad(privado.siguiente_numero(p_sistema, 'orden_medica')::text, 6, '0');

  insert into public.ordenes_medicas (sistema_id, paciente_id, cita_id, numero, tipo, proveedor, diagnostico, indicaciones, medico_id)
  values (p_sistema, p_paciente, p_cita, v_numero, p_tipo,
          nullif(left(trim(coalesce(p_proveedor, '')), 150), ''),
          nullif(left(trim(coalesce(p_diagnostico, '')), 500), ''),
          nullif(left(trim(coalesce(p_indicaciones, '')), 4000), ''),
          v_uid)
  returning id into v_id;

  insert into public.orden_items (sistema_id, orden_id, posicion, descripcion)
  select p_sistema, v_id, o, x from unnest(v_items) with ordinality as t (x, o);

  select jsonb_strip_nulls(jsonb_build_object('nombre', p.nombre_completo, 'especialidad', m.especialidad, 'exequatur', m.exequatur))
    into v_medico
    from public.perfiles p
    left join public.membresias m on m.usuario_id = p.id and m.sistema_id = p_sistema
   where p.id = v_uid;

  v_titulo := case p_tipo
                when 'laboratorio' then 'Orden de laboratorio'
                when 'imagen' then 'Orden de imágenes'
                when 'procedimiento' then 'Orden de procedimiento'
                else 'Orden médica'
              end;

  insert into public.historial_clinico (sistema_id, paciente_id, cita_id, autor_id, tipo, titulo, contenido, datos)
  values (p_sistema, p_paciente, p_cita, v_uid, 'orden', v_titulo || ' ' || v_numero,
          coalesce(nullif(trim(coalesce(p_indicaciones, '')), ''), array_to_string(v_items, E'\n')),
          jsonb_strip_nulls(jsonb_build_object(
            'orden_id', v_id, 'numero', v_numero, 'tipo_orden', p_tipo,
            'proveedor', nullif(trim(coalesce(p_proveedor, '')), ''),
            'diagnostico', nullif(trim(coalesce(p_diagnostico, '')), ''),
            'items', (select jsonb_agg(jsonb_build_object('nombre', x) order by o) from unnest(v_items) with ordinality as t (x, o)),
            'medico', v_medico)));

  return jsonb_build_object('id', v_id, 'numero', v_numero);
end;
$$;

create or replace function public.marcar_item_orden(p_item uuid, p_estado text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sistema  uuid;
  v_paciente uuid;
begin
  select i.sistema_id, o.paciente_id
    into v_sistema, v_paciente
    from public.orden_items i
    join public.ordenes_medicas o on o.sistema_id = i.sistema_id and o.id = i.orden_id
   where i.id = p_item;
  if v_sistema is null then
    raise exception 'La prueba no existe.' using errcode = 'P0002';
  end if;
  if not privado.tiene_rol(v_sistema, '{medico,enfermeria}'::public.rol_sistema[], 'historial') then
    raise exception 'Solo medicina o enfermería cambian el estado de una orden.' using errcode = '42501';
  end if;
  if not (v_sistema in (select privado.sistemas_vista_completa()) or v_paciente in (select privado.mis_pacientes())) then
    raise exception 'No tienes acceso a este paciente.' using errcode = '42501';
  end if;
  if p_estado not in ('pendiente', 'entregada', 'cancelada') then
    raise exception 'Estado inválido.' using errcode = '22023';
  end if;
  update public.orden_items
     set estado = p_estado, actualizado_en = now(), actualizado_por = auth.uid()
   where id = p_item and estado <> p_estado;
end;
$$;

-- Un resultado de laboratorio que trae el número de la orden la da por entregada.
create or replace function privado.tg_resultado_entrega_orden()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.paciente_id is null or nullif(trim(coalesce(new.orden, '')), '') is null then
    return new;
  end if;
  update public.orden_items i
     set estado = 'entregada', actualizado_en = now()
    from public.ordenes_medicas o
   where o.sistema_id = new.sistema_id
     and o.paciente_id = new.paciente_id
     and o.numero = upper(trim(new.orden))
     and i.sistema_id = o.sistema_id
     and i.orden_id = o.id
     and i.estado = 'pendiente';
  return new;
end;
$$;

drop trigger if exists trg_resultados_laboratorio_entrega_orden on public.resultados_laboratorio;
create trigger trg_resultados_laboratorio_entrega_orden
  after insert or update of paciente_id on public.resultados_laboratorio
  for each row execute function privado.tg_resultado_entrega_orden();

-- 4 ─────────────────────────────────────────────────────────────────────────────
-- Checkout: nota de egreso de la consulta + cita completada, juntas o ninguna.
create or replace function public.checkout_consulta(p_cita uuid, p_datos jsonb, p_nota text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cita  public.citas%rowtype;
  v_uid   uuid := auth.uid();
  v_id    uuid;
  v_datos jsonb;
  v_texto text;
begin
  select * into v_cita from public.citas where id = p_cita for update;
  if v_cita.id is null then
    raise exception 'La cita no existe.' using errcode = 'P0002';
  end if;
  if not privado.tiene_rol(v_cita.sistema_id, '{medico,psicologia,nutricion,terapia}'::public.rol_sistema[], 'historial') then
    raise exception 'Solo quien atiende puede cerrar la consulta.' using errcode = '42501';
  end if;
  if v_cita.medico_id is not null and v_cita.medico_id <> v_uid then
    raise exception 'Esta consulta la atiende otro profesional.' using errcode = '42501';
  end if;
  if v_cita.paciente_id is null then
    raise exception 'Identifica al paciente antes de cerrar la consulta.' using errcode = '22023';
  end if;
  if v_cita.estado::text not in ('llamado', 'en_consulta') then
    raise exception 'Solo se cierra una consulta en curso.' using errcode = '22023';
  end if;

  -- Solo texto corto por campo; nada de objetos anidados.
  select coalesce(jsonb_object_agg(k, left(v #>> '{}', 4000)), '{}')
    into v_datos
    from jsonb_each(case when jsonb_typeof(p_datos) = 'object' then p_datos else '{}' end) as e (k, v)
   where k in ('diagnostico', 'plan', 'indicaciones', 'proxima_cita', 'referido_a')
     and jsonb_typeof(v) in ('string', 'number')
     and trim(v #>> '{}') <> '';

  v_texto := coalesce(nullif(left(trim(coalesce(p_nota, '')), 20000), ''), 'Consulta finalizada.');

  insert into public.historial_clinico (sistema_id, paciente_id, cita_id, autor_id, tipo, titulo, contenido, datos)
  values (v_cita.sistema_id, v_cita.paciente_id, v_cita.id, v_uid, 'formulario', 'Checkout de la consulta', v_texto,
          v_datos || jsonb_build_object('formulario', 'checkout'))
  returning id into v_id;

  update public.citas set estado = 'completada' where id = v_cita.id;
  return v_id;
end;
$$;

revoke all on function public.crear_orden_medica(uuid, uuid, text, text[], text, text, text, uuid) from public, anon;
revoke all on function public.marcar_item_orden(uuid, text) from public, anon;
revoke all on function public.checkout_consulta(uuid, jsonb, text) from public, anon;
grant execute on function public.crear_orden_medica(uuid, uuid, text, text[], text, text, text, uuid) to authenticated;
grant execute on function public.marcar_item_orden(uuid, text) to authenticated;
grant execute on function public.checkout_consulta(uuid, jsonb, text) to authenticated;
