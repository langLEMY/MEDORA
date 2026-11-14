-- ============================================================================
-- MEDORA · Naturaleza de la institución y módulos de fundación (ASFL, Ley 122-05)
--
-- El tipo de SEDE (consultorio/clínica/hospital…) dice qué servicios se dan; la
-- NATURALEZA del sistema (privada / fundación / pública) dice cómo se financia.
-- Para una fundación:
--   1. Fondos de donantes: cada donación puede ir a un fondo; sus usos se registran
--      contra el fondo (un fondo restringido no se gasta por encima de su saldo).
--      Es control de gestión: la donación y el gasto ya tienen su asiento contable.
--   2. Tarifa social: estudio socioeconómico → categoría A–D → % de descuento sugerido.
--   3. Médicos voluntarios: no generan comisión.
--   4. Jornadas médicas: atenciones rápidas fuera de la sede (sin cobro, sin crear fichas).
--   5. reporte_fundacion(): lo que se rinde a donantes y al CASFL.
-- Aditiva: un sistema "privada" no cambia en nada.
-- ============================================================================

-- 1 ─ Naturaleza y configuración de la tarifa social ─────────────────────────────
alter table public.sistemas
  add column if not exists naturaleza text not null default 'privada',
  add column if not exists tarifa_social jsonb not null
    default '{"umbrales": [3000, 6000, 12000], "descuentos": {"A": 0, "B": 25, "C": 50, "D": 100}, "vigencia_meses": 12}'::jsonb;
alter table public.sistemas drop constraint if exists sistemas_naturaleza_valida;
alter table public.sistemas add constraint sistemas_naturaleza_valida check (naturaleza in ('privada', 'fundacion', 'publica'));

-- FUNBIDE (Fundación Bienestar y Desarrollo, RNC de ASFL) y su sistema de pruebas.
update public.sistemas set naturaleza = 'fundacion' where rnc = '430090387' and naturaleza = 'privada';

-- La administración del hospital ajusta su tabla de tarifa social (sistemas solo lo edita el superadmin).
create or replace function public.guardar_tarifa_social(p_sistema uuid, p_config jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  u jsonb := p_config -> 'umbrales';
  d jsonb := p_config -> 'descuentos';
  m int := coalesce((p_config ->> 'vigencia_meses')::int, 12);
begin
  if not privado.tiene_rol(p_sistema, '{admin}'::public.rol_sistema[]) then
    raise exception 'Solo la administración ajusta la tarifa social.' using errcode = '42501';
  end if;
  if jsonb_typeof(u) <> 'array' or jsonb_array_length(u) <> 3
     or not ((u ->> 0)::numeric > 0 and (u ->> 0)::numeric < (u ->> 1)::numeric and (u ->> 1)::numeric < (u ->> 2)::numeric) then
    raise exception 'Los tres umbrales deben ser positivos y crecientes.' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(array['A', 'B', 'C', 'D']) k where coalesce((d ->> k)::numeric, -1) not between 0 and 100) then
    raise exception 'Cada categoría necesita un descuento entre 0 y 100 %%.' using errcode = '22023';
  end if;
  if m not between 1 and 36 then
    raise exception 'La vigencia va de 1 a 36 meses.' using errcode = '22023';
  end if;
  update public.sistemas
     set tarifa_social = jsonb_build_object(
           'umbrales', jsonb_build_array((u ->> 0)::numeric, (u ->> 1)::numeric, (u ->> 2)::numeric),
           'descuentos', jsonb_build_object('A', (d ->> 'A')::numeric, 'B', (d ->> 'B')::numeric, 'C', (d ->> 'C')::numeric, 'D', (d ->> 'D')::numeric),
           'vigencia_meses', m)
   where id = p_sistema;
end;
$$;

-- 3 ─ Voluntarios: sin comisión ─────────────────────────────────────────────────
alter table public.membresias add column if not exists voluntario boolean not null default false;

create or replace function privado.es_voluntario(p_sistema uuid, p_usuario uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select m.voluntario from public.membresias m where m.sistema_id = p_sistema and m.usuario_id = p_usuario), false);
$$;

