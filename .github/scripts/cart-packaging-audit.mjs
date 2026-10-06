// Read-only packaging diagnostics. Never call a courier or print order/customer snapshots.
import {composeModularPackages, resolveOrderPackaging, reviewComponents, packagingError, packagingOptionLabels, componentNormal, productId, canonicalPackagingItemKey} from '../../supabase/functions/_shared/delivery-review-domain.ts';

const orderNumber=process.env.PACKAGING_ORDER_NUMBER;
if(!/^\d{1,12}$/.test(orderNumber||''))throw Error('A numeric order number is required');
const token=process.env.SUPABASE_ACCESS_TOKEN;
if(!token)throw Error('Supabase access token required');
const query=`select jsonb_build_object(
 'order',(select jsonb_build_object('wc_order_items',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'product_name',i.product_name,'quantity',i.quantity,'size',i.size,'wix_options',i.wix_options,'custom_text_fields',i.custom_text_fields,'description_lines',i.description_lines,'catalog_reference',i.catalog_reference,'raw_item',i.raw_item)),'[]'::jsonb) from wc_order_items i where i.order_id=o.id)) from wc_orders o where o.order_number::text='${orderNumber}'),
 'products',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'wix_product_id',wix_product_id,'product_name',product_name,'product_type',product_type,'active',active)),'[]'::jsonb) from wc_shipping_products where active),
 'templates',(select coalesce(jsonb_agg(to_jsonb(p)-'created_by'),'[]'::jsonb) from wc_shipping_packages p where active and source_type='Base'),
 'rules',(select coalesce(jsonb_agg(to_jsonb(r)-'created_by'),'[]'::jsonb) from wc_shipping_rules r where active),
 'profiles',(select coalesce(jsonb_agg(jsonb_build_object('signature',signature,'shipping_product_id',shipping_product_id,'template_item',template_item,'packages',packages)),'[]'::jsonb) from wc_delivery_packaging_profiles)
) as snapshot;`;
const response=await fetch('https://api.supabase.com/v1/projects/zgvnrpspwluapaxnycrg/database/query',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query,read_only:true})});
if(!response.ok)throw Error(`Read-only packaging audit failed: HTTP ${response.status}`);
const [{snapshot}]=await response.json();
if(!snapshot.order)throw Error('Order unavailable');
const ignored=snapshot.rules.filter(r=>r.effect_type==='No effect');
const variantProfiles=snapshot.profiles.filter(p=>p.template_item?.profile_scope==='cart-main');
const productIds=new Set(snapshot.products.filter(p=>snapshot.order.wc_order_items.some(i=>productId(i)?productId(i)===p.wix_product_id:!p.wix_product_id&&componentNormal(i.product_name)===componentNormal(p.product_name))).map(p=>p.id));
const rules=snapshot.rules.filter(r=>productIds.has(r.shipping_product_id));
const safeOptions=item=>packagingOptionLabels(item).filter(label=>{const name=componentNormal(label.split(':')[0]);return ['size','dimension','dimensions'].includes(name)||rules.some(r=>componentNormal(r.match_name||'')===name);});
const boxes=packages=>packages.map(p=>({name:p.package_name,length_mm:p.length_mm,width_mm:p.width_mm,height_mm:p.height_mm,weight_kg:p.weight_kg,components:p.contents.map(c=>({product_name:c.product_name,component_key:c.component_key,unit_index:c.unit_index}))}));
const tables={wc_shipping_products:snapshot.products,wc_shipping_packages:snapshot.templates,wc_shipping_rules:snapshot.rules,wc_delivery_packaging_profiles:snapshot.profiles};
const db={from(table){const filters=[];let start=0,end=Infinity;const result=single=>{let data=tables[table].filter(row=>filters.every(([key,value])=>(key.includes('->>')?row.template_item?.profile_scope:row[key])===value));data=data.slice(start,end+1);return {data:single?data[0]||null:data,error:null};};const q={select:()=>q,eq:(key,value)=>{filters.push([key,value]);return q;},order:()=>q,range:(a,b)=>{start=a;end=b;return Promise.resolve(result(false));},maybeSingle:()=>Promise.resolve(result(true)),then:resolve=>resolve(result(false))};return q;}};
const composed=composeModularPackages(snapshot.order,snapshot.products,snapshot.templates.filter(p=>!p.contents?.some(c=>c.profile_signature)),snapshot.rules,ignored,variantProfiles);
const resolved=await resolveOrderPackaging(db,snapshot.order,ignored,true);
console.log(JSON.stringify({
 order_number:orderNumber,box_count:resolved.length,validation_error:packagingError(resolved,reviewComponents(snapshot.order,ignored)),
 items:snapshot.order.wc_order_items.map(i=>({product_name:i.product_name,quantity:i.quantity,catalogue_id_present:!!productId(i),packaging_options:safeOptions(i),other_option_names:packagingOptionLabels(i).filter(label=>!safeOptions(i).includes(label)).map(label=>label.split(':')[0])})),
 rules:rules.map(r=>({id:r.id,shipping_product_id:r.shipping_product_id,size_key:r.size_key,rule_type:r.rule_type,match_name:r.match_name,match_value:r.match_value,effect_type:r.effect_type})),
 combinations:variantProfiles.filter(p=>productIds.has(p.shipping_product_id)).map(p=>{const mainKey=reviewComponents({wc_order_items:[p.template_item]},ignored)[0]?.profile_item_key;return {shipping_product_id:p.shipping_product_id,packaging_options:safeOptions(p.template_item),merged_add_ons:p.template_item.merged_add_ons,boxes:p.packages.map(b=>({name:b.package_name,contents:b.contents.map(c=>({product_name:c.product_name,component_key:c.component_key,unit_index:c.unit_index,main_template_key_matches:canonicalPackagingItemKey(c.profile_item_key||'')===mainKey}))}))};}),
 composed:boxes(composed),resolved:boxes(resolved)
},null,2));
