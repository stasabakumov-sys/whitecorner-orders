import {TestBed} from '@angular/core/testing';
import {vi} from 'vitest';
import {ShopPhoneService} from './shop-phone.service';
import {productChoice} from '../../features/shop-floor/shop-floor.models';
import {eligibleOrder} from '../../../../../supabase/functions/_shared/delivery-review-domain';
import {FulfilmentService} from './fulfilment.service';

describe('Shop Floor phone and test orders',()=>{
 it('keeps only operational product fields in the offline choice',()=>{
  expect(productChoice({unit:{id:'unit',private:'no'},order:{id:'order',buyer_email:'private@example.invalid',total:12},mainItem:{product_name:'Cart',unit_price:12},code:'TEST-CART',status:'CNC'} as any))
   .toEqual({unit:{id:'unit'},order:{id:'order'},mainItem:{product_name:'Cart'},code:'TEST-CART',status:'CNC'});
 });
 it('captures install prompts and leaves a declined installation available through browser instructions',async()=>{
  vi.stubGlobal('matchMedia',()=>({matches:false}));
  const phone=TestBed.runInInjectionContext(()=>new ShopPhoneService());
  const event=new Event('beforeinstallprompt',{cancelable:true});const prompt=vi.fn(async()=>{});
  Object.assign(event,{prompt,userChoice:Promise.resolve({outcome:'dismissed'})});window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);expect(phone.canInstall()).toBe(true);
  await phone.install();expect(prompt).toHaveBeenCalledOnce();expect(phone.installed()).toBe(false);expect(phone.installing()).toBe(false);
  window.dispatchEvent(new Event('offline'));expect(phone.online()).toBe(false);
  window.dispatchEvent(new Event('online'));expect(phone.online()).toBe(true);
  vi.unstubAllGlobals();
 });
 it('never creates fulfilment or quotes for a Ready Hub test order',async()=>{
  const order={id:'test',order_source:'hub_test',delivery_type:'Shipping'};
  expect(eligibleOrder(order)).toBe(false);
  const db={client:{from:vi.fn()}};
  const service=new FulfilmentService(db as any,{orders:()=>[order]} as any,{} as any,{unitsForOrder:()=>[{status:'Ready'}]} as any,{} as any);
  await service.ensureReadyOrders();expect(db.client.from).not.toHaveBeenCalled();
 });
});