-- Mismo cálculo de siempre; solo se salta a quien es voluntario.
create or replace function privado.calcular_comisiones(p_cobro uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  c public.cobros;
  d record;
  quien record;
  r public.reglas_comision;
  v_base numeric;
  v_monto numeric;
begin
  select * into c from public.cobros where id = p_cobro;
  for quien in
    select 'profesional' as aplica, c.profesional_id as persona where c.profesional_id is not null and not privado.es_voluntario(c.sistema_id, c.profesional_id)
    union all
    select 'vendedor', c.vendedor_id where c.vendedor_id is not null and not privado.es_voluntario(c.sistema_id, c.vendedor_id)
  loop
    for d in select * from public.cobro_detalles where cobro_id = c.id loop
      select rc.* into r
        from public.reglas_comision rc
        left join public.membresias m on m.sistema_id = c.sistema_id and m.usuario_id = quien.persona
       where rc.sistema_id = c.sistema_id and rc.activo and rc.aplica_a = quien.aplica
         and (rc.vigente_desde is null or rc.vigente_desde <= current_date)
         and (rc.vigente_hasta is null or rc.vigente_hasta >= current_date)
         and (rc.beneficiario_id = quien.persona
              or (rc.beneficiario_id is null and (rc.rol is null or rc.rol = any(m.roles))))
         and (rc.especialidad is null or lower(trim(rc.especialidad)) = lower(trim(m.especialidad)))
         and (rc.servicio_id is null or rc.servicio_id = d.servicio_id)
         and (rc.categoria is null or rc.categoria = d.categoria)
       order by (rc.beneficiario_id is not null) desc, (rc.servicio_id is not null) desc,
                (rc.categoria is not null) desc, (rc.especialidad is not null) desc, rc.creado_en desc
       limit 1;
      continue when r.id is null;

      v_base := case r.base when 'neto' then d.total else round(d.precio_unitario * d.cantidad, 2) - coalesce(d.fondo, 0) end;
      v_monto := round(case r.tipo when 'porcentaje' then v_base * r.valor / 100 else r.valor * d.cantidad end, 2);
      if v_monto > 0 then
        insert into public.comisiones (sistema_id, cobro_id, detalle_id, beneficiario_id, regla_id, base_monto, monto, retencion, concepto)
        values (c.sistema_id, c.id, d.id, quien.persona, r.id, v_base, v_monto, round(v_monto * r.retencion / 100, 2),
                c.numero || ' · ' || d.descripcion);
      end if;
      r := null;
    end loop;
  end loop;
end;
$function$;

create or replace function privado.calcular_comisiones_profesional(p_cobro uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  c public.cobros;
  d record;
  quien record;
  r public.reglas_comision;
  v_base numeric;
  v_monto numeric;
begin
  select * into c from public.cobros where id = p_cobro;
  for quien in
    select 'profesional' as aplica, c.profesional_id as persona where c.profesional_id is not null and not privado.es_voluntario(c.sistema_id, c.profesional_id)
  loop
    for d in select * from public.cobro_detalles where cobro_id = c.id loop
      select rc.* into r
        from public.reglas_comision rc
        left join public.membresias m on m.sistema_id = c.sistema_id and m.usuario_id = quien.persona
       where rc.sistema_id = c.sistema_id and rc.activo and rc.aplica_a = quien.aplica
         and (rc.vigente_desde is null or rc.vigente_desde <= current_date)
         and (rc.vigente_hasta is null or rc.vigente_hasta >= current_date)
         and (rc.beneficiario_id = quien.persona
              or (rc.beneficiario_id is null and (rc.rol is null or rc.rol = any(m.roles))))
         and (rc.especialidad is null or lower(trim(rc.especialidad)) = lower(trim(m.especialidad)))
         and (rc.servicio_id is null or rc.servicio_id = d.servicio_id)
         and (rc.categoria is null or rc.categoria = d.categoria)
       order by (rc.beneficiario_id is not null) desc, (rc.servicio_id is not null) desc,
                (rc.categoria is not null) desc, (rc.especialidad is not null) desc, rc.creado_en desc
       limit 1;
      continue when r.id is null;

      v_base := case r.base when 'neto' then d.total else round(d.precio_unitario * d.cantidad, 2) - coalesce(d.fondo, 0) end;
      v_monto := round(case r.tipo when 'porcentaje' then v_base * r.valor / 100 else r.valor * d.cantidad end, 2);
      if v_monto > 0 then
        insert into public.comisiones (sistema_id, cobro_id, detalle_id, beneficiario_id, regla_id, base_monto, monto, retencion, concepto)
        values (c.sistema_id, c.id, d.id, quien.persona, r.id, v_base, v_monto, round(v_monto * r.retencion / 100, 2),
                c.numero || ' · ' || d.descripcion);
      end if;
      r := null;
    end loop;
  end loop;
end;
$function$;

-- 1 ─ Fondos de donantes ─────────────────────────────────────────────────────────
create table if not exists public.fondos (
  id           uuid primary key default gen_random_uuid(),
  sistema_id   uuid not null references public.sistemas (id) on delete restrict,
  nombre       text not null check (char_length(trim(nombre)) between 2 and 120),
  donante      text check (char_length(donante) <= 150),
  descripcion  text check (char_length(descripcion) <= 1000),
  restringido  boolean not null default true,
  meta         numeric(14, 2) check (meta is null or meta > 0),
  activo       boolean not null default true,
  creado_por   uuid references public.perfiles (id) default auth.uid(),
  creado_en    timestamptz not null default now(),
  unique (sistema_id, id),
  unique (sistema_id, nombre)
);
create index if not exists ix_fondos_creado_por on public.fondos (creado_por);

alter table public.donaciones add column if not exists fondo_id uuid;
alter table public.donaciones drop constraint if exists donaciones_sistema_id_fondo_id_fkey;
alter table public.donaciones add constraint donaciones_sistema_id_fondo_id_fkey foreign key (sistema_id, fondo_id) references public.fondos (sistema_id, id);
create index if not exists ix_donaciones_fondo on public.donaciones (sistema_id, fondo_id) where fondo_id is not null;

create table if not exists public.fondo_usos (
  id           uuid primary key default gen_random_uuid(),
  sistema_id   uuid not null references public.sistemas (id) on delete restrict,
  fondo_id     uuid not null,
  fecha        date not null default current_date,
  concepto     text not null check (char_length(trim(concepto)) between 3 and 300),
  monto        numeric(14, 2) not null check (monto <> 0),
  comprobante  text check (char_length(comprobante) <= 80),
  revierte_a   uuid unique references public.fondo_usos (id),
  creado_por   uuid not null references public.perfiles (id),
  creado_en    timestamptz not null default now(),
  foreign key (sistema_id, fondo_id) references public.fondos (sistema_id, id),
  check ((monto < 0) = (revierte_a is not null))
);
create index if not exists ix_fondo_usos_fondo on public.fondo_usos (sistema_id, fondo_id, fecha desc);
create index if not exists ix_fondo_usos_creado_por on public.fondo_usos (creado_por);

alter table public.fondos enable row level security;
alter table public.fondo_usos enable row level security;

drop policy if exists fondos_select on public.fondos;
create policy fondos_select on public.fondos for select to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{admin,gerencia,contabilidad,caja,auditor}'::public.rol_sistema[])));
drop policy if exists fondos_insert on public.fondos;
create policy fondos_insert on public.fondos for insert to authenticated
  with check (sistema_id in (select privado.mis_sistemas_con_rol('{admin,gerencia,contabilidad}'::public.rol_sistema[])));
drop policy if exists fondos_update on public.fondos;
create policy fondos_update on public.fondos for update to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{admin,gerencia,contabilidad}'::public.rol_sistema[])))
  with check (sistema_id in (select privado.mis_sistemas_con_rol('{admin,gerencia,contabilidad}'::public.rol_sistema[])));
drop policy if exists fondo_usos_select on public.fondo_usos;
create policy fondo_usos_select on public.fondo_usos for select to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{admin,gerencia,contabilidad,auditor}'::public.rol_sistema[])));

revoke all on public.fondos from anon, authenticated;
revoke all on public.fondo_usos from anon, authenticated;
grant select, insert, update (nombre, donante, descripcion, restringido, meta, activo) on public.fondos to authenticated;
grant select on public.fondo_usos to authenticated;

drop trigger if exists trg_fondo_usos_append_only on public.fondo_usos;
create trigger trg_fondo_usos_append_only before update or delete on public.fondo_usos
  for each row execute function privado.tg_bloquear_append_only();
drop trigger if exists trg_fondos_auditoria on public.fondos;
create trigger trg_fondos_auditoria after insert or update or delete on public.fondos
  for each row execute function privado.tg_auditar();
drop trigger if exists trg_fondo_usos_auditoria on public.fondo_usos;
create trigger trg_fondo_usos_auditoria after insert or update or delete on public.fondo_usos
  for each row execute function privado.tg_auditar();

-- Lo recibido (donaciones no anuladas) menos lo usado.
create or replace function privado.saldo_fondo(p_fondo uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select sum(d.monto) from public.donaciones d
                    where d.fondo_id = p_fondo
                      and not exists (select 1 from public.anulaciones_donacion a where a.donacion_id = d.id)), 0)
       - coalesce((select sum(u.monto) from public.fondo_usos u where u.fondo_id = p_fondo), 0);
$$;

create or replace function public.fondos_resumen(p_sistema uuid)
returns table (id uuid, nombre text, donante text, descripcion text, restringido boolean, meta numeric, activo boolean, recibido numeric, usado numeric, saldo numeric, donaciones bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select f.id, f.nombre, f.donante, f.descripcion, f.restringido, f.meta, f.activo,
         coalesce(r.recibido, 0), coalesce(u.usado, 0), coalesce(r.recibido, 0) - coalesce(u.usado, 0), coalesce(r.n, 0)
    from public.fondos f
    left join lateral (
      select sum(d.monto) recibido, count(*) n from public.donaciones d
       where d.sistema_id = f.sistema_id and d.fondo_id = f.id
         and not exists (select 1 from public.anulaciones_donacion a where a.donacion_id = d.id)) r on true
    left join lateral (select sum(x.monto) usado from public.fondo_usos x where x.sistema_id = f.sistema_id and x.fondo_id = f.id) u on true
   where f.sistema_id = p_sistema
   order by f.activo desc, f.nombre;
$$;

create or replace function public.aplicar_fondo(
  p_sistema uuid, p_fondo uuid, p_monto numeric, p_concepto text, p_fecha date default current_date, p_comprobante text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.fondos;
  v_monto numeric := round(coalesce(p_monto, 0), 2);
  v_saldo numeric;
  v_id uuid;
begin
  if not privado.tiene_rol(p_sistema, '{admin,gerencia,contabilidad}'::public.rol_sistema[]) then
    raise exception 'Solo administración, gerencia o contabilidad registran el uso de un fondo.' using errcode = '42501';
  end if;
  -- Serializa por fondo: dos usos a la vez no pueden pasarse del saldo.
  perform pg_advisory_xact_lock(hashtextextended('fondo:' || p_fondo::text, 0));
  select * into f from public.fondos where id = p_fondo and sistema_id = p_sistema;
  if f.id is null then
    raise exception 'El fondo no existe.' using errcode = 'P0002';
  end if;
  if not f.activo then
    raise exception 'El fondo está cerrado.' using errcode = 'P0001';
  end if;
  if v_monto <= 0 then
    raise exception 'El monto debe ser mayor que cero.' using errcode = 'P0001';
  end if;
  if coalesce(p_fecha, current_date) > current_date then
    raise exception 'La fecha no puede ser futura.' using errcode = 'P0001';
  end if;
  v_saldo := privado.saldo_fondo(p_fondo);
  if f.restringido and v_monto > v_saldo then
    raise exception 'El fondo "%" solo tiene % disponibles.', f.nombre, to_char(v_saldo, 'FM999,999,990.00') using errcode = 'P0001';
  end if;
  insert into public.fondo_usos (sistema_id, fondo_id, fecha, concepto, monto, comprobante, creado_por)
  values (p_sistema, p_fondo, coalesce(p_fecha, current_date), trim(p_concepto), v_monto, nullif(trim(coalesce(p_comprobante, '')), ''), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.revertir_uso_fondo(p_uso uuid, p_motivo text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  u public.fondo_usos;
  v_id uuid;
begin
  select * into u from public.fondo_usos where id = p_uso;
  if u.id is null or not privado.tiene_rol(u.sistema_id, '{admin,gerencia,contabilidad}'::public.rol_sistema[]) then
    raise exception 'Uso no encontrado o sin permiso.' using errcode = '42501';
  end if;
  if u.monto < 0 then
    raise exception 'Eso ya es una reversión.' using errcode = 'P0001';
  end if;
  if char_length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Indica el motivo.' using errcode = 'P0001';
  end if;
  insert into public.fondo_usos (sistema_id, fondo_id, fecha, concepto, monto, comprobante, revierte_a, creado_por)
  values (u.sistema_id, u.fondo_id, current_date, 'Reversión: ' || trim(p_motivo), -u.monto, u.comprobante, u.id, auth.uid())
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'Ese uso ya fue revertido.' using errcode = 'P0001';
end;
$$;

-- registrar_donacion: igual que antes + fondo opcional.
drop function if exists public.registrar_donacion(uuid, text, numeric, public.metodo_pago, text, text, boolean, text, text, date, text);
create or replace function public.registrar_donacion(
  p_sistema uuid, p_donante text, p_monto numeric, p_metodo public.metodo_pago,
  p_documento text default null, p_contacto text default null, p_anonima boolean default false,
  p_referencia text default null, p_destino text default null, p_fecha date default current_date,
  p_notas text default null, p_fondo uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid := gen_random_uuid();
  v_numero text;
  v_fecha date := coalesce(p_fecha, current_date);
  v_monto numeric := round(coalesce(p_monto, 0), 2);
  v_turno uuid := privado.turno_abierto(p_sistema);
  v_doc text := nullif(regexp_replace(coalesce(p_documento, ''), '\D', '', 'g'), '');
  v_destino text := nullif(trim(p_destino), '');
begin
  if not privado.tiene_rol(p_sistema, '{admin,caja,gerencia}', 'caja') then
    raise exception 'No tienes permiso para registrar donaciones.' using errcode = '42501';
  end if;
  if v_monto <= 0 then
    raise exception 'El monto debe ser mayor que cero.' using errcode = 'P0001';
  end if;
  if v_fecha > current_date then
    raise exception 'La fecha no puede ser futura.' using errcode = 'P0001';
  end if;
  if v_doc is not null and length(v_doc) not in (9, 11) then
    raise exception 'La cédula (11 dígitos) o el RNC (9 dígitos) del donante no es válido.' using errcode = 'P0001';
  end if;
  if p_fondo is not null then
    select coalesce(v_destino, f.nombre) into v_destino from public.fondos f where f.id = p_fondo and f.sistema_id = p_sistema and f.activo;
    if not found then
      raise exception 'El fondo no existe o está cerrado.' using errcode = 'P0001';
    end if;
  end if;
  if v_turno is null and p_metodo = 'efectivo' then
    v_turno := privado.turno_o_abrir(p_sistema);
  end if;

  v_numero := 'DON-' || lpad(privado.siguiente_numero(p_sistema, 'donacion')::text, 6, '0');
  insert into public.donaciones (id, sistema_id, numero, donante_nombre, donante_documento, donante_contacto, anonima,
                                 monto, metodo, referencia, destino, fecha, notas, turno_id, fondo_id)
  values (v_id, p_sistema, v_numero, trim(p_donante), v_doc, nullif(trim(p_contacto), ''), coalesce(p_anonima, false),
          v_monto, p_metodo, nullif(trim(p_referencia), ''), v_destino, v_fecha, nullif(trim(p_notas), ''), v_turno, p_fondo);

  insert into public.movimientos_financieros (sistema_id, turno_id, tipo, categoria, concepto, monto, metodo, creado_por)
  values (p_sistema, v_turno, 'ingreso', 'donacion', 'Donación ' || v_numero, v_monto, p_metodo, auth.uid());

  perform privado.crear_asiento(p_sistema, v_fecha, 'Donación ' || v_numero, 'donacion', v_id, jsonb_build_array(
    jsonb_build_object('cuenta', privado.cuenta_metodo(p_sistema, p_metodo::text), 'debe', v_monto, 'descripcion', 'Donación recibida'),
    jsonb_build_object('cuenta', privado.cuenta(p_sistema, 'ingreso_donaciones'), 'haber', v_monto, 'descripcion', 'Donaciones recibidas')
  ));
  return jsonb_build_object('id', v_id, 'numero', v_numero, 'monto', v_monto);
end;
$function$;

-- 2 ─ Tarifa social: estudio socioeconómico ──────────────────────────────────────
create table if not exists public.estudios_socioeconomicos (
  id                  uuid primary key default gen_random_uuid(),
  sistema_id          uuid not null references public.sistemas (id) on delete restrict,
  paciente_id         uuid not null,
  numero              text not null,
  ingreso_mensual     numeric(14, 2) not null check (ingreso_mensual >= 0),
  miembros            smallint not null check (miembros between 1 and 30),
  vivienda            text check (vivienda in ('propia', 'alquilada', 'prestada', 'otra')),
  ocupacion           text check (char_length(ocupacion) <= 150),
  tiene_seguro        boolean,
  observaciones       text check (char_length(observaciones) <= 2000),
  ingreso_per_capita  numeric(14, 2) not null,
  categoria_sugerida  char(1) not null check (categoria_sugerida in ('A', 'B', 'C', 'D')),
  categoria           char(1) not null check (categoria in ('A', 'B', 'C', 'D')),
  motivo_ajuste       text check (char_length(motivo_ajuste) <= 500),
  descuento_pct       numeric(5, 2) not null check (descuento_pct between 0 and 100),
  vigente_hasta       date not null,
  realizado_por       uuid not null references public.perfiles (id),
  creado_en           timestamptz not null default now(),
  unique (sistema_id, id),
  unique (sistema_id, numero),
  foreign key (sistema_id, paciente_id) references public.pacientes (sistema_id, id),
  check (categoria = categoria_sugerida or motivo_ajuste is not null)
);
create index if not exists ix_estudios_paciente on public.estudios_socioeconomicos (sistema_id, paciente_id, creado_en desc);
create index if not exists ix_estudios_realizado_por on public.estudios_socioeconomicos (realizado_por);

alter table public.estudios_socioeconomicos enable row level security;
-- Datos sensibles: solo quien decide o aplica la tarifa (no lo clínico).
drop policy if exists estudios_select on public.estudios_socioeconomicos;
create policy estudios_select on public.estudios_socioeconomicos for select to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{admin,recepcion,caja,gerencia,auditor}'::public.rol_sistema[])));
revoke all on public.estudios_socioeconomicos from anon, authenticated;
grant select on public.estudios_socioeconomicos to authenticated;
drop trigger if exists trg_estudios_append_only on public.estudios_socioeconomicos;
create trigger trg_estudios_append_only before update or delete on public.estudios_socioeconomicos
  for each row execute function privado.tg_bloquear_append_only();
drop trigger if exists trg_estudios_socioeconomicos_auditoria on public.estudios_socioeconomicos;
create trigger trg_estudios_socioeconomicos_auditoria after insert or update or delete on public.estudios_socioeconomicos
  for each row execute function privado.tg_auditar('sin_datos');

create or replace function public.registrar_estudio_socioeconomico(
  p_sistema uuid, p_paciente uuid, p_ingreso numeric, p_miembros smallint,
  p_vivienda text default null, p_ocupacion text default null, p_seguro boolean default null,
  p_observaciones text default null, p_categoria char(1) default null, p_motivo_ajuste text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg jsonb;
  v_pc numeric;
  v_sug char(1);
  v_cat char(1);
  v_pct numeric;
  v_numero text;
  v_id uuid;
  v_hasta date;
begin
  if not privado.tiene_rol(p_sistema, '{admin,recepcion,caja}'::public.rol_sistema[]) then
    raise exception 'Solo administración, recepción o caja hacen el estudio socioeconómico.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.pacientes where sistema_id = p_sistema and id = p_paciente and eliminado_en is null) then
    raise exception 'El paciente no existe.' using errcode = 'P0002';
  end if;
  if coalesce(p_ingreso, -1) < 0 or coalesce(p_miembros, 0) < 1 then
    raise exception 'Indica el ingreso del hogar y cuántas personas viven de él.' using errcode = '22023';
  end if;
  select tarifa_social into cfg from public.sistemas where id = p_sistema;
  v_pc := round(p_ingreso / p_miembros, 2);
  v_sug := case when v_pc < (cfg -> 'umbrales' ->> 0)::numeric then 'D'
                when v_pc < (cfg -> 'umbrales' ->> 1)::numeric then 'C'
                when v_pc < (cfg -> 'umbrales' ->> 2)::numeric then 'B'
                else 'A' end;
  v_cat := coalesce(nullif(upper(trim(coalesce(p_categoria, ''))), ''), v_sug);
  if v_cat not in ('A', 'B', 'C', 'D') then
    raise exception 'Categoría inválida.' using errcode = '22023';
  end if;
  if v_cat <> v_sug then
    if not privado.tiene_rol(p_sistema, '{admin}'::public.rol_sistema[]) then
      raise exception 'Solo la administración cambia la categoría que da el estudio.' using errcode = '42501';
    end if;
    if char_length(trim(coalesce(p_motivo_ajuste, ''))) < 5 then
      raise exception 'Explica por qué se cambia la categoría.' using errcode = '22023';
    end if;
  end if;
  v_pct := (cfg -> 'descuentos' ->> v_cat)::numeric;
  v_hasta := current_date + make_interval(months => coalesce((cfg ->> 'vigencia_meses')::int, 12));
  v_numero := 'ES-' || lpad(privado.siguiente_numero(p_sistema, 'estudio_socioeconomico')::text, 6, '0');

  insert into public.estudios_socioeconomicos
    (sistema_id, paciente_id, numero, ingreso_mensual, miembros, vivienda, ocupacion, tiene_seguro, observaciones,
     ingreso_per_capita, categoria_sugerida, categoria, motivo_ajuste, descuento_pct, vigente_hasta, realizado_por)
  values
    (p_sistema, p_paciente, v_numero, round(p_ingreso, 2), p_miembros, p_vivienda, nullif(trim(coalesce(p_ocupacion, '')), ''), p_seguro,
     nullif(trim(coalesce(p_observaciones, '')), ''), v_pc, v_sug, v_cat,
     case when v_cat <> v_sug then trim(p_motivo_ajuste) end, v_pct, v_hasta, auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'numero', v_numero, 'categoria', v_cat, 'sugerida', v_sug, 'descuento_pct', v_pct, 'vigente_hasta', v_hasta);
end;
$$;

-- Tarifa social vigente de un paciente (security invoker: la ve quien ve los estudios).
create or replace function public.tarifa_social_paciente(p_sistema uuid, p_paciente uuid)
returns table (id uuid, numero text, categoria char(1), descuento_pct numeric, vigente_hasta date, creado_en timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select e.id, e.numero, e.categoria, e.descuento_pct, e.vigente_hasta, e.creado_en
    from public.estudios_socioeconomicos e
   where e.sistema_id = p_sistema and e.paciente_id = p_paciente and e.vigente_hasta >= current_date
   order by e.creado_en desc, e.numero desc
   limit 1;
$$;

-- 4 ─ Jornadas médicas ──────────────────────────────────────────────────────────
create table if not exists public.jornadas (
  id           uuid primary key default gen_random_uuid(),
  sistema_id   uuid not null references public.sistemas (id) on delete restrict,
  nombre       text not null check (char_length(trim(nombre)) between 3 and 150),
  fecha        date not null,
  lugar        text check (char_length(lugar) <= 200),
  fondo_id     uuid,
  descripcion  text check (char_length(descripcion) <= 1000),
  estado       text not null default 'abierta' check (estado in ('abierta', 'cerrada')),
  creado_por   uuid references public.perfiles (id) default auth.uid(),
  creado_en    timestamptz not null default now(),
  unique (sistema_id, id),
  foreign key (sistema_id, fondo_id) references public.fondos (sistema_id, id)
);
create index if not exists ix_jornadas_fecha on public.jornadas (sistema_id, fecha desc);
create index if not exists ix_jornadas_fondo on public.jornadas (sistema_id, fondo_id) where fondo_id is not null;
create index if not exists ix_jornadas_creado_por on public.jornadas (creado_por);

create table if not exists public.jornada_atenciones (
  id             uuid primary key default gen_random_uuid(),
  sistema_id     uuid not null references public.sistemas (id) on delete restrict,
  jornada_id     uuid not null,
  paciente_id    uuid,
  nombre         text not null check (char_length(trim(nombre)) between 2 and 150),
  documento      text check (char_length(documento) <= 30),
  sexo           text check (sexo in ('F', 'M', 'X')),
  edad           smallint check (edad between 0 and 120),
  motivo         text check (char_length(motivo) <= 500),
  diagnostico    text check (char_length(diagnostico) <= 500),
  servicio       text check (char_length(servicio) <= 150),
  medicamentos   text check (char_length(medicamentos) <= 1000),
  observaciones  text check (char_length(observaciones) <= 1000),
  atendido_por   uuid not null references public.perfiles (id),
  creado_en      timestamptz not null default now(),
  foreign key (sistema_id, jornada_id) references public.jornadas (sistema_id, id),
  foreign key (sistema_id, paciente_id) references public.pacientes (sistema_id, id)
);
create index if not exists ix_jornada_atenciones on public.jornada_atenciones (sistema_id, jornada_id, creado_en);
create index if not exists ix_jornada_atenciones_paciente on public.jornada_atenciones (sistema_id, paciente_id) where paciente_id is not null;
create index if not exists ix_jornada_atenciones_atendido_por on public.jornada_atenciones (atendido_por);

alter table public.jornadas enable row level security;
alter table public.jornada_atenciones enable row level security;

drop policy if exists jornadas_select on public.jornadas;
create policy jornadas_select on public.jornadas for select to authenticated using (sistema_id in (select privado.mis_sistemas()));
drop policy if exists jornadas_insert on public.jornadas;
create policy jornadas_insert on public.jornadas for insert to authenticated
  with check (sistema_id in (select privado.mis_sistemas_con_rol('{admin,gerencia}'::public.rol_sistema[])));
drop policy if exists jornadas_update on public.jornadas;
create policy jornadas_update on public.jornadas for update to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{admin,gerencia}'::public.rol_sistema[])))
  with check (sistema_id in (select privado.mis_sistemas_con_rol('{admin,gerencia}'::public.rol_sistema[])));
-- Las atenciones llevan diagnóstico: solo roles clínicos (y auditoría), como la historia clínica.
drop policy if exists jornada_atenciones_select on public.jornada_atenciones;
create policy jornada_atenciones_select on public.jornada_atenciones for select to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{medico,enfermeria,auditor,psicologia,nutricion,terapia}'::public.rol_sistema[], 'historial')));

revoke all on public.jornadas from anon, authenticated;
revoke all on public.jornada_atenciones from anon, authenticated;
grant select, insert, update (nombre, fecha, lugar, fondo_id, descripcion, estado) on public.jornadas to authenticated;
grant select on public.jornada_atenciones to authenticated;

drop trigger if exists trg_jornada_atenciones_append_only on public.jornada_atenciones;
create trigger trg_jornada_atenciones_append_only before update or delete on public.jornada_atenciones
  for each row execute function privado.tg_bloquear_append_only();
drop trigger if exists trg_jornadas_auditoria on public.jornadas;
create trigger trg_jornadas_auditoria after insert or update or delete on public.jornadas
  for each row execute function privado.tg_auditar();
drop trigger if exists trg_jornada_atenciones_auditoria on public.jornada_atenciones;
create trigger trg_jornada_atenciones_auditoria after insert or update or delete on public.jornada_atenciones
  for each row execute function privado.tg_auditar('sin_datos');

-- Atención en la jornada. Nunca crea pacientes: si la cédula ya tiene ficha, se enlaza.
create or replace function public.registrar_atencion_jornada(
  p_jornada uuid, p_nombre text, p_documento text default null, p_sexo text default null, p_edad smallint default null,
  p_motivo text default null, p_diagnostico text default null, p_servicio text default null,
  p_medicamentos text default null, p_observaciones text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.jornadas;
  v_dig text := nullif(regexp_replace(coalesce(p_documento, ''), '\D', '', 'g'), '');
  v_doc text;
  v_pac uuid;
  v_id uuid;
begin
  select * into j from public.jornadas where id = p_jornada;
  if j.id is null then
    raise exception 'La jornada no existe.' using errcode = 'P0002';
  end if;
  if not privado.tiene_rol(j.sistema_id, '{medico,enfermeria,psicologia,nutricion,terapia}'::public.rol_sistema[], 'historial') then
    raise exception 'Solo el personal clínico registra atenciones.' using errcode = '42501';
  end if;
  if j.estado <> 'abierta' then
    raise exception 'La jornada está cerrada.' using errcode = 'P0001';
  end if;
  if char_length(trim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'Escribe el nombre de la persona atendida.' using errcode = '22023';
  end if;
  if v_dig is not null and length(v_dig) = 11 then
    v_doc := substr(v_dig, 1, 3) || '-' || substr(v_dig, 4, 7) || '-' || substr(v_dig, 11, 1);
    select p.id into v_pac from public.pacientes p
     where p.sistema_id = j.sistema_id and p.documento = v_doc and p.eliminado_en is null limit 1;
  else
    v_doc := nullif(trim(coalesce(p_documento, '')), '');
  end if;
  insert into public.jornada_atenciones
    (sistema_id, jornada_id, paciente_id, nombre, documento, sexo, edad, motivo, diagnostico, servicio, medicamentos, observaciones, atendido_por)
  values
    (j.sistema_id, j.id, v_pac, trim(p_nombre), v_doc, p_sexo, p_edad,
     nullif(trim(coalesce(p_motivo, '')), ''), nullif(trim(coalesce(p_diagnostico, '')), ''), nullif(trim(coalesce(p_servicio, '')), ''),
     nullif(trim(coalesce(p_medicamentos, '')), ''), nullif(trim(coalesce(p_observaciones, '')), ''), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- Resumen de una jornada: solo cifras (sin nombres), para administración y donantes.
create or replace function public.resumen_jornada(p_jornada uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  j public.jornadas;
begin
  select * into j from public.jornadas where id = p_jornada;
  if j.id is null or not (j.sistema_id in (select privado.mis_sistemas())) then
    raise exception 'Jornada no encontrada.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'atenciones', (select count(*) from public.jornada_atenciones a where a.jornada_id = j.id),
    'mujeres', (select count(*) from public.jornada_atenciones a where a.jornada_id = j.id and a.sexo = 'F'),
    'hombres', (select count(*) from public.jornada_atenciones a where a.jornada_id = j.id and a.sexo = 'M'),
    'menores', (select count(*) from public.jornada_atenciones a where a.jornada_id = j.id and a.edad < 18),
    'mayores', (select count(*) from public.jornada_atenciones a where a.jornada_id = j.id and a.edad >= 65),
    'con_ficha', (select count(*) from public.jornada_atenciones a where a.jornada_id = j.id and a.paciente_id is not null),
    'profesionales', (select count(distinct a.atendido_por) from public.jornada_atenciones a where a.jornada_id = j.id),
    'diagnosticos', coalesce((select jsonb_agg(x order by x.n desc) from (
        select initcap(lower(trim(a.diagnostico))) as diagnostico, count(*) n from public.jornada_atenciones a
         where a.jornada_id = j.id and a.diagnostico is not null group by 1 order by 2 desc limit 10) x), '[]'::jsonb),
    'servicios', coalesce((select jsonb_agg(x order by x.n desc) from (
        select initcap(lower(trim(a.servicio))) as servicio, count(*) n from public.jornada_atenciones a
         where a.jornada_id = j.id and a.servicio is not null group by 1 order by 2 desc limit 10) x), '[]'::jsonb)
  );
end;
$$;

-- 5 ─ Reporte de la fundación (donantes / CASFL) ─────────────────────────────────
create or replace function public.reporte_fundacion(p_sistema uuid, p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not privado.tiene_rol(p_sistema, '{admin,gerencia,contabilidad,auditor}'::public.rol_sistema[]) then
    raise exception 'Solo administración, gerencia, contabilidad o auditoría ven el reporte.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'periodo', jsonb_build_object('desde', p_desde, 'hasta', p_hasta),
    'donaciones', (
      select jsonb_build_object('total', coalesce(sum(d.monto), 0), 'cantidad', count(*),
                                'donantes', count(distinct coalesce(d.donante_documento, lower(d.donante_nombre))) filter (where not d.anonima))
        from public.donaciones d
       where d.sistema_id = p_sistema and d.fecha between p_desde and p_hasta
         and not exists (select 1 from public.anulaciones_donacion a where a.donacion_id = d.id)),
    'por_donante', coalesce((
      select jsonb_agg(x order by x.total desc) from (
        select case when d.anonima then 'Anónimo' else d.donante_nombre end as donante, sum(d.monto) total, count(*) n
          from public.donaciones d
         where d.sistema_id = p_sistema and d.fecha between p_desde and p_hasta
           and not exists (select 1 from public.anulaciones_donacion a where a.donacion_id = d.id)
         group by 1 order by 2 desc limit 25) x), '[]'::jsonb),
    'fondos', coalesce((
      select jsonb_agg(x order by x.nombre) from (
        select f.nombre, f.restringido,
               coalesce((select sum(d.monto) from public.donaciones d where d.fondo_id = f.id and d.fecha between p_desde and p_hasta
                          and not exists (select 1 from public.anulaciones_donacion a where a.donacion_id = d.id)), 0) recibido,
               coalesce((select sum(u.monto) from public.fondo_usos u where u.fondo_id = f.id and u.fecha between p_desde and p_hasta), 0) usado,
               privado.saldo_fondo(f.id) saldo
          from public.fondos f where f.sistema_id = p_sistema) x), '[]'::jsonb),
    'beneficiarios', jsonb_build_object(
      'pacientes', (select count(distinct c.paciente_id) from public.citas c
                     where c.sistema_id = p_sistema and c.estado = 'completada'
                       and (c.inicio at time zone 'America/Santo_Domingo')::date between p_desde and p_hasta),
      'consultas', (select count(*) from public.citas c
                     where c.sistema_id = p_sistema and c.estado = 'completada'
                       and (c.inicio at time zone 'America/Santo_Domingo')::date between p_desde and p_hasta),
      'jornadas', (select count(*) from public.jornadas j where j.sistema_id = p_sistema and j.fecha between p_desde and p_hasta),
      'atenciones_jornadas', (select count(*) from public.jornada_atenciones a join public.jornadas j on j.id = a.jornada_id
                               where a.sistema_id = p_sistema and j.fecha between p_desde and p_hasta)),
    'valor_social', jsonb_build_object(
      -- Descuentos dados a pacientes con estudio socioeconómico vigente ese día (tarifa social).
      'tarifa_social', coalesce((
        select sum(c.descuento) from public.cobros c
         where c.sistema_id = p_sistema and c.descuento > 0
           and (c.creado_en at time zone 'America/Santo_Domingo')::date between p_desde and p_hasta
           and not exists (select 1 from public.anulaciones_cobro an where an.cobro_id = c.id)
           and exists (select 1 from public.estudios_socioeconomicos e
                        where e.sistema_id = c.sistema_id and e.paciente_id = c.paciente_id
                          and e.creado_en <= c.creado_en and e.vigente_hasta >= (c.creado_en at time zone 'America/Santo_Domingo')::date)), 0),
      'otros_descuentos', coalesce((
        select sum(c.descuento) from public.cobros c
         where c.sistema_id = p_sistema and c.descuento > 0
           and (c.creado_en at time zone 'America/Santo_Domingo')::date between p_desde and p_hasta
           and not exists (select 1 from public.anulaciones_cobro an where an.cobro_id = c.id)
           and not exists (select 1 from public.estudios_socioeconomicos e
                            where e.sistema_id = c.sistema_id and e.paciente_id = c.paciente_id
                              and e.creado_en <= c.creado_en and e.vigente_hasta >= (c.creado_en at time zone 'America/Santo_Domingo')::date)), 0),
      'exonerados', (select count(*) from public.citas c
                      where c.sistema_id = p_sistema and c.exonerado_por is not null
                        and (c.inicio at time zone 'America/Santo_Domingo')::date between p_desde and p_hasta),
      'estudios', coalesce((select jsonb_object_agg(categoria, n) from (
                    select e.categoria, count(*) n from public.estudios_socioeconomicos e
                     where e.sistema_id = p_sistema and (e.creado_en at time zone 'America/Santo_Domingo')::date between p_desde and p_hasta
                     group by 1) x), '{}'::jsonb)),
    'voluntarios', jsonb_build_object(
      'personas', (select count(*) from public.membresias m where m.sistema_id = p_sistema and m.voluntario and m.activo and m.eliminado_en is null),
      'consultas', (select count(*) from public.citas c
                     join public.membresias m on m.sistema_id = c.sistema_id and m.usuario_id = c.medico_id and m.voluntario
                    where c.sistema_id = p_sistema and c.estado = 'completada'
                      and (c.inicio at time zone 'America/Santo_Domingo')::date between p_desde and p_hasta))
  );
end;
$$;

revoke all on function public.guardar_tarifa_social(uuid, jsonb) from public, anon;
revoke all on function public.fondos_resumen(uuid) from public, anon;
revoke all on function public.aplicar_fondo(uuid, uuid, numeric, text, date, text) from public, anon;
revoke all on function public.revertir_uso_fondo(uuid, text) from public, anon;
revoke all on function public.registrar_donacion(uuid, text, numeric, public.metodo_pago, text, text, boolean, text, text, date, text, uuid) from public, anon;
revoke all on function public.registrar_estudio_socioeconomico(uuid, uuid, numeric, smallint, text, text, boolean, text, char, text) from public, anon;
revoke all on function public.tarifa_social_paciente(uuid, uuid) from public, anon;
revoke all on function public.registrar_atencion_jornada(uuid, text, text, text, smallint, text, text, text, text, text) from public, anon;
revoke all on function public.resumen_jornada(uuid) from public, anon;
revoke all on function public.reporte_fundacion(uuid, date, date) from public, anon;
revoke all on function privado.es_voluntario(uuid, uuid) from public, anon, authenticated;
revoke all on function privado.saldo_fondo(uuid) from public, anon, authenticated;

grant execute on function public.guardar_tarifa_social(uuid, jsonb) to authenticated;
grant execute on function public.fondos_resumen(uuid) to authenticated;
grant execute on function public.aplicar_fondo(uuid, uuid, numeric, text, date, text) to authenticated;
grant execute on function public.revertir_uso_fondo(uuid, text) to authenticated;
grant execute on function public.registrar_donacion(uuid, text, numeric, public.metodo_pago, text, text, boolean, text, text, date, text, uuid) to authenticated;
grant execute on function public.registrar_estudio_socioeconomico(uuid, uuid, numeric, smallint, text, text, boolean, text, char, text) to authenticated;
grant execute on function public.tarifa_social_paciente(uuid, uuid) to authenticated;
grant execute on function public.registrar_atencion_jornada(uuid, text, text, text, smallint, text, text, text, text, text) to authenticated;
grant execute on function public.resumen_jornada(uuid) to authenticated;
grant execute on function public.reporte_fundacion(uuid, date, date) to authenticated;
