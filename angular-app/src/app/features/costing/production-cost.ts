import {ShopTemplate} from '../shop-floor/shop-floor.models';
import {backdropSizeKey,optionSizes} from '../shipping-data/product-sizes';
import {plannedTotal,plannedWorkRows,WorkRate} from './planned-work-cost';

export type Folding='foldable'|'nonfoldable';
export function foldingOption(options:any):Folding|''{
 const values=Object.entries(options||{}).filter(([key])=>key.trim().toLowerCase()==='foldable').map(([,value]:any)=>String(value?.original??value?.value??value??'').trim().toLowerCase().replace(/[\s_-]/g,''));
 const mapped=[...new Set(values.map(value=>['yes','true','foldable'].includes(value)?'foldable':['no','false','nonfoldable','unfoldable'].includes(value)?'nonfoldable':''))];
 return mapped.length===1?mapped[0] as Folding|'':'';
}
export function productionSize(options:any){const sizes=[...new Set(optionSizes(options).map(backdropSizeKey))];return sizes.length===1?sizes[0]:'';}
export function foldingLabel(fold:string|null|undefined){return fold==='foldable'?'Foldable':fold==='nonfoldable'?'Non-foldable':'Variant not assigned';}
export function templateVariantLabel(template:ShopTemplate){return template.size_key&&template.folding?`${template.size_key.split('x').map(n=>Number(n)/10).join(' × ')} cm · ${foldingLabel(template.folding)}`:'Size / folding not assigned';}
export interface ProductionCostRow{size:string;folding:Folding;painted:boolean;materials:number|null;work:number|null;total:number|null;issues:string[]}
export function productionCostRows(sizes:string[],templates:ShopTemplate[],profiles:any[],materials:any[],rates:WorkRate[],productName:string,productId:string):ProductionCostRow[]{
 return sizes.flatMap(size=>(['foldable','nonfoldable'] as Folding[]).flatMap(folding=>{
  const matching=templates.filter(t=>t.product_id===productId&&t.size_key===size&&t.folding===folding);
  const candidates=profiles.filter(p=>p.kind==='main'&&!p.standard_top_excluded&&productionSize(p.options)===size&&foldingOption(p.options)===folding);
  let materialCost:number|null=null;const issues:string[]=[];
  if(candidates.length!==1)issues.push(candidates.length?'Multiple material compositions: review profiles':'Materials not configured');
  else{
   const group=candidates[0].shared_parts?.length?candidates[0].shared_parts:[candidates[0]];
   const saved=group.map((p:any)=>p.profile).filter(Boolean);
   if(!saved.length||saved.some((p:any)=>!p.materials_confirmed))issues.push('Materials not confirmed');
   else{
    const signature=(p:any)=>JSON.stringify((p.lines||[]).map((l:any)=>[l.material_id,Number(l.quantity)]).sort((a:any,b:any)=>String(a[0]).localeCompare(String(b[0]))));
    if(new Set(saved.map(signature)).size>1)issues.push('Material profiles disagree across colours');
    else{let cents=0;for(const line of saved[0].lines||[]){const m=materials.find(m=>m.id===line.material_id);const q=Number(line.quantity);if(!m?.active||m.price_gst==null||!Number.isFinite(Number(m.price_gst))||!Number.isFinite(q)||q<=0){issues.push('Material price or quantity missing');break;}cents+=Math.round(Number(m.price_gst)*q*100);}if(!issues.length)materialCost=cents/100;}
   }
  }
  if(matching.length!==1)issues.push(matching.length?'Multiple time templates: review Estimated min':'Estimated time not configured');
  return [false,true].map(painted=>{const rowIssues=[...issues];let work:number|null=null;
   if(matching.length===1){const mainOnly={...matching[0],parts:matching[0].parts.filter(part=>!part.component_product_id||part.component_product_id===productId)};if(!mainOnly.parts.length)rowIssues.push('Main product parts not configured');else{work=plannedTotal(plannedWorkRows(mainOnly,rates,productName),painted);if(work===null)rowIssues.push('Minutes or hourly rates missing');}}
   return{size,folding,painted,materials:materialCost,work,total:materialCost===null||work===null?null:Math.round((materialCost+work)*100)/100,issues:rowIssues};
  });
 }));
}
