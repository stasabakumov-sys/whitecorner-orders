// Owner-selected legacy metadata and private storage object deletion only.
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
const refs=`select count(*)::int as count from (
 select object_path from public.wc_product_drawings where object_path=${literal(target.object_path)} and not (product_id='${product}' and variant_key='')
 union all select object_path from public.wc_box_drawings where object_path=${literal(target.object_path)}
 union all select object_path from public.wc_backdrop_box_drawings where object_path=${literal(target.object_path)}
) r`;
if((await request(refs,true))[0]?.count!==0)throw Error('File is used by another drawing; nothing removed');
// Read an existing server key into memory only. Never create keys or print them.
const keysResponse=await fetch('https://api.supabase.com/v1/projects/zgvnrpspwluapaxnycrg/api-keys',{headers:{Authorization:`Bearer ${token}`}});
if(!keysResponse.ok)throw Error(`Could not obtain Storage access: HTTP ${keysResponse.status}`);
const keys=await keysResponse.json();
const serverKey=keys.find(k=>k.name==='service_role')?.api_key;
if(!serverKey)throw Error('Existing server key unavailable; nothing removed');
const result=await request(`begin;
do $cleanup$ declare affected integer; begin
 if (${refs})<>0 then raise exception 'File now used by another drawing';end if;
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
if((await request(refs,true))[0]?.count!==0)throw Error('File acquired another reference; storage cleanup stopped');
const deletion=await fetch('https://zgvnrpspwluapaxnycrg.supabase.co/storage/v1/object/box-drawings',{method:'DELETE',headers:{apikey:serverKey,Authorization:`Bearer ${serverKey}`,'Content-Type':'application/json'},body:JSON.stringify({prefixes:[target.object_path]})});
if(!deletion.ok)throw Error(`Metadata removed but storage deletion failed: HTTP ${deletion.status}`);
const objects=await request(`select count(*)::int as count from storage.objects where bucket_id='box-drawings' and name=${literal(target.object_path)}`,true);
if(objects[0]?.count!==0)throw Error('Storage object still present');
console.log('Verified: legacy Plane Arch drawing record AND storage object deleted. Both size-specific drawings unchanged.');
