-- ============================================================================
-- Salud de la plataforma: ¿corrieron las tareas automáticas?
--
-- Los pg_cron que llaman Edge Functions (respaldo, e-CF) "salen bien" aunque la
-- función falle, porque solo encolan un net.http_post. Por eso se mira el
-- resultado real: la fila de `respaldos`, el `resumenes_diarios` del día y los
-- e-CF atascados, además del estado de cada corrida en cron.job_run_details.
--
-- privado.problemas_plataforma() → arreglo de problemas (vacío = todo bien).
-- public.salud_tareas()          → detalle para Mi perfil → Soporte (superadmin aal2).
-- mis_avisos                     → un aviso en la campana del superadmin si hay problemas.
-- Sin datos clínicos ni montos: solo conteos y horas.
-- ============================================================================

create or replace function privado.estado_tareas()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'tarea', j.jobname,
           'horario', j.schedule,
           'activa', j.active,
           'ultima', u.start_time,
           'estado', u.status,
           'mensaje', left(u.return_message, 200),
           'fallas_24h', coalesce(f.n, 0),
           -- Tolerancia: diarias 26 h, cada 10 min 1 h. Una tarea recién creada que aún no corre no cuenta.
           'atrasada', u.start_time < now() - case when j.schedule like '*/%' then interval '1 hour' else interval '26 hours' end
         ) order by j.jobname), '[]'::jsonb)
    from cron.job j
    left join lateral (select d.start_time, d.status, d.return_message from cron.job_run_details d
                        where d.jobid = j.jobid order by d.start_time desc limit 1) u on true
    left join lateral (select count(*) n from cron.job_run_details d
                        where d.jobid = j.jobid and d.status = 'failed' and d.start_time > now() - interval '24 hours') f on true
   where j.jobname like 'medora-%';
$$;

create or replace function privado.problemas_plataforma()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb := '[]'::jsonb;
  t jsonb;
  v_resp record;
  v_n integer;
begin
  for t in select * from jsonb_array_elements(privado.estado_tareas()) loop
    if (t ->> 'activa')::boolean is false then
      v := v || jsonb_build_object('tarea', t ->> 'tarea', 'titulo', 'Tarea ' || (t ->> 'tarea') || ' desactivada');
    elsif t ->> 'estado' = 'failed' then
      v := v || jsonb_build_object('tarea', t ->> 'tarea', 'titulo', 'Falló ' || (t ->> 'tarea'), 'detalle', t ->> 'mensaje');
    elsif (t ->> 'atrasada')::boolean then
      v := v || jsonb_build_object('tarea', t ->> 'tarea', 'titulo', (t ->> 'tarea') || ' no corre desde ' ||
        to_char((t ->> 'ultima')::timestamptz at time zone 'America/Santo_Domingo', 'DD/MM HH24:MI'));
    end if;
  end loop;

  -- Respaldo: el cron "sale bien" aunque la Edge Function falle; se mira la fila real.
  select r.creado_en, r.estado, r.error into v_resp from public.respaldos r order by r.creado_en desc limit 1;
  if v_resp is null or v_resp.creado_en < now() - interval '26 hours' then
    v := v || jsonb_build_object('tarea', 'respaldo', 'titulo', 'Sin respaldo en las últimas 26 h');
  elsif v_resp.estado = 'error' then
    v := v || jsonb_build_object('tarea', 'respaldo', 'titulo', 'El último respaldo falló', 'detalle', left(v_resp.error, 200));
  end if;

  -- e-CF atascados más de 2 h (todos los sistemas; solo el conteo).
  select count(*) into v_n from public.ecf_documentos where estado = 'pendiente' and creado_en < now() - interval '2 hours';
  if v_n > 0 then
    v := v || jsonb_build_object('tarea', 'ecf', 'titulo', v_n || ' e-CF sin enviar hace más de 2 h');
  end if;

  return v;
end;
$$;

revoke all on function privado.estado_tareas() from public, anon, authenticated;
revoke all on function privado.problemas_plataforma() from public, anon, authenticated;

