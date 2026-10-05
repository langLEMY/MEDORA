-- ============================================================================
-- MEDORA . Inteligencia artificial: base común
--
-- La IA corre en la Edge Function "ia" (API de Claude, clave ANTHROPIC_API_KEY
-- como secreto de la función). La paga MEDORA, así que solo la superadministración
-- la activa por hospital y le pone un tope mensual en dólares (lo que cobra el
-- proveedor). La IA propone; una persona confirma: nunca escribe datos por su cuenta.
--
--   · sistemas.ia_activa / ia_tope_mensual_usd: se editan en "Sistema y sedes"
--     (RLS sistemas_update ya es solo superadmin).
--   · ia_eventos: bitácora append-only de cada uso (quién, para qué, tokens,
--     costo, si salió bien). Nunca guarda el contenido enviado ni la respuesta.
--   · ia_consumo_mes / registrar_uso_ia: solo service_role (los usa la función).
-- ============================================================================

alter table public.sistemas
  add column ia_activa boolean not null default false,
  add column ia_tope_mensual_usd numeric(10, 2) not null default 20 check (ia_tope_mensual_usd >= 0);

create table public.ia_eventos (
  id              uuid primary key default gen_random_uuid(),
  sistema_id      uuid not null references public.sistemas(id) on delete restrict,
  usuario_id      uuid,
  funcion         text not null check (funcion in ('prueba', 'importar', 'preguntar', 'resumen_cierre')),
  modelo          text not null,
  tokens_entrada  integer not null default 0 check (tokens_entrada >= 0),
  tokens_salida   integer not null default 0 check (tokens_salida >= 0),
  costo_usd       numeric(12, 6) not null default 0 check (costo_usd >= 0),
  ok              boolean not null,
  error           text,
  creado_en       timestamptz not null default now()
);
create index ix_ia_eventos on public.ia_eventos (sistema_id, creado_en desc);
create trigger trg_ia_eventos_append_only before update or delete on public.ia_eventos
  for each row execute function privado.tg_bloquear_append_only();

alter table public.ia_eventos enable row level security;
revoke all on public.ia_eventos from anon, authenticated;
grant select on public.ia_eventos to authenticated;
create policy ia_eventos_select on public.ia_eventos for select to authenticated
  using (sistema_id in (select privado.sistemas_administrables()));

-- Gasto del mes en curso (mes de Santo Domingo).
create or replace function public.ia_consumo_mes(p_sistema uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(e.costo_usd), 0)
    from public.ia_eventos e
   where e.sistema_id = p_sistema
     and e.creado_en >= (date_trunc('month', now() at time zone 'America/Santo_Domingo') at time zone 'America/Santo_Domingo');
$$;
revoke all on function public.ia_consumo_mes(uuid) from public, anon, authenticated;
grant execute on function public.ia_consumo_mes(uuid) to service_role;

create or replace function public.registrar_uso_ia(
  p_sistema uuid,
  p_usuario uuid,
  p_funcion text,
  p_modelo text,
  p_entrada integer,
  p_salida integer,
  p_costo numeric,
  p_ok boolean,
  p_error text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.ia_eventos (sistema_id, usuario_id, funcion, modelo, tokens_entrada, tokens_salida, costo_usd, ok, error)
  values (p_sistema, p_usuario, p_funcion, p_modelo, coalesce(p_entrada, 0), coalesce(p_salida, 0), coalesce(p_costo, 0), p_ok, left(p_error, 500));
$$;
revoke all on function public.registrar_uso_ia(uuid, uuid, text, text, integer, integer, numeric, boolean, text) from public, anon, authenticated;
grant execute on function public.registrar_uso_ia(uuid, uuid, text, text, integer, integer, numeric, boolean, text) to service_role;
