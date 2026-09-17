function text(v:any):string{return typeof v==='string'?v:v?.original||v?.value||v?.name||'';}
// Catalogue options and variants define the available sizes; saved boxes do not.
export function catalogSizes(source:any):string[]{
 const values=[...(source?.productOptions||[]).filter((o:any)=>/^(size|dimensions?)$/i.test(String(o.name||'').trim())).flatMap((o:any)=>(o.choices||[]).map((c:any)=>text(c.description??c.value))),...(source?.variants||[]).flatMap((v:any)=>optionSizes(v.choices))];
 return [...new Map(values.map(value=>value.trim()).filter(Boolean).map(value=>[value.toLowerCase(),value])).values()];
}
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
// Manual product dimensions use centimetres when the operator enters only W x H.
// Keep backdropSizeKey strict because imported Wix values without units are ambiguous.
export function manualBackdropSizeKey(value:string):string {
 const explicit=backdropSizeKey(value);if(explicit)return explicit;
 const match=value.trim().match(/^(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)$/i);
 if(!match)return '';
 const a=Number(match[1])*10,b=Number(match[2])*10;
 if(!Number.isInteger(a)||!Number.isInteger(b)||a<=0||b<=0||a>10000||b>10000)return '';
 return [a,b].sort((x,y)=>y-x).join('x');
}
export function sizeKeyLabel(key:string){const [size,fold]=key.split(':');return size.split('x').map(x=>Number(x)/10).join(' × ')+' cm'+(fold==='foldable'?' · Foldable':fold==='nonfoldable'?' · Non-foldable':'');}
export function qualifiedDrawingKey(key:string){return /^[1-9]\d*x[1-9]\d*:(foldable|nonfoldable)$/.test(key);}
function legacyOptionValues(profile:any,productName:string,option:RegExp):string[]{
 const contents=(profile.packages||[]).flatMap((box:any)=>box.contents||[]).filter((content:any)=>!content.component_key||content.component_key==='main');
 const matching=contents.filter((content:any)=>content.product_name===productName);
 const candidates=matching.length?matching:contents;
 const values:string[]=[];
 for(const content of candidates){
  try{
   const key=content.profile_item_key||'',options=JSON.parse(key.slice(0,key.lastIndexOf(':')))[1];
   for(const value of options||[])if(option.test(value))values.push(value.replace(option,''));
  }catch{/* Legacy profile without option metadata. */}
 }
 return values;
}
export function backdropDrawingKey(profile:any,productName:string):string{
 const sizes=[...new Set(packagingSizes(profile,productName).map(backdropSizeKey))];
 if(sizes.length!==1||!sizes[0])return '';
 const values=Object.entries(profile.template_item?.wix_options||{}).filter(([k])=>/^foldable$/i.test(k.trim())).map(([,v])=>typeof v==='boolean'?String(v):text(v));
 values.push(...legacyOptionValues(profile,productName,/^foldable\s+/i));
 const folds=[...new Set(values.map(v=>{const n=v.trim().toLowerCase().replace(/[\s_-]/g,'');return ['yes','true','foldable'].includes(n)?'foldable':['no','false','nonfoldable','unfoldable'].includes(n)?'nonfoldable':'';}))];
 return folds.length===1&&folds[0]?sizes[0]+':'+folds[0]:'';
}
export function packagingSizes(profile:any,productName:string):string[]{
 const values=optionSizes(profile.template_item?.wix_options);
 values.push(...legacyOptionValues(profile,productName,/^size\s+/i));
 return [...new Set(values)];
}

export type PackagingSizeGroup={key:string;label:string;profiles:any[]};

export function packagingSizeGroups(profiles:any[],productName:string,productSizes:string[]):PackagingSizeGroup[]{
 const normalize=(value:string)=>backdropSizeKey(value)||value.trim().toLowerCase();
 const groups=new Map<string,PackagingSizeGroup>();
 const add=(label:string,profile?:any)=>{
  const key=label==='Size not specified'?'unspecified':`size:${normalize(label)}`;
  const group=groups.get(key)||{key,label,profiles:[]};
  if(profile&&!group.profiles.includes(profile))group.profiles.push(profile);
  groups.set(key,group);
 };
 for(const size of productSizes||[])if(size.trim())add(size.trim());
 for(const profile of profiles||[]){
  const sizes=packagingSizes(profile,productName);
  if(!sizes.length)add('Size not specified',profile);else for(const size of sizes)add(size,profile);
 }
 return [...groups.values()];
}