create or replace function public.salud_tareas()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_resp jsonb;
begin
  if not privado.es_superadmin() then
    raise exception 'Solo la superadministración ve la salud de la plataforma' using errcode = '42501';
  end if;
  select to_jsonb(x) into v_resp from (
    select r.creado_en, r.estado, r.origen, r.bytes, r.duracion_ms, left(r.error, 200) error
      from public.respaldos r order by r.creado_en desc limit 1) x;
  return jsonb_build_object(
    'tareas', privado.estado_tareas(),
    'ultimo_respaldo', v_resp,
    'problemas', privado.problemas_plataforma(),
    'revisado_en', now());
end;
$$;

revoke all on function public.salud_tareas() from public, anon;
grant execute on function public.salud_tareas() to authenticated;

create or replace function public.mis_avisos(p_sistema uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_avisos jsonb := '[]'::jsonb;
  v_hoy timestamptz := (date_trunc('day', now() at time zone 'America/Santo_Domingo') at time zone 'America/Santo_Domingo');
  v_n integer;
  v_m integer;
  v_detalle text;
begin
  -- Plataforma (solo superadmin en aal2): respaldos, cierres y envíos a la DGII que no corrieron.
  -- Va antes del filtro de membresía: el superadmin lo ve en cualquier sistema que abra.
  if privado.es_superadmin() then
    select count(*), string_agg(p ->> 'titulo', ' · ') into v_n, v_detalle from jsonb_array_elements(privado.problemas_plataforma()) p;
    if v_n > 0 then
      v_avisos := v_avisos || jsonb_build_object('clave', 'salud_plataforma', 'nivel', 'peligro', 'cantidad', v_n,
        'titulo', case when v_n = 1 then '1 tarea automática con problemas' else v_n || ' tareas automáticas con problemas' end,
        'detalle', left(v_detalle, 160) || case when length(v_detalle) > 160 then '…' else '' end,
        'enlace', '/perfil?vista=soporte');
    end if;
  end if;

  if p_sistema not in (select privado.mis_sistemas()) then
    return v_avisos;
  end if;

  -- Facturación electrónica ----------------------------------------------------
  if privado.tiene_rol(p_sistema, '{admin,contabilidad,caja,gerencia}', 'caja') then
    select count(*) filter (where estado in ('rechazado', 'error')),
           count(*) filter (where estado = 'pendiente' and creado_en < now() - interval '1 hour')
      into v_n, v_m
      from public.ecf_documentos
     where sistema_id = p_sistema;
    if v_n > 0 then
      v_avisos := v_avisos || jsonb_build_object('clave', 'ecf_rechazados', 'nivel', 'peligro', 'cantidad', v_n,
        'titulo', case when v_n = 1 then '1 factura electrónica rechazada' else v_n || ' facturas electrónicas rechazadas' end,
        'detalle', 'La DGII no las aceptó o hubo un error al enviarlas. Revísalas en Comprobantes fiscales.',
        'enlace', '/contabilidad?vista=ncf');
    end if;
    if v_m > 0 then
      v_avisos := v_avisos || jsonb_build_object('clave', 'ecf_pendientes', 'nivel', 'aviso', 'cantidad', v_m,
        'titulo', case when v_m = 1 then '1 factura electrónica sin enviar' else v_m || ' facturas electrónicas sin enviar' end,
        'detalle', 'Llevan más de una hora pendientes de envío a la DGII.',
        'enlace', '/contabilidad?vista=ncf');
    end if;

    -- Comprobantes fiscales por agotarse (≤ 10 % del rango o ≤ 50) o por vencer (≤ 30 días)
    select count(*),
           string_agg(s.tipo || ': ' ||
             case when s.vence_en is not null and s.vence_en <= (v_hoy::date + 30) and (s.hasta - s.siguiente + 1) > greatest(50, (s.hasta - s.desde + 1) / 10)
                  then 'vence el ' || to_char(s.vence_en, 'DD/MM/YYYY')
                  else greatest(s.hasta - s.siguiente + 1, 0) || ' disponibles' end, ' · ' order by s.tipo)
      into v_n, v_detalle
      from public.secuencias_ncf s
     where s.sistema_id = p_sistema and s.activo
       and ((s.hasta - s.siguiente + 1) <= greatest(50, (s.hasta - s.desde + 1) / 10)
            or (s.vence_en is not null and s.vence_en <= (v_hoy::date + 30)));
    if v_n > 0 then
      v_avisos := v_avisos || jsonb_build_object('clave', 'ncf_agotandose', 'nivel', 'aviso', 'cantidad', v_n,
        'titulo', 'Comprobantes fiscales por agotarse',
        'detalle', v_detalle || '. Solicita más a la DGII.',
        'enlace', '/contabilidad?vista=ncf');
    end if;
  end if;

  -- Caja: turno abierto desde ayer ----------------------------------------------
  select count(*) into v_n
    from public.turnos_caja
   where sistema_id = p_sistema and estado = 'abierto' and cajero_id = (select auth.uid()) and abierto_en < v_hoy;
  if v_n > 0 then
    v_avisos := v_avisos || jsonb_build_object('clave', 'turno_propio', 'nivel', 'aviso', 'cantidad', v_n,
      'titulo', 'Tu turno de caja sigue abierto desde ayer',
      'detalle', 'Ciérralo con el arqueo antes de seguir cobrando.',
      'enlace', '/caja');
  end if;
  if privado.tiene_rol(p_sistema, '{admin,gerencia,contabilidad}', 'caja') then
    select count(*) into v_n
      from public.turnos_caja
     where sistema_id = p_sistema and estado = 'abierto' and abierto_en < v_hoy and cajero_id <> (select auth.uid());
    if v_n > 0 then
      v_avisos := v_avisos || jsonb_build_object('clave', 'turnos_abiertos', 'nivel', 'aviso', 'cantidad', v_n,
        'titulo', case when v_n = 1 then '1 turno de caja sin cerrar' else v_n || ' turnos de caja sin cerrar' end,
        'detalle', 'Hay cajeros con el turno abierto desde un día anterior.',
        'enlace', '/caja');
    end if;
  end if;

  -- Laboratorio: resultados sin asignar -------------------------------------------
  if privado.tiene_rol(p_sistema, '{medico,enfermeria}', 'historial') and p_sistema in (select privado.sistemas_vista_completa()) then
    select count(*) into v_n from public.resultados_laboratorio where sistema_id = p_sistema and estado = 'recibido';
    if v_n > 0 then
      v_avisos := v_avisos || jsonb_build_object('clave', 'laboratorio', 'nivel', 'info', 'cantidad', v_n,
        'titulo', case when v_n = 1 then '1 resultado de laboratorio sin asignar' else v_n || ' resultados de laboratorio sin asignar' end,
        'detalle', 'Llegaron sin coincidir con ningún paciente. Asígnalos desde Pacientes.',
        'enlace', '/pacientes');
    end if;
  end if;

  -- Inventario bajo mínimo -------------------------------------------------------------
  if privado.tiene_rol(p_sistema, '{admin,farmacia,enfermeria,gerencia}', 'inventario') then
    select count(*), string_agg(nombre, ', ' order by stock_actual - stock_minimo) filter (where true)
      into v_n, v_detalle
      from (select nombre, stock_actual, stock_minimo from public.inventario_items
             where sistema_id = p_sistema and activo and stock_minimo > 0 and stock_actual <= stock_minimo
             order by stock_actual - stock_minimo limit 50) b;
    if v_n > 0 then
      v_avisos := v_avisos || jsonb_build_object('clave', 'stock_bajo', 'nivel', 'aviso', 'cantidad', v_n,
        'titulo', case when v_n = 1 then '1 producto bajo el mínimo' else v_n || ' productos bajo el mínimo' end,
        'detalle', left(v_detalle, 160) || case when length(v_detalle) > 160 then '…' else '' end,
        'enlace', '/inventario');
    end if;
  end if;

  return v_avisos;
end;
$$;

revoke all on function public.mis_avisos(uuid) from public, anon;
grant execute on function public.mis_avisos(uuid) to authenticated;
