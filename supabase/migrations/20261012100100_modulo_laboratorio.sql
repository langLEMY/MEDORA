-- ============================================================================
-- MEDORA · Módulo Laboratorio (capacidad "laboratorio")
--
-- Catálogo de pruebas (con rango de referencia) → órdenes → resultados firmados
-- por el bioanalista. Aditivo; no afecta a los sistemas que no lo usen.
-- ============================================================================

-- Catálogo de pruebas ---------------------------------------------------------
create table public.laboratorio_pruebas (
  id          uuid primary key default gen_random_uuid(),
  sistema_id  uuid not null references public.sistemas(id) on delete restrict,
  codigo      text,
  nombre      text not null,
  categoria   text,
  unidad      text,
  metodo      text,
  ref_min     numeric,
  ref_max     numeric,
  ref_texto   text,
  precio      numeric(12, 2) not null default 0,
  activo      boolean not null default true,
  creado_en   timestamptz not null default now(),
  unique (sistema_id, id)
);
create index ix_lab_pruebas_sistema on public.laboratorio_pruebas (sistema_id) where activo;

-- Órdenes ---------------------------------------------------------------------
create table public.laboratorio_ordenes (
  id            uuid primary key default gen_random_uuid(),
  sistema_id    uuid not null references public.sistemas(id) on delete restrict,
  sede_id       uuid,
  numero        text not null,
  paciente_id   uuid not null,
  medico_nombre text,
  estado        text not null default 'pendiente' check (estado in ('pendiente', 'procesando', 'completada', 'anulada')),
  notas         text,
  creado_por    uuid not null default auth.uid(),
  creado_en     timestamptz not null default now(),
  unique (sistema_id, id),
  unique (sistema_id, numero),
  foreign key (sistema_id, paciente_id) references public.pacientes (sistema_id, id)
);
create index ix_lab_ordenes_sistema on public.laboratorio_ordenes (sistema_id, creado_en desc);

-- Ítems / resultados ----------------------------------------------------------
create table public.laboratorio_orden_items (
  id              uuid primary key default gen_random_uuid(),
  sistema_id      uuid not null references public.sistemas(id) on delete restrict,
  orden_id        uuid not null,
  prueba_id       uuid not null,
  prueba_nombre   text not null,
  unidad          text,
  ref_texto       text,
  ref_min         numeric,
  ref_max         numeric,
  resultado_valor numeric,
  resultado_texto text,
  fuera_rango     boolean,
  bioanalista     text,
  exequatur       text,
  firmado_en      timestamptz,
  foreign key (sistema_id, orden_id) references public.laboratorio_ordenes (sistema_id, id) on delete cascade,
  foreign key (sistema_id, prueba_id) references public.laboratorio_pruebas (sistema_id, id)
);
create index ix_lab_items_orden on public.laboratorio_orden_items (orden_id);

-- Auditoría de las órdenes (quién ordenó qué; sin datos clínicos).
create trigger trg_laboratorio_ordenes_auditoria after insert on public.laboratorio_ordenes
  for each row execute function privado.tg_auditar('sin_datos');

-- RLS -------------------------------------------------------------------------
alter table public.laboratorio_pruebas     enable row level security;
alter table public.laboratorio_ordenes     enable row level security;
alter table public.laboratorio_orden_items enable row level security;
revoke all on public.laboratorio_pruebas, public.laboratorio_ordenes, public.laboratorio_orden_items from anon;

-- Catálogo: lo ve cualquier miembro; lo edita laboratorio o admin.
create policy lab_pruebas_select on public.laboratorio_pruebas for select to authenticated
  using (sistema_id in (select privado.mis_sistemas()));
create policy lab_pruebas_insert on public.laboratorio_pruebas for insert to authenticated
  with check (sistema_id in (select privado.mis_sistemas_con_rol('{laboratorio,admin}')));
create policy lab_pruebas_update on public.laboratorio_pruebas for update to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{laboratorio,admin}')))
  with check (sistema_id in (select privado.mis_sistemas_con_rol('{laboratorio,admin}')));

