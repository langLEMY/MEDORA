-- ============================================================================
-- MEDORA · El turno de caja se abre solo con el primer cobro
--
-- Cada sistema define su fondo de caja fijo (FUNBIDE: RD$2,000). Ya no hay que
-- abrir el turno a mano: el primer cobro del cajero lo abre con ese fondo. Los
-- anticipos y abonos lo abren solo si entran en efectivo (un abono de una ARS
-- por transferencia que registra contabilidad no debe abrir una caja).
-- ============================================================================
alter table public.sistemas
  add column fondo_caja numeric(12, 2) not null default 2000 check (fondo_caja >= 0);

comment on column public.sistemas.fondo_caja is 'Efectivo fijo con el que se abre cada turno de caja.';

-- Turno abierto del cajero actual; si no tiene, lo abre con el fondo del sistema.
-- Solo la llaman RPC de caja que ya validaron el rol.
create or replace function privado.turno_o_abrir(p_sistema uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno uuid := privado.turno_abierto(p_sistema);
begin
  if v_turno is null then
    begin
      insert into public.turnos_caja (sistema_id, cajero_id, monto_apertura)
      values (p_sistema, auth.uid(), coalesce((select s.fondo_caja from public.sistemas s where s.id = p_sistema), 0))
      returning id into v_turno;
    exception when unique_violation then
      -- Otra pestaña del mismo cajero lo abrió a la vez.
      v_turno := privado.turno_abierto(p_sistema);
    end;
  end if;
  return v_turno;
end;
$$;

revoke all on function privado.turno_o_abrir(uuid) from public, anon;

-- abrir_turno_caja manual: si no se indica monto, usa el fondo del sistema.
create or replace function public.abrir_turno_caja(p_sistema uuid, p_monto_apertura numeric default null, p_sede uuid default null)
returns public.turnos_caja
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno public.turnos_caja;
begin
  if not privado.tiene_rol(p_sistema, '{caja,admin}', 'caja') then
    raise exception 'No tienes permiso para operar caja en este sistema.' using errcode = '42501';
  end if;

  insert into public.turnos_caja (sistema_id, sede_id, cajero_id, monto_apertura)
  values (p_sistema, p_sede, auth.uid(),
          coalesce(p_monto_apertura, (select s.fondo_caja from public.sistemas s where s.id = p_sistema), 0))
  returning * into v_turno;
  return v_turno;
exception when unique_violation then
  raise exception 'Ya tienes un turno de caja abierto.' using errcode = 'P0001';
end;
$$;

-- Cobros, anticipos y abonos ------------------------------------------------
do $$
declare
  v_def text;
  v_nueva text;
begin
  -- Cobro: siempre abre turno si no hay.
  v_def := pg_get_functiondef('public.registrar_cobro'::regproc);
  v_nueva := replace(v_def,
    'where id = privado.turno_abierto(p_sistema);',
    'where id = privado.turno_o_abrir(p_sistema);');
  if v_nueva = v_def then
    raise exception 'registrar_cobro no tiene la búsqueda de turno esperada.';
  end if;
  execute v_nueva;

  -- Anticipo y abono: solo si entra efectivo (tras validar rol y fecha).
  v_def := pg_get_functiondef('public.registrar_anticipo'::regproc);
  v_nueva := regexp_replace(v_def,
    '(raise exception ''La fecha no puede ser futura\.'' using errcode = ''P0001'';\s*end if;)',
    E'\\1\n  if v_turno is null and p_metodo = ''efectivo'' then\n    v_turno := privado.turno_o_abrir(p_sistema);\n  end if;');
  if v_nueva = v_def then
    raise exception 'registrar_anticipo no tiene la validación de fecha esperada.';
  end if;
  execute v_nueva;

  v_def := pg_get_functiondef('public.registrar_abono'::regproc);
  v_nueva := regexp_replace(v_def,
    '(raise exception ''La fecha no puede ser futura\.'' using errcode = ''P0001'';\s*end if;)',
    E'\\1\n  if v_turno is null and p_metodo = ''efectivo'' then\n    v_turno := privado.turno_o_abrir(p_sistema);\n  end if;');
  if v_nueva = v_def then
    raise exception 'registrar_abono no tiene la validación de fecha esperada.';
  end if;
  execute v_nueva;
end;
$$;
