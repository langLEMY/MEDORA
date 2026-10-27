-- ============================================================================
-- MEDORA · Módulo Farmacia (capacidad "farmacia_pos" / "controlados")
--
-- MVP: lotes con vencimiento + LIBRO DE CONTROLADOS (psicotrópicos/estupefacientes,
-- requisito de la DNCD). La dispensación con cobro (POS → caja) se integra en una
-- fase posterior. Aditivo; no afecta a los sistemas que no lo usen.
-- ============================================================================

-- Lotes y vencimientos de los ítems de inventario -----------------------------
create table public.farmacia_lotes (
  id          uuid primary key default gen_random_uuid(),
  sistema_id  uuid not null references public.sistemas(id) on delete restrict,
  item_id     uuid not null references public.inventario_items(id) on delete restrict,
  lote        text,
  vencimiento date,
  cantidad    numeric(14, 2) not null default 0,
  creado_en   timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index ix_farmacia_lotes on public.farmacia_lotes (sistema_id, item_id);
create index ix_farmacia_lotes_venc on public.farmacia_lotes (sistema_id, vencimiento);

create trigger trg_farmacia_lotes_actualizacion before update on public.farmacia_lotes
  for each row execute function privado.tg_marcar_actualizacion();

-- Libro de medicamentos controlados (DNCD) · append-only ----------------------
create table public.farmacia_controlados (
  id              uuid primary key default gen_random_uuid(),
  sistema_id      uuid not null references public.sistemas(id) on delete restrict,
  fecha           date not null default current_date,
  item_id         uuid references public.inventario_items(id),
  item_nombre     text not null,
  tipo            text not null check (tipo in ('entrada', 'salida')),
  cantidad        numeric(14, 2) not null check (cantidad > 0),
  receta          text,
  paciente_nombre text,
  medico_nombre   text,
  responsable     text not null,  -- regente/farmacéutico responsable
  creado_por      uuid not null default auth.uid(),
  creado_en       timestamptz not null default now()
);
create index ix_farmacia_controlados on public.farmacia_controlados (sistema_id, creado_en desc);

create trigger trg_farmacia_controlados_append_only before update or delete on public.farmacia_controlados
  for each row execute function privado.tg_bloquear_append_only();
create trigger trg_farmacia_controlados_auditoria after insert on public.farmacia_controlados
  for each row execute function privado.tg_auditar();

-- RLS -------------------------------------------------------------------------
alter table public.farmacia_lotes       enable row level security;
alter table public.farmacia_controlados enable row level security;
revoke all on public.farmacia_lotes, public.farmacia_controlados from anon;
grant select, insert, update on public.farmacia_lotes to authenticated;

-- Lotes: los ve cualquier miembro; los maneja farmacia o admin.
create policy farmacia_lotes_select on public.farmacia_lotes for select to authenticated
  using (sistema_id in (select privado.mis_sistemas()));
create policy farmacia_lotes_insert on public.farmacia_lotes for insert to authenticated
  with check (sistema_id in (select privado.mis_sistemas_con_rol('{farmacia,admin}')));
create policy farmacia_lotes_update on public.farmacia_lotes for update to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{farmacia,admin}')))
  with check (sistema_id in (select privado.mis_sistemas_con_rol('{farmacia,admin}')));

-- Libro de controlados: lo ven farmacia, admin, auditor y gerencia; se escribe por RPC.
create policy farmacia_controlados_select on public.farmacia_controlados for select to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{farmacia,admin,auditor,gerencia}')));

-- RPC: registrar un movimiento del libro de controlados ------------------------
create or replace function public.registrar_controlado(
  p_sistema uuid, p_item_nombre text, p_tipo text, p_cantidad numeric, p_responsable text,
  p_item uuid default null, p_receta text default null, p_paciente text default null, p_medico text default null, p_fecha date default current_date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  if not privado.tiene_rol(p_sistema, '{farmacia,admin}') then
    raise exception 'No tienes permiso para el libro de controlados.' using errcode = '42501';
  end if;
  if p_tipo not in ('entrada', 'salida') then
    raise exception 'Tipo inválido.' using errcode = 'P0001';
  end if;
  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad debe ser mayor que cero.' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_responsable), '') = '' then
    raise exception 'Falta el responsable (regente).' using errcode = 'P0001';
  end if;
  if p_tipo = 'salida' and coalesce(trim(p_receta), '') = '' then
    raise exception 'Una salida de controlados exige el número de receta.' using errcode = 'P0001';
  end if;

  insert into public.farmacia_controlados (id, sistema_id, fecha, item_id, item_nombre, tipo, cantidad, receta, paciente_nombre, medico_nombre, responsable)
  values (v_id, p_sistema, coalesce(p_fecha, current_date), p_item, p_item_nombre, p_tipo, p_cantidad,
          nullif(p_receta, ''), nullif(p_paciente, ''), nullif(p_medico, ''), p_responsable);
  return v_id;
end;
$$;

revoke all on function public.registrar_controlado(uuid, text, text, numeric, text, uuid, text, text, text, date) from public, anon;
grant execute on function public.registrar_controlado(uuid, text, text, numeric, text, uuid, text, text, text, date) to authenticated;
