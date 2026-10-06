import {describe,it,expect,vi} from 'vitest';
import {DeliveryReviewService} from './delivery-review.service';
import {packagingError,reviewComponents,reviewSignature,variantSignature} from '../../../../../supabase/functions/_shared/delivery-review-domain';

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
function saveMainCombination(s:ReturnType<typeof setup>){
 const main={...cart,id:'product',wix_options:{'Internal Shelf':'Yes'}};
 const addon={id:'rule:panel',product_name:panel.product_name,quantity:1};
 const contents=reviewComponents({wc_order_items:[main,addon]});
 const packages=[...s.tables['wc_shipping_packages'].map(box=>({...box,contents:[contents[0]]})),{...dimensions('Shelf/back panel',1185,670,40,19),contents:contents.slice(1)}];
 s.tables['wc_delivery_packaging_profiles']=[{signature:reviewSignature({wc_order_items:[main,addon]}),shipping_product_id:'product',template_item:{...main,profile_scope:'cart-main',merged_add_ons:[{rule_type:'Option',match_name:'Internal Shelf',match_value:'Yes'},{rule_type:'Add-on',match_name:panel.product_name,match_value:''}]},packages}];
 return packages;
}
describe('Automatic modular packaging',()=>{
 it('uses four saved Main + Shelf + Back panel boxes despite unselected Wix options and the real addon catalogue ID',async()=>{
  const s=setup(),saved=saveMainCombination(s),actual={wc_order_items:[cart,{...panel,catalog_reference:{catalogItemId:'panel-catalog'}}]};
  const boxes=await s.service.previewCartPackaging(actual,true);
  expect(boxes.map(box=>box.package_name)).toEqual(['Front/Sides/MDF wheels','Top/Buttom','Custors','Shelf/back panel']);
  expect(boxes[3]).toMatchObject({length_mm:1185,width_mm:670,height_mm:40,weight_kg:19});
  expect(boxes[3].contents.map(c=>[c.order_item_id,c.component_key])).toEqual([['main','option:internal shelf'],['panel','main']]);
  expect(boxes[3].contents[1].wix_product_id).toBe('panel-catalog');
  expect(packagingError(boxes,reviewComponents(actual))).toBe('');
  expect(saved[3].contents[1].order_item_id).toBe('rule:panel');
  expect(s.invoke).not.toHaveBeenCalled();
 });
 it('duplicates the four-box combination for each physical cart and addon',async()=>{
  const s=setup();saveMainCombination(s);
  const actual={wc_order_items:[{...cart,quantity:2},{...panel,quantity:2}]},boxes=await s.service.previewCartPackaging(actual,true);
  expect(boxes).toHaveLength(8);
  expect(boxes[3].contents.map(c=>c.unit_index)).toEqual([1,1]);
  expect(boxes[7].contents.map(c=>c.unit_index)).toEqual([2,2]);
  expect(packagingError(boxes,reviewComponents(actual))).toBe('');
 });
 it('keeps separate packaging when selected addons, quantities or addon size differ from the saved combination',async()=>{
  const s=setup();saveMainCombination(s);
  const cases=[
   {wc_order_items:[{...cart,wix_options:{...cart.wix_options,'Side shelves':'Yes'}},panel]},
   {wc_order_items:[cart,{...panel,quantity:2}]},
   {wc_order_items:[cart,{...panel,wix_options:{Size:'Large'}}]},
   {wc_order_items:[{...cart,wix_options:{...cart.wix_options,'Internal Shelf':'No'}},panel]},
  ];
  for(const actual of cases){
   const boxes=await s.service.previewCartPackaging(actual,true);
   expect(boxes.some(box=>box.package_name==='Shelf/back panel')).toBe(false);
   expect(packagingError(boxes,reviewComponents(actual))).toBe('');
  }
 });
 it('does not silently drop unknown saved contents or unconfigured physical options',async()=>{
  const s=setup(),saved=saveMainCombination(s);
  const actual={wc_order_items:[{...cart,wix_options:{...cart.wix_options,'Glass rack':'Yes'}},panel]};
  expect((await s.service.previewCartPackaging(actual,true)).some(box=>box.package_name==='Shelf/back panel')).toBe(false);
  saved[3].contents.push({...saved[3].contents[1],profile_item_key:'unknown'});
  expect((await s.service.previewCartPackaging(order,true)).some(box=>box.package_name==='Shelf/back panel')).toBe(false);
 });
 it('uses the current product-owned profile while ignoring an old order-only snapshot',async()=>{
  const s=setup(),single={wc_order_items:[cart]},contents=reviewComponents(single);
  s.tables['wc_delivery_packaging_profiles']=[{signature:variantSignature(cart),packages:[{...dimensions('Old order snapshot',999,999,999,99),contents}]}];
  expect((await s.service.previewCartPackaging(single,true))[0].package_name).toBe('Front/Sides/MDF wheels');
  s.tables['wc_delivery_packaging_profiles'][0]={signature:variantSignature(cart),shipping_product_id:'product',template_item:cart,packages:[{...dimensions('Product profile',1200,600,120,24),contents}]};
  const boxes=await s.service.previewCartPackaging(single,true);expect(boxes).toHaveLength(1);expect(boxes[0].package_name).toBe('Product profile');expect(packagingError(boxes,contents)).toBe('');
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
