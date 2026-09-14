import {describe,it,expect,vi} from 'vitest';
import {signal} from '@angular/core';
import {DeliveryReviewService} from './delivery-review.service';
import {DeliveryReviewComponent} from '../../features/delivery-review/delivery-review.component';
import {ShippingDataComponent} from '../../features/shipping-data/shipping-data.component';
import {variantSignature} from '../../../../../supabase/functions/_shared/delivery-review-domain';
const item={id:'item',product_name:'MDF roof cart',wix_options:{Size:'Size II'}};
describe('Safe packaging variant navigation',()=>{
 it('loads reusable Base plus the selected Cart option when no exact variant exists',async()=>{
  const cart={...item,catalog_reference:{catalogItemId:'catalog'},wix_options:{'Internal Shelf':'Yes','Side shelves':'No'}};
  const rows:any={wc_shipping_products:[{id:'cart-product',wix_product_id:'catalog',product_name:cart.product_name,product_type:'Cart',active:true}],wc_shipping_packages:[{shipping_product_id:'cart-product',source_type:'Base',package_no:1,package_name:'Base',length_mm:1000,width_mm:600,height_mm:100,weight_kg:20,active:true}],wc_shipping_rules:[{shipping_product_id:'cart-product',rule_type:'Option',match_name:'Internal Shelf',match_value:'Yes',effect_type:'Add package',package_count_delta:1,package_name:'Shelf',length_mm:700,width_mm:500,height_mm:80,weight_kg:8,active:true}]};
  const from=vi.fn((table:string)=>{const q:any={select:()=>q,eq:()=>q,order:()=>q,range:async()=>({data:[],error:null}),maybeSingle:async()=>({data:null,error:null}),then:(resolve:any)=>resolve({data:rows[table]||[],error:null})};return q;});
  const s=new DeliveryReviewService({client:{from}} as any);expect((await s.variantPackages(cart)).map(box=>box.package_name)).toEqual(['Base','Shelf']);
 });
 it('checks the exact option signature and navigates by associated product ID',async()=>{
  const eq=vi.fn(),from=vi.fn((table:string)=>{const q:any={select:()=>q,eq:(...args:any[])=>{eq(...args);return q;},maybeSingle:async()=>({data:table==='wc_delivery_packaging_profiles'?{shipping_product_id:'correct'}:{id:'correct'}})};return q;});
  const s=new DeliveryReviewService({client:{from}} as any);
  expect(await s.variantTarget(item)).toEqual({productId:'correct',signature:variantSignature(item)});
  expect(eq).toHaveBeenCalledWith('signature',variantSignature(item));expect(eq).toHaveBeenCalledWith('id','correct');
 });
 it('does not guess a product when no variant exists, without a saved profile',async()=>{
  for(const profile of [null]){
   const from=vi.fn(()=>{const q:any={select:()=>q,eq:()=>q,order:()=>q,range:async()=>({data:[]}),maybeSingle:async()=>({data:profile})};return q;});
   const s=new DeliveryReviewService({client:{from}} as any);await expect(s.variantTarget(item)).rejects.toThrow('No packaging variant');expect(from).toHaveBeenCalledTimes(2);
  }
 });
 it('keeps the order and draft open on failure and suppresses repeated clicks',async()=>{
  let reject:any;const variantTarget=vi.fn(()=>new Promise((_resolve,r)=>reject=r)),navigate=vi.fn();
  const s={rows:signal([]),busy:signal(false),variantTarget};const c=new DeliveryReviewComponent(s as any,undefined,{navigate} as any);c.selectedId.set('order');c.draft=[{package_name:'Unfinished box'}] as any;
  const pending=c.configureVariant(item);await c.configureVariant(item);expect(variantTarget).toHaveBeenCalledTimes(1);
  reject(Error('No packaging variant'));await pending;expect(navigate).not.toHaveBeenCalled();expect(c.selectedId()).toBe('order');expect(c.draft[0].package_name).toBe('Unfinished box');expect(c.variantNotices()['item']).toBe('No packaging variant');
 });
 it('opens only the verified product and variant when the check succeeds',async()=>{
  const navigate=vi.fn();const c=new DeliveryReviewComponent({rows:signal([]),busy:signal(false),variantTarget:async()=>({productId:'correct',signature:'exact'})} as any,undefined,{navigate} as any);await c.configureVariant(item);
  expect(navigate).toHaveBeenCalledWith(['/shipping-data'],{queryParams:{productId:'correct',variant:'exact'}});
 });
 it('never defaults an explicit missing or ambiguous link to the first product',async()=>{
  const products=[{id:'first',product_name:'Other cart'},{id:'second',product_name:'Other cart'}];
  for(const params of [{product:'Missing cart'},{product:'Other cart'},{productId:'missing'},{productId:'second'},{}]){
   const client={from:(table:string)=>{const q:any={select:()=>q,eq:()=>q,order:()=>table==='wc_delivery_packaging_profiles'?q:Promise.resolve({data:table==='wc_shipping_products'?products:[]}),range:async()=>({data:[]})};return q;}};
   const route={snapshot:{queryParamMap:{get:(key:string)=>(params as any)[key]??null}}};
   const c=new ShippingDataComponent({client} as any,route as any);await c.load();
   expect(c.selectedId()).toBe((params as any).productId==='second'?'second':null);
  }
 });
});
