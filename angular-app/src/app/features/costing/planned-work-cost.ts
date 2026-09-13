import {ShopPart,ShopTemplate,paintOperations,paintLabel} from '../shop-floor/shop-floor.models';

export type WorkType='cnc'|'assembly'|'sanding'|'painting';
export interface WorkRate{work_type:WorkType;label:string;rate_gst_hour:number|null;sort_order:number;updated_at:string}
export interface PlannedWorkRow{key:string;label:string;workType:WorkType;minutes:number|null;rate:number|null;cost:number|null}

function number(value:unknown){return value==null||value===''?null:Number.isFinite(Number(value))?Number(value):null;}
function partMinutes(template:ShopTemplate,stage:'Assembly'|'Sanding'){
 const values=(template.parts||[]).map((part:ShopPart)=>number(template.estimates?.[`${stage}:${part.id}`]));
 return values.some(value=>value===null)?null:values.reduce<number>((sum,value)=>sum+(value||0),0);
}
export function plannedWorkRows(template:ShopTemplate,rates:WorkRate[],productName=''):PlannedWorkRow[]{
 const rate=(type:WorkType)=>number(rates.find(row=>row.work_type===type)?.rate_gst_hour);
 const row=(key:string,label:string,workType:WorkType,minutes:number|null):PlannedWorkRow=>{const hourly=rate(workType);return{key,label,workType,minutes,rate:hourly,cost:minutes===null||hourly===null?null:Math.round(minutes*hourly/60*100)/100};};
 return [
  row('CNC','CNC','cnc',number(template.estimates?.['CNC'])),
  row('Assembly','Assembly','assembly',partMinutes(template,'Assembly')),
  row('Sanding','Sanding','sanding',partMinutes(template,'Sanding')),
  ...paintOperations(productName).map(op=>row(op,paintLabel(op,paintOperations(productName)),/sanding/i.test(op)?'sanding':'painting',number(template.estimates?.['Painting:'+op]))),
 ];
}
export function plannedTotal(rows:PlannedWorkRow[],painted:boolean){
 const included=rows.filter(row=>painted||!['First primer','First sanding','Second primer','Second sanding','Finish coat'].includes(row.key));
 return included.some(row=>row.cost===null)?null:Math.round(included.reduce((sum,row)=>sum+(row.cost||0),0)*100)/100;
}
