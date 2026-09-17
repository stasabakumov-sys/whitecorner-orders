// Read-only operational metadata. No customer/order payloads or credentials.
const token=process.env.SUPABASE_ACCESS_TOKEN;
if(!token)throw Error('SUPABASE_ACCESS_TOKEN is required');
const query=`select jsonb_build_object(
 'products',(select jsonb_agg(jsonb_build_object('id',id,'name',product_name,'short_name',short_name,'wix_product_id',wix_product_id)) from wc_shipping_products where active and (product_type='Backdrop' or product_name~*'backdrop')),
 'dimensions',(select jsonb_agg(to_jsonb(d)-'created_by') from wc_backdrop_packaging_dimensions d),
 'profiles',(select jsonb_agg(jsonb_build_object('signature',p.signature,'shipping_product_id',p.shipping_product_id,'options',p.template_item->'wix_options','template_name',p.template_item->>'product_name','boxes',(select jsonb_agg(jsonb_build_object('length_mm',b->'length_mm','width_mm',b->'width_mm','height_mm',b->'height_mm','weight_kg',b->'weight_kg','contents',(select jsonb_agg(jsonb_build_object('product_name',c->>'product_name','wix_product_id',c->>'wix_product_id','profile_item_key',c->>'profile_item_key','component_key',c->>'component_key')) from jsonb_array_elements(b->'contents') c))) from jsonb_array_elements(p.packages) b))) from wc_delivery_packaging_profiles p where exists(select 1 from jsonb_array_elements(p.packages) b cross join lateral jsonb_array_elements(b->'contents') c where c->>'product_name'~*'backdrop') or p.shipping_product_id in (select id from wc_shipping_products where product_type='Backdrop'))
) as packaging;`;
const response=await fetch('https://api.supabase.com/v1/projects/zgvnrpspwluapaxnycrg/database/query',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query,read_only:true})});
if(!response.ok)throw Error(`Read-only inspection failed: HTTP ${response.status}`);
console.log(JSON.stringify(await response.json()));
