import {describe,it,expect} from 'vitest';
import {signal} from '@angular/core';
import {orderProducts} from './order-products';
import {ProductionService} from '../services/production.service';
import {DeliveryReviewComponent} from '../../features/delivery-review/delivery-review.component';
import {FulfilmentComponent} from '../../features/fulfilment/fulfilment.component';
import {orderCostingView} from '../../features/costing/order-costing-view';

const item=(id:string,name:string,quantity=1):any=>({id,product_name:name,quantity,wix_options:{Size:'II',Colour:'White'},wc_production_units:Array.from({length:quantity},(_,n)=>({id:id+n,unit_index:n+1,production_status:'New'}))});
const board=new ProductionService({} as any,{} as any,{} as any,{} as any);
describe('Shared product composition',()=>{
 it('uses the same main product IDs in Board, Packing and Costing while retaining component source IDs',()=>{
  const main=item('cart','Mobile cart',2),addon=item('shelf','Side shelves',2);
  const order:any={id:'order',wc_order_items:[main,addon,item('delivery','Shipping fee')]};
  const units=board.unitsForOrder(order);
  const review=new DeliveryReviewComponent({rows:signal([]),rules:signal([])} as any);
  const boxes:any[]=[{contents:[{order_item_id:'cart'}]},{contents:[{order_item_id:'shelf'}]}];
  const groups=review.productGroups({wc_orders:order,state:'quoted',packages:boxes});
  expect(groups.map(g=>g.id)).toEqual(['cart']);expect(groups[0].boxes).toHaveLength(2);
  expect(groups[0].sources.map(i=>i.id)).toEqual(['cart','shelf']);
  expect(units.map(u=>u.mainItem.id)).toEqual(['cart','cart']);expect(units.map(u=>u.addons[0].quantity)).toEqual([1,1]);
  expect(orderCostingView(order,[],units).products.map(p=>p.item.id)).toEqual(['cart']);
  const packing=Object.create(FulfilmentComponent.prototype) as FulfilmentComponent;
  expect(packing.compositionGroups(order).map(p=>p.item.id)).toEqual(['cart']);
  expect(boxes[1].contents[0].order_item_id).toBe('shelf');
 });
 it('does not duplicate an addon across multiple possible products or guess unequal quantities',()=>{
  for(const items of [[item('a','Cart'),item('b','Backdrop'),item('s','Side shelves')],[item('a','Cart',2),item('s','Side shelves',1)]]){
   expect(orderProducts(items).unresolved.map(i=>i.id)).toEqual(['s']);
   expect(board.unitsForOrder({wc_order_items:items} as any).every(u=>u.addons.length===0)).toBe(true);
  }
 });
 it('keeps distinct product IDs and options without turning options into products',()=>{
  const result=orderProducts([item('a','Cart'),item('b','Cart')]);
  expect(result.products.map(p=>p.item.id)).toEqual(['a','b']);expect(result.products[0].components).toHaveLength(1);
 });
 it('shows each shared physical box once even when components belong to different products',()=>{
  const c=new DeliveryReviewComponent({rows:signal([]),rules:signal([])} as any);
  const row:any={state:'quoted',wc_orders:{wc_order_items:[item('a','Cart'),item('b','Backdrop')]},packages:[{contents:[{order_item_id:'a'},{order_item_id:'b'}]}]};
  expect(c.productGroups(row).flatMap(g=>g.boxes)).toHaveLength(1);expect(c.linkedBoxes(row,'b')).toHaveLength(1);expect(c.linkedBoxes(row,'a')).toHaveLength(0);
 });
});
