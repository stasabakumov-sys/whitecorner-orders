import {describe,it,expect,vi} from 'vitest';
import {DeliveryReviewService} from './delivery-review.service';
import {DeliveryReviewComponent} from '../../features/delivery-review/delivery-review.component';
import {packagingError,reviewComponents,reviewSignature} from '../../../../../supabase/functions/_shared/delivery-review-domain';

// Catalogue measurements verified in Products; no customer/address payload.
const cart={id:'main',product_name:'MDF Mobile Bar Cart with Decorative Wheels – Foldable Serving Cart',quantity:1,catalog_reference:{catalogItemId:'938e83e2-5331-9ddf-82b2-85721b4f3170'},wix_options:{Colour:'White','Internal Shelf':'Yes','Side shelves':'No'}};
const panel={id:'panel',product_name:'Back panel with a pair of closable doors',quantity:1};
const order={order_number:'10825',wc_order_items:[cart,panel]};
const dimensions=(name:string,l:number,w:number,h:number,kg:number)=>({package_name:name,length_mm:l,width_mm:w,height_mm:h,weight_kg:kg});
function setup(){
 const tables:Record<string,any[]>={
  wc_shipping_products:[{id:'product',wix_product_id:cart.catalog_reference.catalogItemId,product_type:'Other',active:true}],
  wc_shipping_packages:[dimensions('Front/Sides/MDF wheels',1180,670,60,22.5),dimensions('Top/Buttom',1230,630,80,20),dimensions('Custors',280,150,150,3)].map((box,i)=>({...box,shipping_product_id:'product',source_type:'Base',size_key:'',active:true,package_no:i+1})),
  wc_shipping_rules:[{...dimensions('Internal shelf box',1200,600,4,9),rule_type:'Option',match_name:'Internal Shelf',match_value:'Yes'},{...dimensions('Back panel / doors box',1180,670,49,13),rule_type:'Add-on',match_name:panel.product_name},{...dimensions('Side shelves',630,230,100,6),rule_type:'Option',match_name:'Side shelves',match_value:'Yes'}].map(rule=>({...rule,shipping_product_id:'product',size_key:'',active:true,effect_type:'Add package',package_count_delta:1})),
  wc_delivery_packaging_profiles:[],
 };
 let fail='';const invoke=vi.fn();
 const from=vi.fn((table:string)=>{
  const filters:[string,unknown][]=[];
  const result=(single=false)=>{const data=tables[table].filter(row=>filters.every(([key,value])=>(key.includes('->>')?row.template_item?.profile_scope:row[key])===value));return {data:single?data[0]||null:data,error:table===fail?{message:'unavailable'}:null};};
  const q:any={select:()=>q,eq:(key:string,value:unknown)=>{filters.push([key,value]);return q;},order:()=>q,range:()=>Promise.resolve(result()),maybeSingle:()=>Promise.resolve(result(true)),single:()=>Promise.resolve(result(true)),then:(resolve:any)=>resolve(result())};return q;
 });
 return {tables,invoke,from,fail:(table:string)=>fail=table,service:new DeliveryReviewService({client:{from,functions:{invoke}}} as any)};
}
describe('Automatic modular packaging',()=>{
 it('previews current Products measurements before replacing manual edits and never quotes',async()=>{
  const s=setup(),c=new DeliveryReviewComponent(s.service),row={order_id:'trial',state:'packaging_required',wc_orders:order,packages:[]};
  s.service.rows.set([row]);await c.open(row);c.draft[0].weight_kg=24;c.confirmed=true;
  const original=c.draft;s.tables['wc_shipping_rules'][0].height_mm=40;
  s.tables['wc_delivery_packaging_profiles']=[{signature:reviewSignature(order),packages:structuredClone(original)}];
  await c.loadCartPackaging(row,true);
  expect(c.draft).toBe(original);expect(c.draft[3].height_mm).toBe(4);
  expect(c.packagingChanges().join(' ')).toContain('40 mm');
  c.packagingPreview.set(null);expect(c.draft[0].weight_kg).toBe(24);
  await c.loadCartPackaging(row,true);c.applyPackagingPreview();
  expect(c.draft[3].height_mm).toBe(40);expect(c.draft[0].weight_kg).toBe(22.5);
  expect(c.confirmed).toBe(false);expect(c.saveProfile).toBe(false);expect(s.invoke).not.toHaveBeenCalled();
  c.draft[3].height_mm=45;expect(c.draft[3].height_mm).toBe(45);
 });
 it('preserves the draft on sync failure and clears a pending preview when another order opens',async()=>{
  const s=setup(),c=new DeliveryReviewComponent(s.service),row={order_id:'trial',state:'packaging_required',wc_orders:order,packages:[]};
  s.service.rows.set([row]);await c.open(row);const original=c.draft;
  s.fail('wc_shipping_rules');await c.loadCartPackaging(row,true);
  expect(c.draft).toBe(original);expect(c.packagingPreview()).toBeNull();expect(s.service.error()).toContain('Could not load');
  s.fail('');await c.loadCartPackaging(row,true);
  await c.open({...row,order_id:'another',packages:original});
  expect(c.packagingPreview()).toBeNull();
 });
 it('loads three Main boxes, selected Shelf and separate Back panel without a Size or custom combination',async()=>{
  const s=setup(),boxes=await s.service.previewCartPackaging(order);
  expect(boxes.map(box=>[box.package_name,box.contents[0].order_item_id,box.contents[0].component_key])).toEqual([
   ['Front/Sides/MDF wheels','main','main'],['Top/Buttom','main','main'],['Custors','main','main'],['Internal shelf box','main','option:internal shelf'],['Back panel / doors box','panel','main'],
  ]);
  expect(boxes.reduce((sum,box)=>sum+box.weight_kg,0)).toBe(67.5);
  expect(packagingError(boxes,reviewComponents(order))).toBe('');expect(s.invoke).not.toHaveBeenCalled();
 });
 it('uses an exact saved combination without adding duplicate addon boxes',async()=>{
  const s=setup();s.tables['wc_delivery_packaging_profiles']=[{signature:reviewSignature(order),packages:[{...dimensions('Exact combination',1300,700,200,67.5),contents:reviewComponents(order)}]}];
  expect((await s.service.previewCartPackaging(order)).map(box=>box.package_name)).toEqual(['Exact combination']);
  expect(s.from.mock.calls.every(([table])=>table==='wc_delivery_packaging_profiles')).toBe(true);
 });
 it('ignores manual Size labels on the product card, including multiple lines',async()=>{
  const s=setup(),expected=await s.service.previewCartPackaging(order);
  for(const manual_sizes of ['Display label','Size I\nSize II','']){
   s.tables['wc_shipping_products'][0].manual_sizes=manual_sizes;
   expect(await s.service.previewCartPackaging(order)).toEqual(expected);
  }
 });
 it('accepts legacy null size keys together with empty keys for the same product-wide packaging',async()=>{
  const s=setup();
  s.tables['wc_shipping_packages'][0].size_key=null;
  s.tables['wc_shipping_rules'][0].size_key=null;
  s.tables['wc_shipping_rules'][1].size_key=null;
  expect(await s.service.previewCartPackaging(order)).toHaveLength(5);
 });
 it('retains found boxes when addon packaging is missing and blocks quoting',async()=>{
  const s=setup();expect(await s.service.previewCartPackaging({...order,order_number:'10824'})).toHaveLength(5);
  s.tables['wc_shipping_rules']=s.tables['wc_shipping_rules'].filter(rule=>rule.rule_type!=='Add-on');
  const c=new DeliveryReviewComponent(s.service),row={order_id:'partial',state:'packaging_required',wc_orders:order,packages:[]};
  s.service.rows.set([row]);await c.open(row);
  expect(c.draft).toHaveLength(4);expect(s.service.error()).toBe('');
  expect(c.packagingIssue(row)).toContain('Back panel');
  c.confirmed=true;await c.save(row);expect(s.invoke).not.toHaveBeenCalled();
 });
 it('loads complete Main packaging without assignments for decorative style options',async()=>{
  const s=setup(),size='Size I (W1200mm x H1200mm x D600mm)';
  s.tables['wc_shipping_packages'].forEach(box=>box.size_key='size i w1200mm x h1200mm x d600mm');
  const wc_orders={wc_order_items:[{...cart,wix_options:{Size:size,'Front Panel Style':'With Trim Frame','Lower Counter Edge':'Standard'}}]};
  const row={order_id:'style-options',state:'packaging_required',wc_orders,packages:[]},c=new DeliveryReviewComponent(s.service);
  s.service.rows.set([row]);await c.open(row);
  expect(c.draft).toHaveLength(3);expect(s.service.components(row).map(component=>component.component_key)).toEqual(['main']);
  await c.save(row);expect(s.invoke).not.toHaveBeenCalled();
  expect(c.packagingIssue(row)).toBe('');
 });
 it('leaves the draft intact on read failure and replaces it without duplication on repeated success',async()=>{
  const s=setup(),c=new DeliveryReviewComponent(s.service),row={order_id:'trial',state:'packaging_required',wc_orders:order,packages:[]};
  s.service.rows.set([row]);await c.open(row);c.addBox('main');const original=c.draft;
  s.fail('wc_shipping_rules');await c.loadCartPackaging(row);expect(c.draft).toBe(original);expect(s.service.error()).toContain('Could not load');
  s.fail('');await c.loadCartPackaging(row);await c.loadCartPackaging(row);
  expect(c.draft).toHaveLength(5);expect(c.packagingIssue(row)).toBe('');expect(c.confirmed).toBe(false);expect(c.saveProfile).toBe(false);expect(s.invoke).not.toHaveBeenCalled();
 });
 it('automatically loads on opening any order, but preserves saved packages',async()=>{
  const s=setup(),c=new DeliveryReviewComponent(s.service),row={order_id:'trial',state:'packaging_required',wc_orders:order,packages:[] as any[]};
  s.service.rows.set([row]);await c.open(row);
  expect(c.draft).toHaveLength(5);expect(c.cartPackagingLoading()).toBe(false);expect(c.confirmed).toBe(false);expect(s.invoke).not.toHaveBeenCalled();
  const preview=vi.spyOn(s.service,'previewCartPackaging');
  await c.open({...row,packages:c.draft});expect(preview).not.toHaveBeenCalled();expect(c.draft).toHaveLength(5);
  await c.open({...row,wc_orders:{...order,order_number:'10824'}});expect(preview).toHaveBeenCalledOnce();expect(c.draft).toHaveLength(5);
 });
 it('uses generic catalogue IDs and product types, multiplies quantity and excludes unselected options',async()=>{
  const s=setup(),other={...cart,id:'other',quantity:2,catalog_reference:{catalogItemId:'another-product'},wix_options:{'Internal Shelf':'No','Side shelves':'No'}};
  s.tables['wc_shipping_products'][0].wix_product_id='another-product';
  const boxes=await s.service.previewCartPackaging({wc_order_items:[other]});
  expect(boxes).toHaveLength(6);expect(boxes.every(b=>b.contents[0].component_key==='main')).toBe(true);
  expect(boxes.map(b=>b.contents[0].unit_index)).toEqual([1,1,1,2,2,2]);
 });
 it('never duplicates an addon that also has its own product card',async()=>{
  const s=setup();s.tables['wc_shipping_products'].push({id:'panel-product',product_name:panel.product_name,active:true});
  s.tables['wc_shipping_packages'].push({...dimensions('Duplicate panel',1180,670,49,13),shipping_product_id:'panel-product',source_type:'Base',active:true});
  expect(await s.service.previewCartPackaging(order)).toHaveLength(5);
 });
 it('fails closed when two Main lines could both own one addon',async()=>{
  const s=setup();
  await expect(s.service.previewCartPackaging({...order,wc_order_items:[cart,{...cart,id:'second'},panel]})).rejects.toThrow('Ambiguous');
 });
});
