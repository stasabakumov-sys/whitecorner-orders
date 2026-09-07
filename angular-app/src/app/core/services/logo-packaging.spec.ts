import {describe,it,expect} from 'vitest';
import {orderItemOptionLabels,packageComponents,packagingSignature,packagingError,goodsCents,isNonPackagingComponent} from '../../../../../supabase/functions/_shared/delivery-review-domain';
const prompt='Please email us a ready-to-use SVG format file only, in black and white, featuring your company name';
const answer='I would like to add a logo but I dont have it in that file type.';
describe('Logo presentation and packaging exclusions',()=>{
 it('hides only the SVG instruction across Wix option sources; keeps Logo and real options',()=>{
  for(const source of [{wix_options:{[prompt]:answer}},{custom_text_fields:{[prompt]:answer}},{description_lines:[{name:prompt,plainText:{original:answer}}]},{raw_item:{catalogReference:{options:{options:{[prompt]:answer}}}}}]){
   const item={id:'i',...source,wix_options:{...(source as any).wix_options,'Logo or Personalization':'Yes',Size:'Size II'}};
   expect(orderItemOptionLabels(item)).toEqual(['Logo or Personalization: Yes','Size: Size II']);
  }
 });
 it('Logo yes/no never creates components or changes the physical profile; price remains intact',()=>{
  const item=(logo:string)=>({id:'i',product_name:'Table',quantity:2,unit_price:225,wix_options:{'Logo or Personalization':logo,[prompt]:answer,'Internal Shelf':'Yes'}});
  const yes=item('Yes'),no=item('No'),components=packageComponents([yes]);
  expect(components.map(c=>c.component_key)).toEqual(['main','main','option:internal shelf','option:internal shelf']);
  expect(packagingSignature([yes])).toBe(packagingSignature([no]));
  expect(goodsCents({wc_order_items:[yes]})).toBe(45000);
  expect(packagingError([{length_mm:980,width_mm:460,height_mm:70,weight_kg:13,contents:components,package_name:'Table'}],components)).toBe('');
 });
 it('filters historical instruction/logo assignments without hiding real addons or customer instructions',()=>{
  expect(isNonPackagingComponent({component_key:'option:please email us a ready to use svg format file only in black and white featuring your company name'})).toBe(true);
  expect(isNonPackagingComponent({component_key:'option:logo or personalization'})).toBe(true);
  expect(isNonPackagingComponent({component_key:'option:internal shelf'})).toBe(false);
  expect(orderItemOptionLabels({id:'i',custom_text_fields:{'Customer instructions':'Please use our updated SVG artwork'}})).toHaveLength(1);
 });
});
