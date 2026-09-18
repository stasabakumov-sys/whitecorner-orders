// Owner-selected metadata deletion only. The private storage file is retained for recovery.
import {writeFile} from 'node:fs/promises';
const token=process.env.SUPABASE_ACCESS_TOKEN;
if(!token)throw Error('SUPABASE_ACCESS_TOKEN is required');
const product='3fa4eeb9-8959-4e90-8fd4-6e345551f3e6';
const literal=value=>"'"+String(value).replaceAll("'","''")+"'";
async function request(query,read_only){
 const r=await fetch('https://api.supabase.com/v1/projects/zgvnrpspwluapaxnycrg/database/query',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query,read_only})});
 if(!r.ok)throw Error(`Database request failed: HTTP ${r.status}`);
 return r.json();
}
const rows=await request(`select d.*,p.short_name,p.wix_product_id from public.wc_product_drawings d join public.wc_shipping_products p on p.id=d.product_id where d.product_id='${product}' order by d.variant_key`,true);
console.log('Drawing metadata:',JSON.stringify(rows.map(({object_path,...r})=>r)));
if(process.env.CLEANUP_MODE==='inspect')process.exit(0);
if(process.env.CLEANUP_MODE!=='remove')throw Error('Expected inspect or remove mode');
const target=rows.find(r=>r.variant_key==='');
if(!target||target.short_name!=='Plane Arch'||target.wix_product_id!=='868d952f-6744-3e35-f454-80ed34a5baa1'||target.filename!=='Arch 200x100.cdr')throw Error('Expected legacy Plane Arch drawing not found; nothing removed');
await writeFile('legacy-plane-drawing-recovery.json',JSON.stringify({captured_at:new Date().toISOString(),drawing:target},null,2));
const result=await request(`begin;
do $cleanup$ declare affected integer; begin
 delete from public.wc_product_drawings where product_id='${product}' and variant_key='' and revision=${literal(target.revision)}::uuid and filename=${literal(target.filename)} and object_path=${literal(target.object_path)};
 get diagnostics affected=row_count;
 if affected<>1 then raise exception 'Drawing changed; cleanup cancelled';end if;
end $cleanup$;
commit;
select product_id,variant_key,filename,revision from public.wc_product_drawings where product_id='${product}' order by variant_key;`,false);
const after=await request(`select * from public.wc_product_drawings where product_id='${product}' order by variant_key`,true);
if(after.some(r=>r.variant_key===''))throw Error('Legacy drawing still present');
const beforeOthers=rows.filter(r=>r.variant_key!=='').map(({short_name,wix_product_id,...r})=>r);
if(JSON.stringify(beforeOthers)!==JSON.stringify(after))throw Error('Non-target drawing metadata differs; review required');
console.log('Verified: removed exactly the legacy Plane Arch drawing record; size-specific drawings unchanged. Private file retained for recovery.');
