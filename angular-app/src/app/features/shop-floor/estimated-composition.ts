import {ShopPart,ShopTemplate} from './shop-floor.models';

function text(value:unknown):string {
 const item=value as {original?:unknown;value?:unknown}|null;
 return String(item&&typeof item==='object'?(item.original??item.value??''):value??'').trim().toLocaleLowerCase();
}

export function partMatchesOrder(part:ShopPart,componentIds:string[],options:Record<string,unknown>,productId:string):boolean {
 if(!componentIds.includes(part.component_product_id||productId))return false;
 if(!part.option_name)return true;
 const choice=Object.entries(options).find(([name])=>text(name)===text(part.option_name));
 return !!choice&&text(choice[1])===text(part.option_value);
}

export function estimatedComposition(template:ShopTemplate,componentIds:string[],options:Record<string,unknown>,productId:string):ShopTemplate {
 const parts=template.parts.filter(part=>partMatchesOrder(part,componentIds,options,productId));
 const ids=new Set(parts.map(part=>part.id));
 return {...template,parts,estimates:Object.fromEntries(Object.entries(template.estimates||{}).filter(([key])=>!['Assembly','Sanding','CNC'].some(stage=>key.startsWith(stage+':'))||ids.has(key.split(':')[1])))};
}

export function estimatedCncMinutes(template:Pick<ShopTemplate,'parts'|'estimates'>):number|null {
 const base=template.estimates?.['CNC'];
 if(base==null||!Number.isFinite(Number(base)))return null;
 const extras=template.parts.map(part=>template.estimates?.['CNC:'+part.id]).filter(value=>value!=null);
 return Number(base)+extras.reduce<number>((sum,value)=>sum+Number(value),0);
}
