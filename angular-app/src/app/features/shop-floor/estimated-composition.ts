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

export function cncScopeKey(scope:{componentId:string;optionName?:string;optionValue?:string},productId:string):string {
 if(scope.optionName&&scope.optionValue)return 'option:'+text(scope.optionName)+'='+text(scope.optionValue);
 return scope.componentId!==productId?'component:'+scope.componentId:'';
}

export function cncEstimateKey(scopes:string[]):string {
 return scopes.length?'CNC@'+[...new Set(scopes)].sort().join('|'):'CNC';
}

export function addonCncEstimateKey(scope:string):string { return 'CNC+'+scope; }

function selectedCncScopes(template:ShopTemplate,componentIds:string[],options:Record<string,unknown>,productId:string):string[] {
 const known=new Set([...template.parts.map(part=>cncScopeKey({componentId:part.component_product_id||productId,optionName:part.option_name,optionValue:part.option_value},productId)).filter(Boolean),...Object.keys(template.estimates||{}).filter(key=>key.startsWith('CNC@')).flatMap(key=>key.slice(4).split('|')),...Object.keys(template.estimates||{}).filter(key=>key.startsWith('CNC+')).map(key=>key.slice(4))]);
 return [...known].filter(scope=>{
  if(scope.startsWith('component:'))return componentIds.includes(scope.slice(10));
  if(!scope.startsWith('option:'))return false;
  const split=scope.indexOf('=',7);
  if(split<0)return false;
  return Object.entries(options).some(([name,value])=>text(name)===scope.slice(7,split)&&text(value)===scope.slice(split+1));
 }).sort();
}

export function estimatedComposition(template:ShopTemplate,componentIds:string[],options:Record<string,unknown>,productId:string,additiveCartCnc=false):ShopTemplate {
 const parts=template.parts.filter(part=>partMatchesOrder(part,componentIds,options,productId));
 const ids=new Set(parts.map(part=>part.id));
 const source=template.estimates||{},estimates=Object.fromEntries(Object.entries(source).filter(([key])=>(!['Assembly','Sanding','CNC'].some(stage=>key.startsWith(stage+':'))||ids.has(key.split(':')[1]))&&!key.startsWith('CNC@')&&!key.startsWith('CNC+')));
 if(!additiveCartCnc)return {...template,parts,estimates};
 const scopes=selectedCncScopes(template,componentIds,options,productId),key=cncEstimateKey(scopes);
 const base=source['CNC'],mainLegacy=parts.filter(part=>!cncScopeKey({componentId:part.component_product_id||productId,optionName:part.option_name,optionValue:part.option_value},productId)).reduce((sum,part)=>sum+Number(source['CNC:'+part.id]||0),0);
 const addonValues=scopes.map(scope=>source[addonCncEstimateKey(scope)]),hasNew=addonValues.some(value=>value!=null);
 const legacyParts=parts.filter(part=>source['CNC:'+part.id]!=null);
 const resolved=base==null?null:!scopes.length?Number(base)+mainLegacy:addonValues.every(value=>value!=null)?Number(base)+mainLegacy+addonValues.reduce<number>((sum,value)=>sum+Number(value),0):source[key]!=null?Number(source[key]):hasNew?null:legacyParts.some(part=>!!cncScopeKey({componentId:part.component_product_id||productId,optionName:part.option_name,optionValue:part.option_value},productId))?Number(base)+legacyParts.reduce((sum,part)=>sum+Number(source['CNC:'+part.id]),0):null;
 for(const estimateKey of Object.keys(estimates))if(estimateKey.startsWith('CNC@')||estimateKey.startsWith('CNC+')||estimateKey.startsWith('CNC:'))delete estimates[estimateKey];
 if(resolved==null)delete estimates['CNC'];else estimates['CNC']=resolved;
 return {...template,parts,estimates};
}

export function estimatedCncMinutes(template:Pick<ShopTemplate,'parts'|'estimates'>):number|null {
 const base=template.estimates?.['CNC'];
 if(base==null||!Number.isFinite(Number(base)))return null;
 const extras=template.parts.map(part=>template.estimates?.['CNC:'+part.id]).filter(value=>value!=null);
 return Number(base)+extras.reduce<number>((sum,value)=>sum+Number(value),0);
}
