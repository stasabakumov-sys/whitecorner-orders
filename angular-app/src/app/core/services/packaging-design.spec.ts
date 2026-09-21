import {describe,it,expect} from 'vitest';
import {reviewComponents,variantSignature,canonicalPackagingSignature,expandVariant,isNonPackagingComponent} from '../../../../../supabase/functions/_shared/delivery-review-domain';

const item=(style='With Trim Frame',edge='Standard',size='Size I')=>({id:'cart',product_name:'Cart',quantity:1,catalog_reference:{catalogItemId:'cart-id'},wix_options:{Size:size,'Front Panel Style':style,'Lower Counter Edge':edge}});
describe('Decorative cart design does not change packaging',()=>{
 it('ignores both design values but preserves size and physical add-ons',()=>{
  const original=item(),before=structuredClone(original);
  expect(reviewComponents({wc_order_items:[original]}).map(c=>c.component_key)).toEqual(['main']);
  expect(variantSignature(original)).toBe(variantSignature(item('Plain','Different edge')));
  expect(variantSignature(original)).not.toBe(variantSignature(item('Plain','Standard','Size II')));
  expect(variantSignature({...original,wix_options:{...original.wix_options,'Internal Shelf':'Yes'}})).not.toBe(variantSignature(original));
  expect(original).toEqual(before);
 });
 it('restores legacy design-specific packaging without rewriting saved data',()=>{
  const target=item('Plain'),main=reviewComponents({wc_order_items:[target]})[0];
  const key=JSON.stringify(['cart-id',['front panel style with trim frame','lower counter edge standard','size size i']])+':0';
  const contents=[{...main,profile_item_key:key},...['front panel style','lower counter edge'].map(name=>({...main,id:'cart:option:'+name+':1',component_key:'option:'+name,profile_item_key:key}))];
  const signature=JSON.stringify(contents.map(c=>[c.profile_item_key,c.component_key,c.unit_index]).sort());
  const boxes=[{package_name:'Main',length_mm:1200,width_mm:600,height_mm:100,weight_kg:20,contents}],before=structuredClone(boxes);
  expect(canonicalPackagingSignature(signature)).toBe(variantSignature(target));
  expect(expandVariant(boxes,target)[0].contents.map(c=>c.component_key)).toEqual(['main']);
  expect(isNonPackagingComponent(contents[1])).toBe(true);expect(boxes).toEqual(before);
 });
});
