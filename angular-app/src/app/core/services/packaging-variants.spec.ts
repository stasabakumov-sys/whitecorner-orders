import {describe,it,expect,vi} from 'vitest';
import {expandVariant,hasSizeOption,variantSignature} from '../../../../../supabase/functions/_shared/delivery-review-domain';
import {reviewComponents,packagingError} from '../../../../../supabase/functions/_shared/delivery-review-domain';
import {PackagingVariantsComponent} from '../../features/shipping-data/packaging-variants.component';
const item=(size='Size I',quantity=1)=>({id:'cart',product_name:'Cart',quantity,catalog_reference:{catalogItemId:'catalog'},wix_options:{Size:size,'Internal Shelf':'Yes'}});
const box=(contents:any[])=>({package_name:'Box',length_mm:1000,width_mm:500,height_mm:100,weight_kg:10,contents});
describe('Exact packaging variants',()=>{
 it('never substitutes Size I for Size II or another addon configuration',()=>{
  const source=item(),packages=[box(reviewComponents({wc_order_items:[source]}))];
  expect(variantSignature(source)).not.toBe(variantSignature(item('Size II')));
  expect(expandVariant(packages,item('Size II'))).toEqual([]);
  expect(expandVariant(packages,{...source,wix_options:{Size:'Size I','Internal Shelf':'No'}})).toEqual([]);
  expect(hasSizeOption(source)).toBe(true);expect(hasSizeOption({id:'i'})).toBe(false);
 });
 it('restores independent boxes and a component in multiple boxes for every physical quantity',()=>{
  const c=reviewComponents({wc_order_items:[item()]}),templates=[box([c[0]]),{...box(c),length_mm:700}];
  const target={...item('Size I',2),id:'next'},result=expandVariant(templates,target);
  expect(result).toHaveLength(4);expect(result.map(p=>p.length_mm)).toEqual([1000,700,1000,700]);
  expect(result[0].contents[0].unit_index).toBe(1);expect(result[2].contents[0].unit_index).toBe(2);
  expect(packagingError(result,reviewComponents({wc_order_items:[target]}))).toBe('');
  expect(templates[0].contents[0].order_item_id).toBe('cart');
 });
 it('copies boxes independently, rebinds Contents and requires confirmation before save',async()=>{
  const invoke=vi.fn(),c=new PackagingVariantsComponent({client:{functions:{invoke}}} as any);c.product={id:'cart',product_name:'Cart',wix_product_id:'catalog'};
  const original={signature:variantSignature(item()),template_item:item(),packages:[box(reviewComponents({wc_order_items:[item()]}))]};c.variants.set([original]);c.open(original.signature);c.copy();
  expect(c.options.find(o=>o.name==='Size')?.value).toBe('');expect(c.issue()).toContain('Complete');
  c.options.find(o=>o.name==='Size')!.value='Size II';c.remap();c.boxes[0].length_mm=1300;
  expect(original.packages[0].length_mm).toBe(1000);expect(c.issue()).toBe('');await c.save();expect(invoke).not.toHaveBeenCalled();
  expect(c.boxes[0].contents[0].profile_item_key).toContain('size ii');
 });
 it('requires every component and positive dimensions',()=>{
  const c=new PackagingVariantsComponent({} as any);c.product={id:'cart',product_name:'Cart',wix_product_id:'catalog'};c.options=[{name:'Size',value:'Size II'},{name:'Internal Shelf',value:'Yes'}];c.addBox();
  expect(c.issue()).toContain('positive');c.boxes=[box([c.components()[0]])];expect(c.issue()).toContain('Internal Shelf');
 });
});
