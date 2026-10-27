-- ============================================================================
-- Nota de crédito electrónica (E34): la forma legal de anular un cobro cuyo
-- e-CF ya llegó a la DGII.
--
-- trg_anulaciones_respeta_ecf impedía anular esos cobros y no había alternativa.
-- Ahora emitir_nota_credito(p_cobro, p_motivo):
--   1. exige que el e-CF original esté aceptado (o aceptado condicional),
--   2. toma un e-NCF de la secuencia E34 y crea su documento (pendiente de envío),
--      enlazado al original (nota_de) con el código de modificación 1 (anulación total),
--   3. anula el cobro con anular_cobro (reverso de asientos, comisiones, caja).
-- El candado de anulaciones deja pasar el cobro solo si ya tiene su E34: no
-- depende de variables de sesión que un cliente pudiera fijar.
-- La Edge Function "ecf" arma el XML de la E34 con InformacionReferencia.
-- ============================================================================

alter table public.ecf_documentos
  add column nota_de uuid,
  add column codigo_modificacion smallint check (codigo_modificacion between 1 and 5),
  add column motivo text check (char_length(motivo) <= 90),
  add constraint ecf_documentos_nota_de_fkey foreign key (sistema_id, nota_de) references public.ecf_documentos (sistema_id, id),
  add constraint ecf_documentos_nota_check check ((tipo = 'E34') = (nota_de is not null));

-- Un cobro tiene su comprobante y, como mucho, una nota de crédito que lo anula.
alter table public.ecf_documentos drop constraint ecf_documentos_cobro_id_key;
create unique index ux_ecf_documentos_cobro on public.ecf_documentos (cobro_id) where tipo <> 'E34';
create unique index ux_ecf_documentos_cobro_nota on public.ecf_documentos (cobro_id) where tipo = 'E34';
create index ix_fk_ecf_documentos_nota_de on public.ecf_documentos (sistema_id, nota_de);

create or replace function privado.tg_anulacion_respeta_ecf()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- La anulación que acompaña a su nota de crédito (creada antes en la misma transacción) sí pasa.
  if exists (select 1 from public.ecf_documentos d where d.cobro_id = new.cobro_id and d.tipo = 'E34') then
    return new;
  end if;
  if exists (select 1 from public.ecf_documentos d
              where d.cobro_id = new.cobro_id and d.tipo <> 'E34' and d.estado in ('enviado', 'aceptado', 'aceptado_condicional')) then
    raise exception 'Este cobro tiene un comprobante electrónico enviado a la DGII: anúlalo con una nota de crédito (E34).' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace function public.emitir_nota_credito(p_cobro uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cobro  public.cobros;
  v_doc    public.ecf_documentos;
  v_encf   text;
  v_id     uuid := gen_random_uuid();
  v_motivo text := nullif(trim(p_motivo), '');
begin
  select * into v_cobro from public.cobros where id = p_cobro;
  -- Mismo permiso que anular un cobro: la nota de crédito ES la anulación de un cobro con e-CF.
  if v_cobro.id is null or not privado.tiene_rol(v_cobro.sistema_id, '{caja,admin}', 'caja') then
    raise exception 'Cobro no encontrado o sin permiso.' using errcode = '42501';
  end if;
  if v_motivo is null or char_length(v_motivo) < 3 then
    raise exception 'Escribe el motivo de la nota de crédito.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('nota_credito:' || p_cobro::text, 0));

  select * into v_doc from public.ecf_documentos where cobro_id = p_cobro and tipo <> 'E34';
  if v_doc.id is null then
    raise exception 'Ese cobro no tiene comprobante electrónico: anúlalo normalmente.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.ecf_documentos where cobro_id = p_cobro and tipo = 'E34') then
    raise exception 'Ese cobro ya tiene su nota de crédito.' using errcode = 'P0001';
  end if;
  if v_doc.estado not in ('aceptado', 'aceptado_condicional') then
    raise exception 'El comprobante % está «%»: espera la respuesta de la DGII (o, si fue rechazado, anula el cobro normalmente).',
      v_doc.encf, v_doc.estado using errcode = 'P0001';
  end if;
  if exists (select 1 from public.anulaciones_cobro where cobro_id = p_cobro) then
    raise exception 'Ese cobro ya fue anulado.' using errcode = 'P0001';
  end if;

  v_encf := privado.siguiente_ncf(v_cobro.sistema_id, 'E34');
  insert into public.ecf_documentos (id, sistema_id, cobro_id, encf, tipo, monto_total, resumen, nota_de, codigo_modificacion, motivo)
  values (v_id, v_cobro.sistema_id, p_cobro, v_encf, 'E34', v_doc.monto_total, false, v_doc.id, 1, left(v_motivo, 90));

  perform public.anular_cobro(p_cobro, left('Nota de crédito ' || v_encf || ': ' || v_motivo, 300));

  return jsonb_build_object('id', v_id, 'encf', v_encf, 'modifica', v_doc.encf, 'monto', v_doc.monto_total);
end;
$$;

revoke all on function public.emitir_nota_credito(uuid, text) from public, anon;
grant execute on function public.emitir_nota_credito(uuid, text) to authenticated;
