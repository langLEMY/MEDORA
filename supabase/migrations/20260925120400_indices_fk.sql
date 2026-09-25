-- ============================================================================
-- MEDORA · 0005 · Índices para todas las FK sin índice que las cubra
-- (advisor "unindexed_foreign_keys"). Se generan a partir del catálogo para no
-- mantener a mano ~40 sentencias; nombre: ix_fk_<tabla>_<constraint>.
-- ============================================================================
do $$
declare
  r record;
begin
  for r in
    select c.conrelid::regclass as tabla,
           c.conname,
           (select string_agg(quote_ident(a.attname), ', ' order by k.ord)
              from unnest(c.conkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) as columnas
      from pg_constraint c
      join pg_namespace n on n.oid = (select relnamespace from pg_class where oid = c.conrelid)
     where c.contype = 'f'
       and n.nspname = 'public'
       and not exists (
         select 1 from pg_index i
          where i.indrelid = c.conrelid
            and (i.indkey::int2[])[0:cardinality(c.conkey) - 1] @> c.conkey
            and (i.indkey::int2[])[0:cardinality(c.conkey) - 1] <@ c.conkey
       )
  loop
    execute format('create index if not exists %I on %s (%s)',
      left('ix_fk_' || r.conname, 63), r.tabla, r.columnas);
  end loop;
end $$;
