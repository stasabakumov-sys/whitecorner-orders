function text(v:any):string{return typeof v==='string'?v:v?.original||v?.value||v?.name||'';}
export function optionSizes(options:any):string[]{return Object.entries(options||{}).filter(([k])=>/^size|dimensions?$/i.test(k.trim())).map(([,v])=>text(v)).filter(Boolean);}
// Share only explicit two-dimensional metric sizes. Size I/II and missing units need review.
export function backdropSizeKey(value:string):string {
 const match=value.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(mm|cm|m)?\s*[x×]\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)$/);
 if(!match)return '';
 const factor=(u:string)=>u==='m'?1000:u==='cm'?10:1;
 const a=Number(match[1])*factor(match[2]||match[4]),b=Number(match[3])*factor(match[4]);
 if(!Number.isInteger(a)||!Number.isInteger(b)||a<=0||b<=0||a>10000||b>10000)return '';
 return [a,b].sort((x,y)=>y-x).join('x');
}
export function sizeKeyLabel(key:string){const [size,fold]=key.split(':');return size.split('x').map(x=>Number(x)/10).join(' × ')+' cm'+(fold==='foldable'?' · Foldable':fold==='nonfoldable'?' · Non-foldable':'');}
export function qualifiedDrawingKey(key:string){return /^[1-9]\d*x[1-9]\d*:(foldable|nonfoldable)$/.test(key);}
export function backdropDrawingKey(profile:any,productName:string):string{
 const sizes=[...new Set(packagingSizes(profile,productName).map(backdropSizeKey))];
 if(sizes.length!==1||!sizes[0])return '';
 const values=Object.entries(profile.template_item?.wix_options||{}).filter(([k])=>/^foldable$/i.test(k.trim())).map(([,v])=>typeof v==='boolean'?String(v):text(v));
 for(const c of (profile.packages||[]).flatMap((b:any)=>b.contents||[])){
  if(c.product_name!==productName||c.component_key&&c.component_key!=='main')continue;
  try{const key=c.profile_item_key||'';const opts=JSON.parse(key.slice(0,key.lastIndexOf(':')))[1];for(const opt of opts||[])if(/^foldable\s+/i.test(opt))values.push(opt.replace(/^foldable\s+/i,''));}catch{/* Missing legacy options need review. */}
 }
 const folds=[...new Set(values.map(v=>{const n=v.trim().toLowerCase().replace(/[\s_-]/g,'');return ['yes','true','foldable'].includes(n)?'foldable':['no','false','nonfoldable','unfoldable'].includes(n)?'nonfoldable':'';}))];
 return folds.length===1&&folds[0]?sizes[0]+':'+folds[0]:'';
}
export function packagingSizes(profile:any,productName:string):string[]{
 const values=optionSizes(profile.template_item?.wix_options);
 for(const c of (profile.packages||[]).flatMap((b:any)=>b.contents||[])){
  if(c.product_name!==productName||c.component_key&&c.component_key!=='main')continue;
  try{const key=c.profile_item_key||'';const opts=JSON.parse(key.slice(0,key.lastIndexOf(':')))[1];for(const opt of opts||[])if(/^size\s+/i.test(opt))values.push(opt.replace(/^size\s+/i,''));}catch{/* Legacy profile without option metadata. */}
 }
 return [...new Set(values)];
}
