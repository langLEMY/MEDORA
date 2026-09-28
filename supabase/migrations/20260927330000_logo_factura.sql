-- ============================================================================
-- MEDORA · Dos logos por hospital
--   · logo_url:      el logo de la marca (a color, con transparencia): menú lateral,
--                    quiosco y pantalla de la sala.
--   · logo_factura:  el de impresión (blanco y negro, fondo blanco): facturas,
--                    recibos y tickets de la térmica.
-- El logo que había hasta ahora era el de facturas: se mueve a logo_factura.
-- ============================================================================
alter table public.sistemas
  add column logo_factura text check (logo_factura is null or length(logo_factura) <= 600000);

update public.sistemas set logo_factura = logo_url, logo_url = null where logo_url is not null;

drop function public.mis_sistemas_detalle();
create function public.mis_sistemas_detalle()
returns table (id uuid, nombre text, slug text, color_marca text, logo_url text, logo_factura text, moneda text,
               zona_horaria text, activo boolean, roles public.rol_sistema[], permisos jsonb)
language sql
stable
set search_path = ''
as $$
  select s.id, s.nombre, s.slug, s.color_marca, s.logo_url, s.logo_factura, s.moneda, s.zona_horaria, s.activo,
         coalesce(m.roles, '{}'::public.rol_sistema[]),
         coalesce(m.permisos, '{}'::jsonb)
    from public.sistemas s
    left join public.membresias m
      on m.sistema_id = s.id and m.usuario_id = (select auth.uid()) and m.activo
   where (m.id is not null and s.activo) or (select privado.es_superadmin())
   order by s.nombre;
$$;
revoke all on function public.mis_sistemas_detalle() from public, anon;
grant execute on function public.mis_sistemas_detalle() to authenticated;
