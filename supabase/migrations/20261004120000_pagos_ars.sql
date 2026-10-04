-- ============================================================================
-- MEDORA . Pagos de ARS: importar la relación de pagos y conciliar con CxC
--
-- La ARS (SENASA primero) paga por lotes y envía la relación: número de
-- autorización, lo reclamado, lo pagado y la glosa (lo que no reconoce). Al
-- importarla, cada pago se abona a las cuentas por cobrar de esa autorización
-- (registrar_abono: deja su asiento), y la glosa queda registrada para que
-- contabilidad decida (reclamar o castigar). Lotes y líneas son append-only.
-- ============================================================================

create table public.ars_pagos_lotes (
  id              uuid primary key default gen_random_uuid(),
  sistema_id      uuid not null references public.sistemas(id) on delete restrict,
  aseguradora_id  uuid not null,
  referencia      text not null check (char_length(referencia) between 1 and 120),
  fecha           date not null,
  creado_por      uuid default auth.uid(),
  creado_en       timestamptz not null default now(),
  unique (sistema_id, id),
  foreign key (sistema_id, aseguradora_id) references public.aseguradoras (sistema_id, id)
);
create index ix_ars_lotes on public.ars_pagos_lotes (sistema_id, fecha desc);

create table public.ars_pagos_items (
  id                  uuid primary key default gen_random_uuid(),
  sistema_id          uuid not null references public.sistemas(id) on delete restrict,
  lote_id             uuid not null,
  numero_autorizacion text not null,
  cobro_id            uuid,
  reclamado           numeric(14, 2),
  pagado              numeric(14, 2) not null default 0,
  aplicado            numeric(14, 2) not null default 0,
  glosa               numeric(14, 2) not null default 0,
  motivo_glosa        text,
  estado              text not null check (estado in ('aplicado', 'parcial', 'sin_cobro', 'ya_pagado', 'solo_glosa')),
  creado_en           timestamptz not null default now(),
  foreign key (sistema_id, lote_id) references public.ars_pagos_lotes (sistema_id, id),
  foreign key (sistema_id, cobro_id) references public.cobros (sistema_id, id)
);
create index ix_ars_items_lote on public.ars_pagos_items (lote_id);
create index ix_ars_items_autorizacion on public.ars_pagos_items (sistema_id, numero_autorizacion);

create trigger trg_ars_pagos_lotes_append_only before update or delete on public.ars_pagos_lotes
  for each row execute function privado.tg_bloquear_append_only();
create trigger trg_ars_pagos_items_append_only before update or delete on public.ars_pagos_items
  for each row execute function privado.tg_bloquear_append_only();
create trigger trg_ars_pagos_lotes_auditoria after insert on public.ars_pagos_lotes
  for each row execute function privado.tg_auditar();

alter table public.ars_pagos_lotes enable row level security;
alter table public.ars_pagos_items enable row level security;
revoke all on public.ars_pagos_lotes, public.ars_pagos_items from anon, authenticated;
grant select on public.ars_pagos_lotes, public.ars_pagos_items to authenticated;
create policy ars_pagos_lotes_select on public.ars_pagos_lotes for select to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{caja,admin,contabilidad,gerencia,auditor}', 'caja')));
create policy ars_pagos_items_select on public.ars_pagos_items for select to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{caja,admin,contabilidad,gerencia,auditor}', 'caja')));

