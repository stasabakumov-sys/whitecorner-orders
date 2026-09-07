import {describe,it,expect,vi} from 'vitest';
import {signal} from '@angular/core';
import {ProductionService} from './production.service';
import {ProductionUnitDrawerComponent} from '../../shared/production-unit-drawer/production-unit-drawer.component';

describe('Production delivery approval',()=>{
 it('uses the authenticated action and preserves local state on rejection',async()=>{
  const invoke=vi.fn().mockResolvedValue({error:{context:{json:async()=>({error:'Production blocked'})}}});
  const orders={orders:signal<any[]>([])},activity={rows:signal<any[]>([])};
  const s=new ProductionService(orders as any,{client:{functions:{invoke}}} as any,{} as any,activity as any);
  const view:any={order:{id:'order'},unit:{id:'unit',production_status:'New'},status:'New'};
  await expect(s.changeStatus(view,'CNC')).rejects.toThrow('Production blocked');
  expect(view.status).toBe('New');expect(activity.rows()).toEqual([]);
  const note={id:'note',new_status:'CNC'};invoke.mockResolvedValue({data:{ok:true,activity:note}});
  await s.changeStatus(view,'CNC');expect(view.status).toBe('CNC');expect(activity.rows()).toEqual([note]);
  expect(invoke).toHaveBeenLastCalledWith('delivery-cost-review',{body:{action:'production-status',orderId:'order',unitId:'unit',next:'CNC'}});
 });
 it('blocks controls until approved and prevents repeated status requests',async()=>{
  const s:any={checkDelivery:vi.fn().mockResolvedValue({allowed:false}),changeStatus:vi.fn().mockResolvedValue(undefined)};
  const drawer=new ProductionUnitDrawerComponent(s,{navigate:vi.fn()} as any);drawer.view={order:{id:'order'}} as any;
  await drawer.statusChanged('CNC');expect(s.changeStatus).not.toHaveBeenCalled();
  await drawer.checkDelivery();expect(drawer.deliveryAllowed()).toBe(false);
  await drawer.statusChanged('CNC');expect(s.changeStatus).not.toHaveBeenCalled();
  s.checkDelivery.mockResolvedValue({allowed:true});await drawer.checkDelivery();
  await Promise.all([drawer.statusChanged('CNC'),drawer.statusChanged('CNC')]);expect(s.changeStatus).toHaveBeenCalledTimes(1);
 });
});
