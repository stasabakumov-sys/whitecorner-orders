import {describe,it,expect,vi} from 'vitest';
import {DeliveryReviewService} from './delivery-review.service';
import {reviewComponents,variantSignature,packagingError} from '../../../../../supabase/functions/_shared/delivery-review-domain';

const product={id:'half-arch',wix_product_id:'half-arch-wix',product_name:'Half Arch Shelf Wall – Plywood Display Arch with Shelves',product_type:'Backdrop',active:true};
const template={id:product.id,product_name:product.product_name,quantity:1,catalog_reference:{catalogItemId:product.wix_product_id},wix_options:{Size:'Small (150cm x 90cm)',Foldable:'YES'}};
const item={...template,id:'order-half-arch',wix_options:{...template.wix_options,'Curve Direction (Front View)':'Right Curve',Colour:'Raw',Shelves:'Flat surface shelves'}};
const shared={size_key:'1500x900:foldable',package_name:'Box',length_mm:930,width_mm:780,height_mm:80};
const profile={signature:variantSignature(template),shipping_product_id:product.id,template_item:template,packages:[{backdrop_size_key:shared.size_key,weight_kg:14,contents:reviewComponents({wc_order_items:[template]})}]};
function setup(){
 const tables:Record<string,any[]>={wc_shipping_products:[product],wc_shipping_packages:[],wc_shipping_rules:[],wc_delivery_packaging_profiles:[structuredClone(profile)],wc_backdrop_packaging_dimensions:[shared]};
 let fail='';const invoke=vi.fn();
 const from=vi.fn((table:string)=>{
  const filters:[string,unknown][]=[];
  const result=(single=false,start=0,end=Infinity)=>{
   const rows=(tables[table]||[]).filter(row=>filters.every(([key,value])=>(key==='template_item->>profile_scope'?row.template_item?.profile_scope:row[key])===value)).slice(start,end+1);
   return {data:single?rows[0]||null:rows,error:table===fail?{message:'Unavailable'}:null};
  };
  const q:any={select:()=>q,eq:(key:string,value:unknown)=>{filters.push([key,value]);return q;},order:()=>q,range:(a:number,b:number)=>Promise.resolve(result(false,a,b)),maybeSingle:()=>Promise.resolve(result(true)),then:(resolve:any)=>resolve(result())};return q;
 });
 return {tables,from,invoke,fail:(table:string)=>fail=table,service:new DeliveryReviewService({client:{from,functions:{invoke}}} as any)};
}

describe('Product-owned Backdrop packaging in Delivery and Fulfilment',()=>{
 it('reuses the Small Foldable model weight despite additional Wix choices and assigns every real component',async()=>{
  const s=setup(),before=structuredClone(s.tables),order={wc_order_items:[item]};
  expect(variantSignature(item)).not.toBe(profile.signature);
  const boxes=await s.service.previewCartPackaging(order,true);
  expect(boxes).toHaveLength(1);expect(boxes[0]).toMatchObject({package_name:'Box',length_mm:930,width_mm:780,height_mm:80,weight_kg:14});
  expect(boxes[0].contents).toEqual(reviewComponents(order));expect(boxes[0].contents).toHaveLength(3);
  expect(packagingError(boxes,reviewComponents(order))).toBe('');expect(s.tables).toEqual(before);expect(s.invoke).not.toHaveBeenCalled();
 });
 it('shares packing for Painted and Raw and equivalent metric labels, while retaining original order choices',async()=>{
  const s=setup();
  for(const Colour of ['Raw','White','Painted']){
   const target={...item,wix_options:{...item.wix_options,Colour,Size:'150cm x 90cm'}};
   const boxes=await s.service.previewCartPackaging({wc_order_items:[target]},true);
   expect(boxes).toHaveLength(1);expect(boxes[0].weight_kg).toBe(14);expect(boxes[0].contents).toEqual(reviewComponents({wc_order_items:[target]}));
  }
 });
 it('does not substitute another size, construction or an absent size/folding choice',async()=>{
  const s=setup();
  for(const wix_options of [{Size:'Medium (160cm x 90cm)',Foldable:'YES'},{Size:template.wix_options.Size,Foldable:'NO'},{Size:template.wix_options.Size},{Foldable:'YES'},{Size:'150 x 90',Foldable:'YES'}]){
   expect(await s.service.previewCartPackaging({wc_order_items:[{...item,wix_options}]},true)).toEqual([]);
  }
 });
 it('uses one box per physical product and retains multiple option components in their corresponding unit',async()=>{
  const s=setup(),order={wc_order_items:[{...item,quantity:2,wix_options:{...item.wix_options,Shelves:'2'}}]};
  const boxes=await s.service.previewCartPackaging(order,true);
  expect(boxes).toHaveLength(2);expect(boxes.map(box=>box.weight_kg)).toEqual([14,14]);
  expect(boxes[0].contents.map(c=>[c.component_key,c.unit_index])).toEqual([['main',1],['option:curve direction front view',1],['option:shelves',1],['option:shelves',2]]);
  expect(boxes[1].contents.map(c=>[c.component_key,c.unit_index])).toEqual([['main',2],['option:curve direction front view',2],['option:shelves',3],['option:shelves',4]]);
  expect(packagingError(boxes,reviewComponents(order))).toBe('');
 });
 it('does not borrow another model weight even when its product name and box size match',async()=>{
  const s=setup(),target={...item,catalog_reference:{catalogItemId:'different-model'}};
  s.tables['wc_shipping_products'].push({...product,id:'another-product',wix_product_id:'different-model'});
  expect(await s.service.previewCartPackaging({wc_order_items:[target]},true)).toEqual([]);
  s.tables['wc_delivery_packaging_profiles'][0].shipping_product_id=null;
  expect(await s.service.previewCartPackaging({wc_order_items:[item]},true)).toEqual([]);
 });
 it('requires review for conflicting own profiles and fails visibly if shared dimensions cannot be read',async()=>{
  const s=setup();s.tables['wc_delivery_packaging_profiles'].push({...profile,signature:'duplicate',packages:[{...profile.packages[0],weight_kg:15}]});
  await expect(s.service.previewCartPackaging({wc_order_items:[item]},true)).rejects.toThrow('Multiple saved Backdrop weights');
  s.tables['wc_delivery_packaging_profiles'].pop();s.tables['wc_backdrop_packaging_dimensions']=[];
  await expect(s.service.previewCartPackaging({wc_order_items:[item]},true)).rejects.toThrow('Shared Backdrop dimensions');
  s.fail('wc_delivery_packaging_profiles');
  await expect(s.service.previewCartPackaging({wc_order_items:[item]},true)).rejects.toThrow('Could not load saved packaging');
 });
 it('does not invent a missing model weight from complete shared dimensions',async()=>{
  const s=setup();s.tables['wc_delivery_packaging_profiles'][0].packages[0].weight_kg=null;
  const order={wc_order_items:[item]},boxes=await s.service.previewCartPackaging(order,true);
  expect(packagingError(boxes,reviewComponents(order))).toContain('positive dimensions and weight');
 });
 it('keeps an explicitly requested historical order combination unchanged',async()=>{
  const s=setup(),contents=reviewComponents({wc_order_items:[item]});
  s.tables['wc_delivery_packaging_profiles'].push({signature:variantSignature(item),packages:[{package_name:'Historical combination',length_mm:900,width_mm:800,height_mm:100,weight_kg:16,contents}]});
  expect((await s.service.previewCartPackaging({wc_order_items:[item]}))[0]).toMatchObject({package_name:'Historical combination',weight_kg:16});
 });
});
