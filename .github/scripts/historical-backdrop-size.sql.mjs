export const targetSize = '190cm x 100cm';
const productJoin = `join public.wc_shipping_products p on
 ((p.wix_product_id is not null and p.wix_product_id=coalesce(nullif(i.catalog_reference->>'catalogItemId',''),nullif(i.catalog_reference->>'productId','')))
  or (p.wix_product_id is null and lower(btrim(p.product_name))=lower(btrim(i.product_name))))`;

export const candidateSql = `select i.size,
 lower(btrim(coalesce(p.product_type,'')))='backdrop' as is_backdrop,
 exists(select 1 from jsonb_object_keys(coalesce(i.wix_options,'{}'::jsonb)) key
        where lower(btrim(key)) in ('size','dimension','dimensions')) as has_wix_size,
 nullif(btrim(i.size),'') as effective_size
from public.wc_orders o
join public.wc_order_items i on i.order_id=o.id
${productJoin}
where o.order_number='10846'
  and i.product_name ilike 'Plywood Hollow Event Backdrop%';`;

export const applySql = `begin;
set local lock_timeout='15s';
set local statement_timeout='30s';
select pg_advisory_xact_lock(20261007,10846);
do $backfill$
declare matches integer; selected public.wc_order_items; kind text;
begin
 select count(*) into matches
 from public.wc_orders o join public.wc_order_items i on i.order_id=o.id
 ${productJoin}
 where o.order_number='10846' and i.product_name ilike 'Plywood Hollow Event Backdrop%';
 if matches<>1 then raise exception 'Expected exactly one matching Backdrop order item'; end if;
 select i.* into selected from public.wc_orders o join public.wc_order_items i on i.order_id=o.id
 where o.order_number='10846' and i.product_name ilike 'Plywood Hollow Event Backdrop%' for update of i;
 select p.product_type into kind from public.wc_shipping_products p where
  ((p.wix_product_id is not null and p.wix_product_id=coalesce(nullif(selected.catalog_reference->>'catalogItemId',''),nullif(selected.catalog_reference->>'productId','')))
   or (p.wix_product_id is null and lower(btrim(p.product_name))=lower(btrim(selected.product_name))));
 if lower(btrim(coalesce(kind,'')))<>'backdrop' then raise exception 'Matching product is not a Backdrop'; end if;
 if exists(select 1 from jsonb_object_keys(coalesce(selected.wix_options,'{}'::jsonb)) key
           where lower(btrim(key)) in ('size','dimension','dimensions')) then
  raise exception 'Wix already supplies a size';
 end if;
 if nullif(btrim(coalesce(selected.size,'')),'') is not null and btrim(selected.size)<>'190cm x 100cm' then
  raise exception 'Order item already has a different Hub size';
 end if;
 update public.wc_order_items set size='190cm x 100cm' where id=selected.id and size is distinct from '190cm x 100cm';
end $backfill$;
commit;`;

export function validateCandidate(rows, expectSaved = false) {
  if (rows.length !== 1 || rows[0].is_backdrop !== true || rows[0].has_wix_size !== false) {
    throw Error('Order 10846 does not have exactly one linked Backdrop item without a Wix size');
  }
  const size = rows[0].size?.trim() || '';
  if (size && size !== targetSize) throw Error('Order 10846 already has a different Hub size');
  if (expectSaved && (size !== targetSize || rows[0].effective_size !== targetSize)) {
    throw Error('Order 10846 size postflight failed');
  }
  return size === targetSize;
}