-- Órdenes y resultados: los ve/gestiona laboratorio, admin, médico y gerencia.
create policy lab_ordenes_select on public.laboratorio_ordenes for select to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{laboratorio,admin,medico,gerencia}')));
create policy lab_items_select on public.laboratorio_orden_items for select to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{laboratorio,admin,medico,gerencia}')));
-- La escritura va por las RPC (security definer); sin políticas de insert/update directas.

-- RPC: crear una orden con sus pruebas -----------------------------------------
create or replace function public.crear_orden_lab(
  p_sistema uuid, p_paciente uuid, p_pruebas uuid[],
  p_sede uuid default null, p_medico text default null, p_notas text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
  v_numero text;
begin
  if not privado.tiene_rol(p_sistema, '{laboratorio,admin,recepcion}') then
    raise exception 'No tienes permiso para crear órdenes de laboratorio.' using errcode = '42501';
  end if;
  if coalesce(array_length(p_pruebas, 1), 0) = 0 then
    raise exception 'Agrega al menos una prueba.' using errcode = 'P0001';
  end if;

  v_numero := 'LAB-' || lpad(privado.siguiente_numero(p_sistema, 'lab_orden')::text, 6, '0');
  insert into public.laboratorio_ordenes (id, sistema_id, sede_id, numero, paciente_id, medico_nombre, notas)
  values (v_id, p_sistema, p_sede, v_numero, p_paciente, nullif(p_medico, ''), nullif(p_notas, ''));

  insert into public.laboratorio_orden_items (sistema_id, orden_id, prueba_id, prueba_nombre, unidad, ref_texto, ref_min, ref_max)
  select p_sistema, v_id, pr.id, pr.nombre, pr.unidad, pr.ref_texto, pr.ref_min, pr.ref_max
    from public.laboratorio_pruebas pr
   where pr.sistema_id = p_sistema and pr.id = any(p_pruebas);

  return jsonb_build_object('id', v_id, 'numero', v_numero);
end;
$$;

-- RPC: registrar (firmar) el resultado de un ítem ------------------------------
create or replace function public.registrar_resultado_lab(
  p_item uuid, p_valor numeric, p_texto text, p_bioanalista text, p_exequatur text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.laboratorio_orden_items;
  v_fuera boolean;
begin
  select * into v_item from public.laboratorio_orden_items where id = p_item for update;
  if v_item.id is null or not privado.tiene_rol(v_item.sistema_id, '{laboratorio,admin}') then
    raise exception 'Resultado no encontrado o sin permiso.' using errcode = '42501';
  end if;
  if v_item.firmado_en is not null then
    raise exception 'Ese resultado ya fue firmado; registra una corrección como orden nueva.' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_bioanalista), '') = '' then
    raise exception 'Falta el nombre del bioanalista que firma.' using errcode = 'P0001';
  end if;

  v_fuera := case
    when p_valor is null then null
    when v_item.ref_min is not null and p_valor < v_item.ref_min then true
    when v_item.ref_max is not null and p_valor > v_item.ref_max then true
    else false end;

  update public.laboratorio_orden_items set
    resultado_valor = p_valor, resultado_texto = nullif(p_texto, ''), fuera_rango = v_fuera,
    bioanalista = p_bioanalista, exequatur = nullif(p_exequatur, ''), firmado_en = now()
  where id = p_item;

  -- Si ya no quedan pendientes, la orden pasa a completada.
  update public.laboratorio_ordenes o set estado = 'completada'
   where o.id = v_item.orden_id
     and not exists (select 1 from public.laboratorio_orden_items i where i.orden_id = o.id and i.firmado_en is null);
end;
$$;

revoke all on function public.crear_orden_lab(uuid, uuid, uuid[], uuid, text, text) from public, anon;
revoke all on function public.registrar_resultado_lab(uuid, numeric, text, text, text) from public, anon;
grant execute on function public.crear_orden_lab(uuid, uuid, uuid[], uuid, text, text) to authenticated;
grant execute on function public.registrar_resultado_lab(uuid, numeric, text, text, text) to authenticated;