-- Las variantes de una misma ARS (SENASA Contributivo, Subsidiado, Pensionado…)
-- se pagan juntas: se agrupan por la primera palabra del nombre.
create or replace function privado.familia_aseguradora(p_nombre text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(split_part(trim(coalesce(p_nombre, '')), ' ', 1));
$$;

-- p_filas: [{_fila, autorizacion, pagado, reclamado?, glosa?, motivo?}]
create or replace function public.importar_pagos_ars(p_sistema uuid, p_aseguradora uuid, p_referencia text, p_fecha date, p_filas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote      uuid := gen_random_uuid();
  v_familia   text;
  f           jsonb;
  v_fila      text;
  v_aut       text;
  v_pagado    numeric;
  v_reclamado numeric;
  v_glosa     numeric;
  v_resto     numeric;
  v_aplicado  numeric;
  v_pend      numeric;
  v_monto     numeric;
  v_cobro     uuid;
  v_hubo      boolean;
  k           record;
  c int := 0; o int := 0;
  e text[] := '{}';
  t_pagado numeric := 0; t_aplicado numeric := 0; t_glosa numeric := 0;
begin
  if not privado.tiene_rol(p_sistema, '{admin,contabilidad,caja}', 'caja') then
    raise exception 'No tienes permiso para registrar pagos de ARS.' using errcode = '42501';
  end if;
  select privado.familia_aseguradora(nombre) into v_familia from public.aseguradoras where id = p_aseguradora and sistema_id = p_sistema;
  if v_familia is null then
    raise exception 'Aseguradora no encontrada.' using errcode = 'P0001';
  end if;
  if nullif(trim(coalesce(p_referencia, '')), '') is null then
    raise exception 'Escribe la referencia del pago (número de transferencia o de la relación).' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.ars_pagos_lotes where sistema_id = p_sistema and aseguradora_id = p_aseguradora and referencia = trim(p_referencia)) then
    raise exception 'Ese pago (%) ya se importó.', trim(p_referencia) using errcode = 'P0001';
  end if;

  insert into public.ars_pagos_lotes (id, sistema_id, aseguradora_id, referencia, fecha)
  values (v_lote, p_sistema, p_aseguradora, trim(p_referencia), coalesce(p_fecha, current_date));

  for f in select * from jsonb_array_elements(p_filas) loop
    v_fila := coalesce(f ->> '_fila', '?');
    v_aut := regexp_replace(coalesce(privado.texto(f, 'autorizacion'), ''), '\s', '', 'g');
    v_pagado := round(coalesce(privado.numero(f, 'pagado'), 0), 2);
    v_reclamado := privado.numero(f, 'reclamado');
    v_glosa := round(coalesce(privado.numero(f, 'glosa'), greatest(coalesce(v_reclamado, v_pagado) - v_pagado, 0)), 2);
    if v_aut = '' then
      o := o + 1;
      e := e || ('Fila ' || v_fila || ': sin número de autorización, omitida.');
      continue;
    end if;

    v_resto := v_pagado;
    v_aplicado := 0;
    v_cobro := null;
    v_hubo := false;
    -- Puede haber varios cobros con la misma autorización (consulta + medicamentos).
    for k in
      select co.id,
             co.cobertura_seguro + co.monto_fondo
               - coalesce((select sum(a.monto) from public.abonos a where a.cobro_id = co.id and a.deudor = 'aseguradora'), 0) as pendiente
        from public.cobros co
        join public.aseguradoras a on a.id = co.aseguradora_id
       where co.sistema_id = p_sistema and co.numero_autorizacion = v_aut
         and privado.familia_aseguradora(a.nombre) = v_familia
         and not exists (select 1 from public.anulaciones_cobro x where x.cobro_id = co.id)
       order by co.creado_en
    loop
      v_hubo := true;
      v_cobro := coalesce(v_cobro, k.id);
      v_pend := k.pendiente;
      continue when v_resto <= 0 or v_pend <= 0;
      v_monto := least(v_resto, v_pend);
      perform public.registrar_abono(p_sistema, k.id, 'aseguradora', v_monto, 'transferencia',
                                     'Pago ARS ' || trim(p_referencia), coalesce(p_fecha, current_date));
      v_resto := v_resto - v_monto;
      v_aplicado := v_aplicado + v_monto;
    end loop;

    insert into public.ars_pagos_items (sistema_id, lote_id, numero_autorizacion, cobro_id, reclamado, pagado, aplicado, glosa, motivo_glosa, estado)
    values (p_sistema, v_lote, v_aut, v_cobro, v_reclamado, v_pagado, v_aplicado, v_glosa, privado.texto(f, 'motivo'),
            case when not v_hubo then 'sin_cobro'
                 when v_pagado = 0 then 'solo_glosa'
                 when v_aplicado = 0 then 'ya_pagado'
                 when v_aplicado < v_pagado then 'parcial'
                 else 'aplicado' end);

    if not v_hubo then
      e := e || ('Fila ' || v_fila || ': la autorización ' || v_aut || ' no corresponde a ningún cobro de esta ARS.');
    elsif v_pagado > 0 and v_aplicado < v_pagado then
      e := e || ('Fila ' || v_fila || ': autorización ' || v_aut || ', RD$' || (v_pagado - v_aplicado) || ' más de lo pendiente (revisar).');
    end if;
    c := c + 1;
    t_pagado := t_pagado + v_pagado;
    t_aplicado := t_aplicado + v_aplicado;
    t_glosa := t_glosa + v_glosa;
  end loop;

  -- Los totales del lote se calculan en la vista ars_pagos_resumen (las líneas mandan).
  -- Formato del asistente de importación (creados/actualizados/omitidos/errores) + totales.
  return privado.resultado_importacion(c, 0, o, e)
         || jsonb_build_object('lote_id', v_lote, 'pagado', t_pagado, 'aplicado', t_aplicado, 'glosado', t_glosa);
end;
$$;
revoke all on function public.importar_pagos_ars(uuid, uuid, text, date, jsonb) from public, anon;
grant execute on function public.importar_pagos_ars(uuid, uuid, text, date, jsonb) to authenticated;

-- Resumen de lotes con sus totales (las líneas son la fuente de verdad).
create or replace view public.ars_pagos_resumen
with (security_invoker = true) as
select l.id, l.sistema_id, l.aseguradora_id, a.nombre as aseguradora, l.referencia, l.fecha, l.creado_en,
       count(i.id) as filas,
       coalesce(sum(i.pagado), 0) as pagado,
       coalesce(sum(i.aplicado), 0) as aplicado,
       coalesce(sum(i.glosa), 0) as glosado,
       count(*) filter (where i.estado = 'sin_cobro') as sin_cobro
  from public.ars_pagos_lotes l
  join public.aseguradoras a on a.id = l.aseguradora_id
  left join public.ars_pagos_items i on i.lote_id = l.id
 group by l.id, a.nombre;
revoke all on public.ars_pagos_resumen from anon;
grant select on public.ars_pagos_resumen to authenticated;
