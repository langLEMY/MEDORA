-- MEDORA · El logo del sistema se guarda como data URL (la app lo reduce a 480 px
-- sobre blanco) para que facturas y recibos se impriman sin depender de la red.
-- Tope para que no se cuele una imagen enorme en cada carga de sesión.
alter table public.sistemas add constraint sistemas_logo_tamano check (logo_url is null or length(logo_url) <= 600000);
