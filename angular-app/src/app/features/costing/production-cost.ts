import {ShopTemplate} from '../shop-floor/shop-floor.models';
import {backdropSizeKey,optionSizes} from '../shipping-data/product-sizes';
import {plannedTotal,plannedWorkRows,WorkRate} from './planned-work-cost';

export type Folding='foldable'|'nonfoldable';
function optionText(value:unknown){return String((value as any)?.original??(value as any)?.value??value??'').trim().toLowerCase();}
export function optionFinish(options:any):'raw'|'painted'|''|null{
 const finishes=Object.entries(options||{}).filter(([key])=>/^(colou?r|finish|paint|painting)$/i.test(key.trim())).map(([key,value])=>{
  const text=optionText(value);if(!text)return null;
  const raw=/^(raw|unpainted|natural)(\b|\s*\/)/.test(text);
  const noPaint=/^(no|none|false|0|not selected|not required|without paint)(\b|\s*\/|$)/.test(text);
  return raw||(/^paint(ing)?$/i.test(key.trim())&&noPaint)?'raw':'painted';
 }).filter((value):value is 'raw'|'painted'=>value!==null);
 const unique=[...new Set(finishes)];return unique.length===0?null:unique.length===1?unique[0]:'';
}
export function backdropFinishModes(product:any,variantOptions:any[]=[]):boolean[]{
 const explicit=[...new Set(variantOptions.map(optionFinish).filter((finish):finish is 'raw'|'painted'=>finish==='raw'||finish==='painted'))];
 if(explicit.length)return [...(explicit.includes('raw')?[false]:[]),...(explicit.includes('painted')?[true]:[])];
 const label=`${product?.product_name||''} ${product?.short_name||''}`.toLowerCase();
 const raw=/(^|[^a-z])raw([^a-z]|$)/.test(label),painted=/(^|[^a-z])painted([^a-z]|$)/.test(label);
 return raw&&painted?[false,true]:painted?[true]:[false];
}
export function foldingOption(options:any):Folding|''{
 const values=Object.entries(options||{}).filter(([key])=>key.trim().toLowerCase()==='foldable').map(([,value]:any)=>String(value?.original??value?.value??value??'').trim().toLowerCase().replace(/[\s_-]/g,''));
 const mapped=[...new Set(values.map(value=>['yes','true','foldable'].includes(value)?'foldable':['no','false','nonfoldable','unfoldable'].includes(value)?'nonfoldable':''))];
 return mapped.length===1?mapped[0] as Folding|'':'';
}
export function productionSize(options:any){const sizes=[...new Set(optionSizes(options).map(backdropSizeKey))];return sizes.length===1?sizes[0]:'';}
export function foldingLabel(fold:string|null|undefined){return fold==='foldable'?'Foldable':fold==='nonfoldable'?'Non-foldable':'Variant not assigned';}
export function templateVariantLabel(template:ShopTemplate){return template.size_key&&template.folding?`${template.size_key.split('x').map(n=>Number(n)/10).join(' × ')} cm · ${foldingLabel(template.folding)}`:'Size / folding not assigned';}
export interface ProductionCostRow{folding:Folding;painted:boolean;materials:number|null;work:number|null;total:number|null;issues:string[]}
function materialTotal(profile:any,materials:any[]):number|null{
 if(!profile?.materials_confirmed)return null;let cents=0;
 for(const line of profile.lines||[]){const material=materials.find(m=>m.id===line.material_id),quantity=Number(line.quantity);if(!material?.active||material.price_gst==null||!Number.isFinite(Number(material.price_gst))||!Number.isFinite(quantity)||quantity<=0)return null;cents+=Math.round(Number(material.price_gst)*quantity*100);}
 return cents/100;
}
export function productionCostRows(templates:ShopTemplate[],profiles:any[],paintProfile:any,materials:any[],rates:WorkRate[],productName:string,productId:string,finishModes:boolean[]):ProductionCostRow[]{
 return (['foldable','nonfoldable'] as Folding[]).flatMap(folding=>{
  const shared=templates.filter(t=>t.product_id===productId&&!t.size_key&&t.folding===folding),legacy=templates.filter(t=>t.product_id===productId&&!!t.size_key&&t.folding===folding);
  const matching=shared.length?shared:legacy.length===1?legacy:[];
  const candidates=profiles.filter(p=>p.kind==='main'&&!p.standard_top_excluded&&foldingOption(p.options)===folding);
  let materialCost:number|null=null;const issues:string[]=[];
  if(candidates.length!==1)issues.push(candidates.length?'Multiple material compositions: review profiles':'Materials not configured');
  else{const source=candidates[0].profile||candidates[0].legacy_profile;materialCost=materialTotal(source,materials);if(materialCost===null)issues.push(source?.materials_confirmed?'Material price or quantity missing':'Materials not confirmed');else if(!candidates[0].profile)issues.push('Confirm the shared materials profile');}
  if(matching.length!==1)issues.push(matching.length?'Multiple time templates: review Estimated min':'Estimated time not configured');
  return finishModes.map(painted=>{const rowIssues=[...issues];let work:number|null=null,materialsCost=materialCost;
   if(painted){const paintMaterials=materialTotal(paintProfile,materials);if(paintMaterials===null)rowIssues.push(paintProfile?.materials_confirmed?'Paint price or quantity missing':'Painting materials not confirmed');else if(materialsCost!==null)materialsCost=Math.round((materialsCost+paintMaterials)*100)/100;}
   if(matching.length===1){const estimates={...matching[0].estimates,...(painted?paintProfile?.estimates||{}:{})},mainOnly={...matching[0],estimates,parts:matching[0].parts.filter(part=>!part.component_product_id||part.component_product_id===productId)};if(!mainOnly.parts.length)rowIssues.push('Main product parts not configured');else{work=plannedTotal(plannedWorkRows(mainOnly,rates,productName),painted);if(work===null)rowIssues.push('Minutes or hourly rates missing');}}
   return{folding,painted,materials:materialsCost,work,total:materialsCost===null||work===null?null:Math.round((materialsCost+work)*100)/100,issues:rowIssues};
  });
 });
}
