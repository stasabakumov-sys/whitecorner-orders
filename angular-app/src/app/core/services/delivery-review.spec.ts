import {describe,it,expect,vi} from 'vitest';
import {buildReviewRequest,deliveryCents,eligibleOrder,evaluateQuotes,insuranceFor,packagingError,restoreReviewPackages,reviewComponents,reviewInputKey,reviewOutcome,reviewSignature} from '../../../../../supabase/functions/_shared/delivery-review-domain';
import {DeliveryReviewService} from './delivery-review.service';
const order=()=>({id:'order',currency:'AUD',shipping:300,subtotal:1100,delivery_type:'Shipping',fulfillment_status:'NOT_FULFILLED',delivery_address:{city:'Test',subdivision:'AU-VIC',postalCode:'3000',country:'AU'},wc_order_items:[{id:'item',product_name:'Cart',quantity:2,unit_price:550,wix_options:{Shelf:'Yes','Side shelves':'Yes','Umbrella hole':'Yes','4 Castor Wheels':'Yes'},catalog_reference:{catalogItemId:'cart'}}]});
const rules=['Umbrella hole','4 Castor Wheels'].map(match_name=>({match_name,match_value:'Yes',effect_type:'No effect',active:true}));
const box=(contents:any[])=>({package_name:'Cart/Shelves',length_mm:1200,width_mm:600,height_mm:100,weight_kg:20,contents});
describe('Delivery cost policy and durable snapshots',()=>{
 it('uses Wix after-tax invoice delivery without adding GST twice or multiplying line totals by quantity',()=>{
  const o={...order(),shipping:86.36,raw_order:{taxIncludedInPrices:true,shippingInfo:{cost:{totalPriceAfterTax:{amount:'95.00'}}}}};
  expect(deliveryCents(o)).toBe(9500);
  const review={state:'quoted',evaluated_quotes:evaluateQuotes([{courierName:'Aramex',priceIncludingGst:85.5}],insuranceFor(['Free up to $500'],11000))};
  expect(reviewOutcome(review,o).status).toBe('within_target');
  expect(deliveryCents({...o,wc_order_items:[{product_name:'Delivery',unit_price:10,quantity:2,raw_item:{totalPriceAfterTax:{amount:'22.00'}}}]})).toBe(11700);
  expect(deliveryCents({...o,shipping:0,raw_order:{shippingInfo:{cost:{totalPriceAfterTax:{amount:'0.00'}}}}})).toBe(0);
 });
 it('selects the lowest allowed carrier including insurance and retains every excluded quote',()=>{
  const insurance=insuranceFor(['Free up to $500','+$30 up to $1500'],110000);
  expect(insurance?.fee_cents).toBe(3000);
  const raw=[{courierName:'TNT',priceIncludingGst:1},{courierName:'Aramex',priceIncludingGst:250},{courierName:'Couriers Please',priceIncludingGst:240},{courierName:'FedEx',priceIncludingGst:260},{courierName:'Unknown',priceIncludingGst:2}];
  const evaluated=evaluateQuotes(raw,insurance),review={state:'quoted',input_key:'key',evaluated_quotes:evaluated};
  expect(evaluated).toHaveLength(5);expect(evaluated.map(x=>x.quote)).toEqual(raw);
  const result=reviewOutcome(review,order(),'key');expect(result.status).toBe('within_target');expect(result.best.quote.courierName).toBe('Couriers Please');expect(result.best.total_cents).toBe(27000);
  expect(reviewOutcome(review,{...order(),shipping:299.99},'key').status).toBe('price_review_required');
 });
 it('handles zero price, missing values, inadequate insurance, and rounds required invoice UP',()=>{
  expect(insuranceFor(['Free up to $500'],110000)).toBeNull();
  expect(evaluateQuotes([{courierName:'FedEx',priceIncludingGst:null}],insuranceFor(['Free up to $500'],11000))[0].eligible).toBe(false);
  const review={state:'quoted',evaluated_quotes:evaluateQuotes([{courierName:'Aramex',priceIncludingGst:100}],insuranceFor(['Free up to $500'],11000))};
  expect(reviewOutcome(review,{...order(),shipping:0}).minimum_invoice_cents).toBe(11112);
  expect(reviewOutcome(review,{...order(),shipping:null}).status).toBe('invoice_required');
  expect(reviewOutcome({...review,evaluated_quotes:[]},order()).status).toBe('no_eligible_quotes');
 });
 it('recompares updated invoice without changing the stored quote and scopes exception to its exact inputs and invoice',()=>{
  const o=order(),input_key=reviewInputKey(o,rules),review={state:'quoted',input_key,evaluated_quotes:evaluateQuotes([{courierName:'FedEx',priceIncludingGst:290}],insuranceFor(['Free up to $500'],11000)),approval:{input_key,invoice_cents:30000}};
  const original=structuredClone(review);
  expect(reviewOutcome(review,o,input_key).status).toBe('approved_exception');
  expect(reviewOutcome(review,{...o,shipping:310},input_key).status).toBe('price_review_required');
  expect(reviewOutcome(review,{...o,shipping:350},input_key).status).toBe('within_target');
  expect(reviewOutcome(review,o,'changed').status).toBe('data_changed');expect(review).toEqual(original);
 });
 it('maps addons/quantity, permits multiple boxes, enforces all components and honors optional rules',()=>{
  const c=reviewComponents(order(),rules);expect(c).toHaveLength(6);
  const packages=[box(c.filter(x=>x.component_key==='main')),box(c.filter(x=>x.component_key!=='main')),box([c[0]])];
  expect(packagingError(packages,c)).toBe('');
  expect(packagingError([packages[0]],c)).toContain('Not assigned');
  expect(packagingError([box([c[0],c[0]])],c)).toContain('duplicate');
  expect(packagingError([{...box(c),weight_kg:0}],c)).toContain('positive');
  const request=buildReviewRequest(order(),packages);expect(request.items).toHaveLength(3);expect(request.items.every(x=>x.contents==='General/Others')).toBe(true);expect(request.items[0].length).toBe(120);
 });
 it('restores exact profile on the next identical order and detects composition/address/goods changes',()=>{
  const o=order(),c=reviewComponents(o,rules),templates=[box(c)];
  const next={...o,wc_order_items:o.wc_order_items.map(i=>({...i,id:'next-id'}))};
  expect(reviewSignature(next,rules)).toBe(reviewSignature(o,rules));
  expect(packagingError(restoreReviewPackages(templates,reviewComponents(next,rules)),reviewComponents(next,rules))).toBe('');
  const changed={...next,wc_order_items:next.wc_order_items.map(i=>({...i,quantity:3}))};
  expect(reviewSignature(changed,rules)).not.toBe(reviewSignature(o,rules));
  expect(reviewInputKey({...o,delivery_address:{...o.delivery_address,postalCode:'3001'}},rules)).not.toBe(reviewInputKey(o,rules));
 });
 it('excludes pickups and completed orders and adds delivery line items to invoice shipping',()=>{
  expect(eligibleOrder({...order(),delivery_type:'Pickup'})).toBe(false);expect(eligibleOrder({...order(),fulfillment_status:'FULFILLED'})).toBe(false);
  expect(eligibleOrder({...order(),fulfillment_status:'PARTIALLY_FULFILLED'})).toBe(true);
  expect(deliveryCents({...order(),shipping:10,wc_order_items:[{product_name:'Delivery',unit_price:100,quantity:1}]})).toBe(11000);
 });
 it('loading/viewing repeatedly only reads saved rows, never invokes courier or another function',async()=>{
  const invoke=vi.fn();const q:any={select:()=>q,neq:()=>q,eq:()=>q,order:()=>q,range:()=>q,then:(resolve:any)=>resolve({data:[],error:null})};
  const service=new DeliveryReviewService({client:{from:()=>q,functions:{invoke}}} as any);
  await service.load();await service.load();expect(invoke).not.toHaveBeenCalled();
 });
 it('blocks repeat packaging submissions while the first request is running',async()=>{
  let finish!:(value:any)=>void;
  const invoke=vi.fn(()=>new Promise(resolve=>finish=resolve));
  const service=new DeliveryReviewService({client:{functions:{invoke}}} as any);vi.spyOn(service,'load').mockResolvedValue();
  const first=service.savePackages('order',[],false);
  expect(service.busy()).toBe(true);expect(await service.savePackages('order',[],false)).toBe(false);
  finish({data:{ok:true},error:null});expect(await first).toBe(true);expect(invoke).toHaveBeenCalledOnce();expect(service.busy()).toBe(false);
 });
});
