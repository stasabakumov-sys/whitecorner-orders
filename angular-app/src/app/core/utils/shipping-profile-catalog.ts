import {componentNormal} from '../../../../../supabase/functions/_shared/delivery-review-domain';

// One catalogue over the persisted profiles, without duplicating or migrating boxes.
export function shippingProfileCatalog(products:any[],profiles:any[]){
 const rows=products.map(p=>({...p,saved_profiles:[] as any[]}));
 for(const profile of profiles){
  const components=(profile.packages||[]).flatMap((p:any)=>p.contents||[]);
  const sources=[...new Map<string,any>(components.filter((c:any)=>!c.component_key||c.component_key==='main').map((c:any)=>[String(c.wix_product_id||componentNormal(c.product_name||'')),c])).values()];
  for(const source of sources){
   const identity=String(source.wix_product_id||componentNormal(source.product_name||''));if(!identity)continue;
   let matches=rows.filter(p=>source.wix_product_id?p.wix_product_id===source.wix_product_id:!p.wix_product_id&&componentNormal(p.product_name)===componentNormal(source.product_name));
   if(!matches.length)matches=rows.filter(p=>!p.wix_product_id&&componentNormal(p.product_name)===componentNormal(source.product_name));
   let row=matches.length===1?matches[0]:rows.find(p=>p.id==='saved:'+identity);
   if(!row){row={id:'saved:'+identity,product_name:source.product_name,wix_product_id:source.wix_product_id||null,saved_only:true,active:true,saved_profiles:[]};rows.push(row);}
   if(!row.saved_profiles.some((p:any)=>p.signature===profile.signature))row.saved_profiles.push(profile);
  }
 }
 return rows;
}
export function savedProfileOptions(profile:any){
 const values=new Set<string>();
 for(const c of (profile.packages||[]).flatMap((p:any)=>p.contents||[])){
  try{const key=String(c.profile_item_key||'');const parsed=JSON.parse(key.slice(0,key.lastIndexOf(':')));for(const option of parsed[1]||[])values.add(option);}catch{/* Older profiles may not have option metadata. */}
 }
 return [...values].join(' · ')||'Saved exact composition';
}
