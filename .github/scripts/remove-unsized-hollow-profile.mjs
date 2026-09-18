// Delete only the owner-selected unsized 20 kg profile, never products or order snapshots.
const token=process.env.SUPABASE_ACCESS_TOKEN;
if(!token)throw Error('SUPABASE_ACCESS_TOKEN required');
const product='f3ba250f-d3c4-4ca0-8fec-c9c4ef5d7e74';
const itemKey=JSON.stringify(['e8f71bb9-7aa4-8c0f-1f1a-88a5e1d9f65a',[]])+':0';
const signature=JSON.stringify([[itemKey,'main',1]]);
const literal=v=>"'"+String(v).replaceAll("'","''")+"'";
async function request(query,read_only){
 const r=await fetch('https://api.supabase.com/v1/projects/zgvnrpspwluapaxnycrg/database/query',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query,read_only})});
 if(!r.ok){const detail=await r.text();throw Error(`Database request failed: HTTP ${r.status}; ${detail.slice(0,1500)}`);}
 return r.json();
}
const rows=await request(`select signature,shipping_product_id,packages from public.wc_delivery_packaging_profiles where signature=${literal(signature)}`,true);
if(rows.length!==1||rows[0].shipping_product_id!==product)throw Error('Expected profile not found; no deletion');
const boxes=rows[0].packages;
if(boxes.length!==1||boxes[0].weight_kg!==20||boxes[0].length_mm!==1230||boxes[0].width_mm!==1030||boxes[0].height_mm!==100||boxes[0].contents?.length!==1||boxes[0].contents[0].profile_item_key!==itemKey)throw Error('Profile differs from reviewed record; no deletion');
console.log('Verified target: unsized Hollow Arch Plane profile, 1230 x 1030 x 100 mm, 20 kg.');
const drawings=await request(`select * from public.wc_box_drawings where profile_signature=${literal(signature)} order by box_index`,true);
if(drawings.length>1||drawings.some(d=>d.box_index!==0))throw Error('Unexpected linked drawings; no deletion');
console.log('Owner-approved old linked drawing metadata:',JSON.stringify(drawings.map(d=>({filename:d.filename,size_bytes:d.size_bytes,revision:d.revision}))));
await request(`begin;
do $cleanup$ declare affected integer; begin
 if (select coalesce(jsonb_agg(jsonb_build_object('revision',revision,'object_path',object_path) order by box_index),'[]'::jsonb) from public.wc_box_drawings d where profile_signature=${literal(signature)}) is distinct from ${literal(JSON.stringify(drawings.map(d=>({revision:d.revision,object_path:d.object_path}))))}::jsonb then raise exception 'Linked drawing changed; deletion stopped';end if;
 delete from public.wc_delivery_packaging_profiles where signature=${literal(signature)} and shipping_product_id='${product}' and packages=${literal(JSON.stringify(boxes))}::jsonb;
 get diagnostics affected=row_count;
 if affected<>1 then raise exception 'Profile changed; deletion cancelled';end if;
end $cleanup$;
commit;`,false);
const after=await request(`select count(*)::int as count from public.wc_delivery_packaging_profiles where signature=${literal(signature)}`,true);
if(after[0]?.count!==0)throw Error('Profile still present');
console.log('Verified: old unsized Hollow Arch Plane profile and its linked drawing metadata deleted. Product, product drawings, shared drawings and order snapshots unchanged. The old storage file remains because Storage access was denied.');
