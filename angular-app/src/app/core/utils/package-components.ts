import {OrderItemRow} from '../models/order.models';
import {orderItemOptionLabels} from './order-item-display';
export interface PackageComponent {
  id:string; order_item_id:string; product_name:string; component_key:string; component_name:string;
  unit_index:number; quantity:number; profile_item_key:string; wix_product_id:string|null;
}
export const componentNormal=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function productId(item:OrderItemRow){const c=item.catalog_reference as any,r=item.raw_item as any;return String(c?.catalogItemId||c?.productId||r?.catalogReference?.catalogItemId||r?.productId||'');}
const attribute=/^(colou?r|size|dimensions?|width|height|length|finish|foldable|material|personalisation|personalization|engraving|notes?|message)$/i;
export function packageComponents(items:OrderItemRow[],ignored:(name:string,value:string)=>boolean=()=>false):PackageComponent[]{
 const occurrences=new Map<string,number>();
 return items.flatMap(item=>{
  const labels=orderItemOptionLabels(item,Number.MAX_SAFE_INTEGER);
  const signature=JSON.stringify([productId(item)||componentNormal(item.product_name||''),[...new Set(labels.map(componentNormal))].sort()]);
  const occurrence=occurrences.get(signature)||0;occurrences.set(signature,occurrence+1);
  const profile_item_key=signature+':'+occurrence;
  const components=new Map<string,{name:string,count:number}>([['main',{name:item.product_name||'Unnamed product',count:1}]]);
  for(const label of labels){
   const split=label.indexOf(':');if(split<0)continue;
   const name=label.slice(0,split).trim(),value=label.slice(split+1).trim();
   if(attribute.test(name)||/^(no|none|false|not selected|not required|without|0)(\b|$)/i.test(value)||ignored(name,value))continue;
   const numeric=/^\d+$/.test(value)?Number(value):1;if(numeric<1)continue;
   const key='option:'+componentNormal(name);
   if(!components.has(key))components.set(key,{name:name+( /^(yes|true)$/i.test(value)?'':': '+value),count:numeric});
  }
  const qty=Math.max(1,Math.floor(Number(item.quantity)||1));
  return [...components].flatMap(([component_key,c])=>Array.from({length:qty*c.count},(_,n)=>({
   id:`${item.id}:${component_key}:${n+1}`,order_item_id:item.id,product_name:item.product_name||'Unnamed product',
   component_key,component_name:c.name,unit_index:n+1,quantity:1,profile_item_key,wix_product_id:productId(item)||null,
  })));
 });
}
export const componentIdentity=(c:{order_item_id:string;component_key?:string;unit_index?:number})=>`${c.order_item_id}:${c.component_key||'main'}:${c.unit_index||1}`;
export const packagingSignature=(items:OrderItemRow[])=>JSON.stringify(packageComponents(items).map(c=>[c.profile_item_key,c.component_key,c.unit_index]).sort());
