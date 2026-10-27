-- ============================================================================
-- Rendimiento (advisors de Supabase, 27/10/2026)
--   * 21 claves foráneas sin índice que las cubra: borrar o actualizar la fila padre
--     (y los joins por esa FK) recorrían la tabla hija entera.
--   * camas / habitaciones: la política "for all" de escritura también aplicaba al
--     SELECT, así que cada lectura evaluaba dos políticas. Se separa por acción.
-- No se borran los índices "sin uso": varios son de módulos nuevos (laboratorio,
-- farmacia, soporte) que todavía no tienen tráfico.
-- ============================================================================

create index if not exists ix_fk_admisiones_cama on public.admisiones (sistema_id, cama_id);
create index if not exists ix_fk_admisiones_paciente on public.admisiones (sistema_id, paciente_id);
create index if not exists ix_fk_ars_pagos_items_cobro on public.ars_pagos_items (sistema_id, cobro_id);
create index if not exists ix_fk_ars_pagos_items_lote on public.ars_pagos_items (sistema_id, lote_id);
create index if not exists ix_fk_ars_pagos_lotes_aseguradora on public.ars_pagos_lotes (sistema_id, aseguradora_id);
create index if not exists ix_fk_asiento_lineas_asiento on public.asiento_lineas (sistema_id, asiento_id);
create index if not exists ix_fk_conciliaciones_sistema on public.conciliaciones_bancarias (sistema_id);
create index if not exists ix_fk_conciliaciones_movimiento on public.conciliaciones_bancarias (sistema_id, movimiento_id);
create index if not exists ix_fk_ecf_documentos_cobro on public.ecf_documentos (sistema_id, cobro_id);
create index if not exists ix_fk_errores_cliente_sistema on public.errores_cliente (sistema_id);
create index if not exists ix_fk_farmacia_controlados_item on public.farmacia_controlados (item_id);
create index if not exists ix_fk_farmacia_lotes_item on public.farmacia_lotes (item_id);
create index if not exists ix_fk_lab_orden_items_sistema on public.laboratorio_orden_items (sistema_id);
create index if not exists ix_fk_lab_orden_items_orden on public.laboratorio_orden_items (sistema_id, orden_id);
create index if not exists ix_fk_lab_orden_items_prueba on public.laboratorio_orden_items (sistema_id, prueba_id);
create index if not exists ix_fk_lab_ordenes_paciente on public.laboratorio_ordenes (sistema_id, paciente_id);
create index if not exists ix_fk_mensajes_soporte_autor on public.mensajes_soporte (autor_id);
create index if not exists ix_fk_mensajes_soporte_solicitud on public.mensajes_soporte (sistema_id, solicitud_id);
create index if not exists ix_fk_reacciones_soporte_mensaje on public.reacciones_soporte (sistema_id, mensaje_id);
create index if not exists ix_fk_reacciones_soporte_solicitud on public.reacciones_soporte (sistema_id, solicitud_id);
create index if not exists ix_fk_reacciones_soporte_usuario on public.reacciones_soporte (usuario_id);

-- Una política por acción: el SELECT evalúa solo la de lectura.
drop policy habitaciones_cud on public.habitaciones;
create policy habitaciones_insert on public.habitaciones for insert to authenticated
  with check (sistema_id in (select privado.mis_sistemas_con_rol('{admin}')));
create policy habitaciones_update on public.habitaciones for update to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{admin}')))
  with check (sistema_id in (select privado.mis_sistemas_con_rol('{admin}')));
create policy habitaciones_delete on public.habitaciones for delete to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{admin}')));

drop policy camas_cud on public.camas;
create policy camas_insert on public.camas for insert to authenticated
  with check (sistema_id in (select privado.mis_sistemas_con_rol('{admin}')));
create policy camas_update on public.camas for update to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{admin}')))
  with check (sistema_id in (select privado.mis_sistemas_con_rol('{admin}')));
create policy camas_delete on public.camas for delete to authenticated
  using (sistema_id in (select privado.mis_sistemas_con_rol('{admin}')));
