-- ============================================================================
-- Prueba de aislamiento multi-tenant (RLS). Se ejecuta dentro de una
-- transacción que se revierte: no deja datos. Correr en el SQL Editor de
-- Supabase (o vía MCP execute_sql) después de cada cambio de políticas.
--
-- Resultado esperado:
--   A ve pacientes        → 1           (solo los de su sistema)
--   A ve sistemas         → Sistema A
--   A cobro               → {… "total": 1500 …}  (calculado en el servidor)
--   B ve pacientes        → Beto
--   B ve cobros           → 0           (recepción no ve finanzas)
--   B ve auditoria        → 0
--   B inserta en A        → bloqueado: … row-level security …
--   B se hace superadmin  → bloqueado: permission denied …
-- ============================================================================
begin;
insert into auth.users (id, email, instance_id, aud, role) values
 ('11111111-1111-1111-1111-111111111111','a@test.local','00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
 ('22222222-2222-2222-2222-222222222222','b@test.local','00000000-0000-0000-0000-000000000000','authenticated','authenticated');
insert into public.sistemas (id, nombre, slug) values
 ('aaaaaaaa-0000-0000-0000-000000000001','Sistema A','sistema-a'),
 ('bbbbbbbb-0000-0000-0000-000000000002','Sistema B','sistema-b');
insert into public.membresias (sistema_id, usuario_id, roles) values
 ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','{admin,medico,caja}'),
 ('bbbbbbbb-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','{recepcion}');
insert into public.pacientes (sistema_id, nombres, apellidos) values
 ('aaaaaaaa-0000-0000-0000-000000000001','Ana','Pérez'),
 ('bbbbbbbb-0000-0000-0000-000000000002','Beto','Gómez');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
create temp table r1 on commit drop as
select 'A ve pacientes' t, count(*)::text v from public.pacientes
union all select 'A ve sistemas', string_agg(nombre, ',') from public.sistemas;

select public.abrir_turno_caja('aaaaaaaa-0000-0000-0000-000000000001', 1000);
insert into r1 select 'A cobro', public.registrar_cobro('aaaaaaaa-0000-0000-0000-000000000001',
  (select id from public.pacientes limit 1), '[{"descripcion":"Consulta","precio_unitario":1500,"cantidad":1}]'::jsonb, 'efectivo')::text;

select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
insert into r1 select 'B ve pacientes', string_agg(nombres, ',') from public.pacientes;
insert into r1 select 'B ve cobros', count(*)::text from public.cobros;
insert into r1 select 'B ve auditoria', count(*)::text from public.auditoria;
do $$ begin
  begin
    insert into public.pacientes (sistema_id, nombres, apellidos) values ('aaaaaaaa-0000-0000-0000-000000000001','Hack','X');
    insert into r1 values ('B inserta en A', 'PERMITIDO (MAL)');
  exception when others then insert into r1 values ('B inserta en A', 'bloqueado: ' || sqlerrm); end;
  begin
    update public.perfiles set es_superadmin = true where id = '22222222-2222-2222-2222-222222222222';
    insert into r1 values ('B se hace superadmin', 'PERMITIDO (MAL)');
  exception when others then insert into r1 values ('B se hace superadmin', 'bloqueado: ' || sqlerrm); end;
end $$;
reset role;
select * from r1;
rollback;
