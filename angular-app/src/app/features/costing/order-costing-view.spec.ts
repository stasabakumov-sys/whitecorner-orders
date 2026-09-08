import {describe,it,expect,vi} from 'vitest';
import {signal} from '@angular/core';
import {orderCostingView} from './order-costing-view';
import {ProductionService} from '../../core/services/production.service';
import {ProductCostingComponent} from './product-costing.component';

const board=new ProductionService({} as any,{} as any,{} as any,{} as any);
const item=(id:string,quantity=1,status='New',name='Cart')=>({id,product_name:name,quantity,wix_options:{Size:'II'},wc_production_units:Array.from({length:quantity},(_,n)=>({id:`${id}-${n+1}`,unit_index:n+1,production_status:status}))});
const order=(items:any[])=>({id:'o',order_number:'TEST',currency:'AUD',wc_order_items:items});
const cost=(i:string,u=1,total:number|null=10)=>({order_id:'o',item_id:i,unit_id:`${i}-${u}`,unit_index:u,state:total==null?'materials_required':'calculated',total_gst:total,variant_key:i});
const view=(o:any,c:any[])=>orderCostingView(o,c,board.unitsForOrder(o));
describe('Order material composition',()=>{
 it('accepts four carts with one replacement top each and preserves the legacy Board units',()=>{
  const main=item('a',4,'Painting','Collapsible Plywood Mobile Bar Classic'),upgrade=item('b',4,'Painting','Tasmanian Oak Timber Benchtop Upgrade');
  const o={...order([main,upgrade]),order_number:'10812'};
  const v=view(o,Array.from({length:4},(_,n)=>({...cost('b',n+1,null),item_id:'a'})));
  expect(v.issues).toEqual([]);expect(v.products).toHaveLength(1);expect(v.products[0].replacement.id).toBe('b');
  expect(v.products[0].units.map((u:any)=>u.id)).toEqual(['b-1','b-2','b-3','b-4']);
 });
 it('keeps ambiguous or partial tabletop upgrades blocked',()=>{
  for(const items of [[item('a',4),item('b',2,'New','Timber Benchtop Upgrade')],[item('a'),item('other'),item('b',1,'New','Timber Benchtop Upgrade')]]){
   expect(view(order(items),[cost('a')]).issues.length).toBeGreaterThan(0);
  }
 });
 it('groups by Board product identity, keeps quantities and totals every unit once',()=>{
  const v=view(order([item('a',2),item('b',1,'New','Backdrop')]),[cost('a'),cost('a',2,15),cost('b',1,20)]);
  expect(v.products).toHaveLength(2);expect(v.products[0].costs).toHaveLength(2);expect(v.total).toBe(45);expect(v.partial).toBe(false);expect(v.issues).toEqual([]);
 });
 it('does not merge different products with identical names or options',()=>{
  expect(view(order([item('a'),item('b')]),[cost('a'),cost('b')]).products).toHaveLength(2);
 });
 it('shows missing costs as incomplete, not zero, and keeps Ready visible but excluded',()=>{
  const v=view(order([item('a'),item('b',1,'Ready')]),[cost('a',1,null)]);
  expect(v.total).toBeNull();expect(v.partial).toBe(true);expect(v.issues).toEqual([]);expect(v.products).toHaveLength(2);
 });
 it('reports separate addon lines instead of guessing their cost allocation',()=>{
  const v=view(order([item('a'),item('b',1,'New','Integrated ice storage shelf')]),[cost('a'),cost('b')]);
  expect(v.products).toHaveLength(1);expect(v.issues.join(' ')).toContain('Integrated ice storage shelf');expect(v.partial).toBe(true);
 });
 it('reports missing units, stale mapping and duplicate records',()=>{
  const o=order([item('a',2)]);o.wc_order_items[0].wc_production_units.pop();
  expect(view(o,[cost('a')]).issues.join(' ')).toContain('quantity');
  expect(view(order([item('a')]),[{...cost('a'),item_id:'other'}]).issues.join(' ')).toContain('another order line');
  expect(view(order([item('a')]),[cost('a'),cost('a')]).issues.join(' ')).toContain('Duplicate');
 });
 it('ignores delivery lines and flags missing calculation records for eligible units',()=>{
  expect(view(order([item('a'),item('d',1,'New','Delivery')]),[cost('a')]).issues).toEqual([]);
  expect(view(order([item('a')]),[]).issues.join(' ')).toContain('record is missing');
 });
 it('opens the whole order despite a product search and blocks saves on mapping uncertainty',async()=>{
  const o=order([item('a'),item('b',1,'New','Backdrop')]);
  const saveProfile=vi.fn();const s={orders:signal([o]),costs:signal([cost('a'),cost('b')]),saveProfile};
  const c=new ProductCostingComponent(s as any,board);c.search='Backdrop';expect(c.visibleOrders()).toHaveLength(1);c.openOrder('o');expect(c.activeOrder()?.products).toHaveLength(2);
  s.costs.set([{...cost('a'),item_id:'wrong'},cost('b')]);c.selected=cost('a');await c.save();expect(saveProfile).not.toHaveBeenCalled();
 });
});
