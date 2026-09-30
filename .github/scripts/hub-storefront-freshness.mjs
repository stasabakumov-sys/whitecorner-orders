export function syncRestart(args) {
 const restart = args.includes('--restart'), resume = args.includes('--resume');
 if (restart === resume) throw Error('Choose --restart for a fresh Wix scan or --resume for the saved run.');
 return restart;
}

// All comparisons run inside the database. Only aggregate counts/dates leave it.
export const freshnessQuery = `
with live as (select payload,published_at from wc_storefront_catalog where id='live'),
published as (select p from live,jsonb_array_elements(payload->'products') p),
current_source as (
 select s.* from wc_wix_catalog_products s join wc_wix_catalog_jobs j using(site_id,run_id)
), visible as (select * from current_source where source_product->>'visible'='true'),
expected_variants as (
 select s.shipping_product_id, v->>'id' variant_id,
 coalesce(v#>'{variant,priceData}',s.source_product->'priceData',s.source_product->'price') price_data,
 v from visible s,jsonb_array_elements(s.source_product->'variants') v
 where coalesce(v#>>'{variant,visible}','true')<>'false'
), published_variants as (
 select p->>'id' product_id,v from published,jsonb_array_elements(p->'variants') v
)
select jsonb_build_object(
 'checked_at',now(),
 'source_snapshots',(select count(*) from wc_wix_catalog_products),
 'current_run_snapshots',(select count(*) from current_source),
 'visible_source_products',(select count(*) from visible),
 'published_products',(select count(*) from published),
 'local_only_products',(select count(*) from wc_shipping_products where wix_product_id is null),
 'job_count',(select count(*) from wc_wix_catalog_jobs),
 'import_complete',coalesce((select bool_and(complete and next_offset=expected_total
  and expected_total=(select count(*) from current_source s where s.site_id=j.site_id)) from wc_wix_catalog_jobs j),false),
 'last_full_scan_at',(select max(updated_at) from wc_wix_catalog_jobs where complete),
 'oldest_snapshot_at',(select min(synced_at) from wc_wix_catalog_products),
 'newest_snapshot_at',(select max(synced_at) from wc_wix_catalog_products),
 'snapshots_read_last_6h',(select count(*) from wc_wix_catalog_products where synced_at>now()-interval '6 hours'),
 'published_at',(select published_at from live),
 'snapshots_read_after_publication',(select count(*) from current_source where synced_at>(select published_at from live)),
 'visible_not_published',(select count(*) from visible s where not exists(select 1 from published where p->>'id'=s.shipping_product_id::text)),
 'published_hidden_or_missing',(select count(*) from published where not exists(select 1 from visible s where s.shipping_product_id::text=p->>'id')),
 'variant_price_or_stock_changes',(select count(*) from expected_variants e join published_variants p on p.product_id=e.shipping_product_id::text and p.v->>'id'=e.variant_id
  where coalesce(nullif(e.price_data->'discountedPrice','null'::jsonb),e.price_data->'price') is distinct from p.v->'price'
   or nullif(e.v#>'{stock,inStock}','null'::jsonb) is distinct from nullif(p.v->'inStock','null'::jsonb)
   or coalesce(nullif(e.v#>'{stock,trackQuantity}','null'::jsonb),'false'::jsonb) is distinct from p.v->'trackQuantity'
   or (case when e.v#>>'{stock,trackQuantity}'='true' then nullif(e.v#>'{stock,quantity}','null'::jsonb) end) is distinct from nullif(p.v->'quantity','null'::jsonb)),
 'variants_not_published',(select count(*) from expected_variants e where not exists(select 1 from published_variants p where p.product_id=e.shipping_product_id::text and p.v->>'id'=e.variant_id)),
 'published_variants_missing_or_hidden',(select count(*) from published_variants p where not exists(select 1 from expected_variants e where p.product_id=e.shipping_product_id::text and p.v->>'id'=e.variant_id)),
 'simple_product_price_changes',(select count(*) from visible s join published on p->>'id'=s.shipping_product_id::text
  where coalesce(s.source_product->>'manageVariants','false')<>'true'
   and coalesce(s.source_product#>'{priceData,discountedPrice}',s.source_product#>'{priceData,price}',s.source_product#>'{price,discountedPrice}',s.source_product#>'{price,price}') is distinct from p->'price'),
 'collections',(select count(*) from wc_wix_catalog_collections),
 'confirmed_media',(select count(*) from wc_catalog_media),
 'deferred_media',(select count(*) from wc_catalog_media_issues)
) audit;`;
