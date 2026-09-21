import {describe,it,expect} from 'vitest';
import {editedSavedPackages} from '../../../../../supabase/functions/_shared/delivery-review-domain';
import {reviewComponents,variantSignature,expandVariant} from '../../../../../supabase/functions/_shared/delivery-review-domain';

const product={id:'product',wix_product_id:'catalog'};
const item={id:'order-item',product_name:'Counter',quantity:1,catalog_reference:{catalogItemId:'catalog'},wix_options:{Length:'1190mm',Height:'900mm','Logo - Diameter 600mm':'No'}};
function fixture(){
 const components=reviewComponents({wc_order_items:[item]});
 const profile={signature:variantSignature(item),template_item:null,packages:[{package_name:'Top',length_mm:1210,width_mm:615,height_mm:70,weight_kg:9,contents:components}]};
 const draft=structuredClone(profile.packages);draft[0].width_mm=620;
 draft[0].contents=draft[0].contents.map(c=>({...c,order_item_id:'product',id:'product:main:1',profile_item_key:'incorrect reconstructed key'}));
 return {profile,draft};
}
describe('Legacy saved packaging edits',()=>{
 it('retains exact options and component identity through save, reload and order expansion',()=>{
  const {profile,draft}=fixture();const packages=editedSavedPackages(profile,product,draft);
  const reloaded=JSON.parse(JSON.stringify({...profile,packages,shipping_product_id:product.id}));
  expect(reloaded.signature).toBe(variantSignature(item));
  const boxes=expandVariant(reloaded.packages,item,[]);
  expect(boxes).toHaveLength(1);expect(boxes[0].width_mm).toBe(620);
  expect(boxes[0].contents).toEqual(profile.packages[0].contents);
  expect(profile.packages[0].width_mm).toBe(615);
 });
 it('rejects another product even if its name matches',()=>{
  const {profile,draft}=fixture();expect(()=>editedSavedPackages(profile,{...product,wix_product_id:'other'},draft)).toThrow('identity');
  expect(()=>editedSavedPackages({...profile,shipping_product_id:'other'},product,draft)).toThrow('another product');
 });
 it('rejects invalid measurements and missing assignments without changing stored packages',()=>{
  const {profile,draft}=fixture();draft[0].width_mm=0;
  expect(()=>editedSavedPackages(profile,product,draft)).toThrow('positive');
  draft[0].width_mm=620;draft[0].contents=[];
  expect(()=>editedSavedPackages(profile,product,draft)).toThrow('assign');
  expect(profile.packages[0].width_mm).toBe(615);
 });
});
