-- Tarifas de FUNBIDE según los cuadres en Excel (6-10 oct 2026). Sin tarifa de la ARS, MEDORA le cobraba
-- todo al paciente aunque la cajera eligiera la ARS y la autorización; ahí nacían los sobrantes y
-- faltantes falsos de la caja. Solo datos de FUNBIDE (no cambia la estructura).
do $$
declare
  v_s uuid := '52a0fd5c-d2e1-4c16-829e-dbca2aece2c8';
  v_n int;
begin
  if not exists (select 1 from public.sistemas where id = v_s) then
    raise notice 'FUNBIDE no existe en esta base: no hay tarifas que ajustar.';
    return;
  end if;

  -- 1. Sonografías repetidas: «SONOGRAFIA X» (650, sin tilde, sin uso) y «SONOGRAFÍA X» (600, la que usa caja).
  --    La tarifa de Renacer pasa a la buena y la repetida se desactiva.
  create temp table _pares on commit drop as
    select r.id as repetida, b.id as buena
      from public.servicios r
      join public.servicios b on b.sistema_id = r.sistema_id and b.id <> r.id and b.activo and b.categoria = 'imagen'
       and b.codigo is not null and b.precio = 600
       and privado.clave_especialidad(b.nombre) = privado.clave_especialidad(
             replace(replace(replace(r.nombre, 'TRNSVAJINAL', 'TRANSVAGINAL'), 'OSBTRETICA', 'OBSTETRICA'), 'PARTES BLANDAS', 'PARTES BLANDAS'))
     where r.sistema_id = v_s and r.activo and r.categoria = 'imagen' and r.codigo is null and r.precio = 650
       and r.nombre ilike 'SONOGRAFIA %';

  insert into public.coberturas (sistema_id, aseguradora_id, servicio_id, monto_cubierto, precio, monto_fondo)
  select v_s, co.aseguradora_id, p.buena, co.monto_cubierto, co.precio, co.monto_fondo
    from _pares p join public.coberturas co on co.servicio_id = p.repetida
  on conflict (aseguradora_id, servicio_id) do nothing;

  update public.servicios s set activo = false
   where s.id in (select repetida from _pares)
     and not exists (select 1 from public.cobro_detalles d join public.cobros k on k.id = d.cobro_id
                      where d.servicio_id = s.id and k.creado_en >= now() - interval '30 days');
  get diagnostics v_n = row_count;
  raise notice 'Sonografías repetidas desactivadas: %', v_n;

  -- 2. Sonografías con SENASA Subsidiado: 600, SENASA cubre 200, el paciente 400 (Carmen Rivas, Harolin Heredia).
  insert into public.coberturas (sistema_id, aseguradora_id, servicio_id, monto_cubierto, precio, monto_fondo)
  select v_s, a.id, s.id, 200, 600, 0
    from public.servicios s, public.aseguradoras a
   where s.sistema_id = v_s and s.activo and s.categoria = 'imagen' and s.nombre ilike 'SONOGRAF%'
     and a.sistema_id = v_s and a.nombre = 'SENASA Subsidiado'
  on conflict (aseguradora_id, servicio_id) do nothing;

  -- 3. Consultas sin tarifa (gastroenterología, odontología general): la misma que las demás consultas
  --    («CONSULTA DE GASTRO»): Contributivo 750/650 con fondo 150, Pensionado 600/500, Subsidiado 600/200, Renacer.
  insert into public.coberturas (sistema_id, aseguradora_id, servicio_id, monto_cubierto, precio, monto_fondo)
  select v_s, co.aseguradora_id, s.id, co.monto_cubierto, co.precio, co.monto_fondo
    from public.servicios s
    join public.servicios modelo on modelo.sistema_id = v_s and modelo.nombre = 'CONSULTA DE GASTRO' and modelo.activo
    join public.coberturas co on co.servicio_id = modelo.id
   where s.sistema_id = v_s and s.activo and s.categoria = 'consulta'
     and s.nombre in ('CONSULTA DE GASTROENTEROLOGIA', 'CONSULTA GASTROENTEROLOGÍA', 'CONSULTA ODONTOLOGÍA GENERAL')
  on conflict (aseguradora_id, servicio_id) do nothing;

  -- 4. Psicología con SENASA Contributivo: 1,000, SENASA cubre 500, el paciente 500 (Cynthia Pérez, 09/10).
  update public.coberturas co set precio = 1000, monto_cubierto = 500, monto_fondo = 0
    from public.servicios s, public.aseguradoras a
   where co.servicio_id = s.id and co.aseguradora_id = a.id
     and s.sistema_id = v_s and s.nombre = 'CONSULTA DE PSICOLOGIA' and a.nombre = 'SENASA Contributivo';
end $$;
