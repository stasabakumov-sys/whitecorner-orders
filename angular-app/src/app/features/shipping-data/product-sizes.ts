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
export function sizeKeyLabel(key:string){return key.split('x').map(x=>Number(x)/10).join(' × ')+' cm';}
export function packagingSizes(profile:any,productName:string):string[]{
 const values=optionSizes(profile.template_item?.wix_options);
 for(const c of (profile.packages||[]).flatMap((b:any)=>b.contents||[])){
  if(c.product_name!==productName||c.component_key&&c.component_key!=='main')continue;
  try{const key=c.profile_item_key||'';const opts=JSON.parse(key.slice(0,key.lastIndexOf(':')))[1];for(const opt of opts||[])if(/^size\s+/i.test(opt))values.push(opt.replace(/^size\s+/i,''));}catch{/* Legacy profile without option metadata. */}
 }
 return [...new Set(values)];
}
