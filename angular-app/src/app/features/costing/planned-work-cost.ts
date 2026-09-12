import {ShopPart,ShopTemplate} from '../shop-floor/shop-floor.models';

export type WorkType='cnc'|'assembly'|'sanding'|'painting';
export interface WorkRate{work_type:WorkType;label:string;rate_gst_hour:number|null;sort_order:number;updated_at:string}
export interface PlannedWorkRow{key:string;label:string;workType:WorkType;minutes:number|null;rate:number|null;cost:number|null;optional?:boolean}

function number(value:unknown){return value==null||value===''?null:Number.isFinite(Number(value))?Number(value):null;}
function partMinutes(template:ShopTemplate,stage:'Assembly'|'Sanding'){
 const values=(template.parts||[]).map((part:ShopPart)=>number(template.estimates?.[`${stage}:${part.id}`]));
 return values.some(value=>value===null)?null:values.reduce<number>((sum,value)=>sum+(value||0),0);
}
export function plannedWorkRows(template:ShopTemplate,rates:WorkRate[]):PlannedWorkRow[]{
 const rate=(type:WorkType)=>number(rates.find(row=>row.work_type===type)?.rate_gst_hour);
 const row=(key:string,label:string,workType:WorkType,minutes:number|null,optional=false):PlannedWorkRow=>{const hourly=rate(workType);return{key,label,workType,minutes,rate:hourly,cost:minutes===null||hourly===null?null:Math.round(minutes*hourly/60*100)/100,optional};};
 return [
  row('CNC','CNC','cnc',number(template.estimates?.['CNC'])),
  row('Assembly','Assembly','assembly',partMinutes(template,'Assembly')),
  row('Sanding','Sanding','sanding',partMinutes(template,'Sanding')),
  row('First primer','First primer','painting',number(template.estimates?.['Painting:First primer'])),
  row('First sanding','First sanding','sanding',number(template.estimates?.['Painting:First sanding'])),
  row('Second primer','Second primer','painting',number(template.estimates?.['Painting:Second primer'])),
  row('Second sanding','Second sanding','sanding',number(template.estimates?.['Painting:Second sanding'])),
  row('Finish coat','Finish coat','painting',number(template.estimates?.['Painting:Finish coat'])),
  row('Repaint','Repaint','painting',number(template.estimates?.['Painting:Repaint']),true),
 ];
}
export function plannedTotal(rows:PlannedWorkRow[],painted:boolean){
 const included=rows.filter(row=>!row.optional&&(painted||!['First primer','First sanding','Second primer','Second sanding','Finish coat'].includes(row.key)));
 return included.some(row=>row.cost===null)?null:Math.round(included.reduce((sum,row)=>sum+(row.cost||0),0)*100)/100;
}
