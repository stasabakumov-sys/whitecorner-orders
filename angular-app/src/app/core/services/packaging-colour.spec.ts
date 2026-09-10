import {describe,it,expect} from 'vitest';
import {packageComponents,packagingSignature,variantSignature,expandVariant,canonicalPackagingSignature,findPackagingProfile,reviewInputKey} from '../../../../../supabase/functions/_shared/delivery-review-domain';
const item=(colour:string,foldable='YES',size='180x70')=>({id:'stand',product_name:'Arch Display',quantity:1,unit_price:500,catalog_reference:{catalogItemId:'arch'},wix_options:{Colour:colour,Foldable:foldable,Size:size}});
const legacy=(colour:string)=>{
 const components=packageComponents([item(colour)],()=>false,true);
 return {signature:JSON.stringify(components.map(c=>[c.profile_item_key,c.component_key,c.unit_index]).sort()),packages:[{package_name:'Backdrop/Shelves',length_mm:880,width_mm:730,height_mm:100,weight_kg:21,contents:components}]};
};
describe('Colour-independent packaging',()=>{
 it('reuses the existing Raw boxes for White without changing dimensions, while preserving Foldable and size distinctions',()=>{
  const saved=legacy('Raw'),original=JSON.stringify(saved);
  expect(canonicalPackagingSignature(saved.signature)).toBe(variantSignature(item('White')));
  expect(packagingSignature([item('Raw')])).toBe(packagingSignature([item('White')]));
  const boxes=expandVariant(saved.packages,item('White'));
  expect(boxes).toHaveLength(1);expect(boxes[0].length_mm).toBe(880);expect(boxes[0].weight_kg).toBe(21);
  expect(expandVariant(saved.packages,item('White','NO'))).toEqual([]);
  expect(expandVariant(saved.packages,item('White','YES','200x100'))).toEqual([]);
  expect(JSON.stringify(saved)).toBe(original);
 });
 it('finds legacy profiles beyond the first database page and rejects ambiguous colour variants',async()=>{
  const saved=legacy('Raw');let records:any[]=Array.from({length:250},(_,i)=>({signature:String(i)})).concat(saved);
  const db={from:()=>{const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:null}),order:()=>q,range:async(a:number,b:number)=>({data:records.slice(a,b+1)})};return q;}};
  expect((await findPackagingProfile(db,variantSignature(item('White')))).data).toBe(saved);
  records=[saved,legacy('Blue')];
  expect((await findPackagingProfile(db,variantSignature(item('White')))).error?.message).toContain('Multiple');
 });
 it('keeps colour in quote validity and includes structural add-ons in packaging',()=>{
  const order=(colour:string)=>({wc_order_items:[item(colour)],currency:'AUD'});
  expect(reviewInputKey(order('Raw'))).not.toBe(reviewInputKey(order('White')));
  const shelf={...item('White'),wix_options:{...item('White').wix_options,Shelf:'Yes'}};
  expect(variantSignature(shelf)).not.toBe(variantSignature(item('White')));
 });
});
