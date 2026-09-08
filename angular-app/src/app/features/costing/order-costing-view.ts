import {ProductionUnitView} from '../../core/models/production.models';
import {orderProducts,isDeliveryLine,tabletopReplacement} from '../../core/utils/order-products';

// Use Board identities, never an option label or a product name, to join costs.
export function orderCostingView(order:any, costs:any[], units:ProductionUnitView[]) {
 const issues:string[]=[];
 const products:any[]=[];
 const seen=new Set<string>();
 const composition=orderProducts(order.wc_order_items||[]);
 const replacement=tabletopReplacement(order.wc_order_items||[]);
 for(const p of composition.products)products.push({item:p.item,components:p.components,replacement:replacement?.item.id===p.item.id?replacement.upgrade:null,units:[],costs:[]});
 for(const view of units){
  let product=products.find(p=>p.item.id===view.mainItem.id);
  if(!product){product={item:view.mainItem,units:[],costs:[]};products.push(product);}
  product.units.push(view.unit);
  if(seen.has(view.unit.id))issues.push('A production unit is assigned to more than one product.');
  seen.add(view.unit.id);
  const matches=costs.filter(c=>c.unit_id===view.unit.id);
  if(matches.length>1)issues.push('Duplicate calculation for a production unit.');
  const cost=matches[0];
  if(cost){
   product.costs.push(cost);
   if(cost.item_id!==view.mainItem.id)issues.push(`${view.mainItem.product_name}: calculation is attached to another order line.`);
   if(cost.changed)issues.push(`${view.mainItem.product_name}: order composition changed; review the saved calculation.`);
  }else if(view.unit.production_status!=='Ready')issues.push(`${view.mainItem.product_name}: calculation record is missing for unit ${view.unit.unit_index}.`);
 }
 for(const item of order.wc_order_items||[]){
  if(isDeliveryLine(item))continue;
  const p=products.find(p=>p.item.id===item.id);
  if(!p&&replacement?.upgrade.id!==item.id){const parent=composition.products.find(p=>p.components.some(c=>c.id===item.id));issues.push(parent?`${item.product_name}: component of ${parent.item.product_name}; a combined material profile needs review.`:`${item.product_name||'Unnamed order line'}: cannot assign this line to a costed product.`);}
  else if(p&&(!Number.isInteger(Number(item.quantity))||Number(item.quantity)<1||p.units.length!==Number(item.quantity)))issues.push(`${item.product_name}: product quantity does not match Production Board units.`);
 }
 if(costs.some(c=>!seen.has(c.unit_id)))issues.push('A saved calculation cannot be matched to a current Production Board product.');
 const partial=!!issues.length||products.some(p=>p.units.some((u:any)=>!p.costs.some((c:any)=>c.unit_id===u.id&&c.state==='calculated'&&!c.changed)));
 const total=costs.some(c=>c.total_gst!=null)?costs.reduce((sum,c)=>sum+Number(c.total_gst||0),0):null;
 return {order,products,costs,issues:[...new Set(issues)],partial,total};
}
