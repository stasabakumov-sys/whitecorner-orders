const token=process.env.SUPABASE_ACCESS_TOKEN;
if(!token)throw Error('SUPABASE_ACCESS_TOKEN is required');
const query=`select jsonb_build_object(
 'registry', (select count(*) from wc_shipping_products),
 'local_only', (select count(*) from wc_shipping_products where wix_product_id is null),
 'snapshots', (select count(*) from wc_wix_catalog_products),
 'visible', (select count(*) from wc_wix_catalog_products where source_product->>'visible'='true'),
 'missing_description', (select count(*) from wc_wix_catalog_products where coalesce(source_product->>'description','')=''),
 'missing_media', (select count(*) from wc_wix_catalog_products where coalesce(jsonb_array_length(source_product#>'{media,items}'),0)=0),
 'missing_slug', (select count(*) from wc_wix_catalog_products where coalesce(source_product->>'slug','')=''),
 'currency', (select jsonb_agg(distinct source_product#>>'{price,currency}') from wc_wix_catalog_products),
 'variants', (select sum(jsonb_array_length(source_product->'variants')) from wc_wix_catalog_products),
 'collection_ids', (select jsonb_agg(distinct v) from wc_wix_catalog_products,jsonb_array_elements(source_product->'collectionIds') v),
 'field_names', (select jsonb_agg(distinct k) from wc_wix_catalog_products,jsonb_object_keys(source_product) k),
 'jobs', (select jsonb_agg(jsonb_build_object('offset',next_offset,'total',expected_total,'complete',complete,'updated',updated_at)) from wc_wix_catalog_jobs),
 'oldest_snapshot', (select min(synced_at) from wc_wix_catalog_products),
 'newest_snapshot', (select max(synced_at) from wc_wix_catalog_products),
 'media_example', (select source_product->'media' from wc_wix_catalog_products where source_product->>'visible'='true' limit 1),
 'variant_example', (select source_product->'variants'->0 from wc_wix_catalog_products where source_product->>'visible'='true' and jsonb_array_length(source_product->'variants')>0 limit 1),
 'options_example', (select source_product->'productOptions' from wc_wix_catalog_products where source_product->>'visible'='true' and jsonb_array_length(source_product->'productOptions')>0 limit 1)
) audit;`;
const response=await fetch('https://api.supabase.com/v1/projects/zgvnrpspwluapaxnycrg/database/query',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query,read_only:true})});
if(!response.ok)throw Error(`Read-only Hub audit failed (${response.status})`);
console.log(JSON.stringify(await response.json(),null,2));
