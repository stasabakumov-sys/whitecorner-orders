import {describe,it,expect,vi} from 'vitest';
import {composeModularPackages,expandVariant,hasSizeOption,packagingError,reviewComponents,variantSignature} from '../../../../../supabase/functions/_shared/delivery-review-domain';
import {PackagingVariantsComponent} from '../../features/shipping-data/packaging-variants.component';
const item=(size='Size I',quantity=1)=>({id:'cart',product_name:'Cart',quantity,catalog_reference:{catalogItemId:'catalog'},wix_options:{Size:size,'Internal Shelf':'Yes'}});
const box=(contents:any[])=>({package_name:'Box',length_mm:1000,width_mm:500,height_mm:100,weight_kg:10,contents});
describe('Exact packaging variants',()=>{
 it('composes every Cart from reusable base, selected option and separate add-on boxes',()=>{
  const cart={id:'cart',product_name:'Cart',quantity:1,catalog_reference:{catalogItemId:'catalog'},wix_options:{Size:'Size I',Colour:'White','Internal Shelf':'Yes','Side shelves':'No'}};
  const addon={id:'doors',product_name:'Back panel with a pair of closable doors',quantity:1};
  const products=[{id:'p',wix_product_id:'catalog',product_name:'Cart',product_type:'Cart',active:true}];
  const templates=[{shipping_product_id:'p',size_key:'size i',source_type:'Base',package_no:1,package_name:'Cart base',length_mm:1180,width_mm:670,height_mm:60,weight_kg:22.5,active:true},{shipping_product_id:'p',size_key:'size ii',source_type:'Base',package_no:1,package_name:'Wrong size',length_mm:2000,width_mm:700,height_mm:100,weight_kg:30,active:true}];
  const rules=[{shipping_product_id:'p',size_key:'size i',rule_type:'Option',match_name:'Internal Shelf',match_value:'Yes',effect_type:'Add package',package_count_delta:1,package_name:'Shelf',length_mm:700,width_mm:500,height_mm:80,weight_kg:8,active:true},{shipping_product_id:'p',size_key:'size i',rule_type:'Option',match_name:'Side shelves',match_value:'Yes',effect_type:'Add package',package_count_delta:1,package_name:'Sides',length_mm:600,width_mm:400,height_mm:80,weight_kg:6,active:true},{shipping_product_id:'p',size_key:'size i',rule_type:'Add-on',match_name:addon.product_name,effect_type:'Add package',package_count_delta:1,package_name:'Doors',length_mm:900,width_mm:500,height_mm:80,weight_kg:9,active:true},{shipping_product_id:'p',size_key:'size ii',rule_type:'Option',match_name:'Internal Shelf',match_value:'Yes',effect_type:'Add package',package_count_delta:1,package_name:'Wrong shelf',length_mm:900,width_mm:600,height_mm:90,weight_kg:10,active:true}];
  const boxes=composeModularPackages({wc_order_items:[cart,addon]},products,templates,rules);
  expect(boxes.map(b=>b.package_name)).toEqual(['Cart base','Shelf','Doors']);
  expect(packagingError(boxes,reviewComponents({wc_order_items:[cart,addon]}))).toBe('');
  expect(composeModularPackages({wc_order_items:[{...cart,wix_options:{...cart.wix_options,'Side shelves':'Yes'}}]},products,templates,rules).map(b=>b.package_name)).toEqual(['Cart base','Shelf','Sides']);
 });
 it('uses the sole manual product size when Wix omitted Size from the order',()=>{
  const cart={id:'cart',product_name:'Mobile Bar Cart',quantity:1,catalog_reference:{catalogItemId:'catalog'},wix_options:{Colour:'White','Internal Shelf':'Yes','Side shelves':'No'}};
  const products=[{id:'p',wix_product_id:'catalog',product_name:cart.product_name,product_type:'Cart',manual_sizes:'Size II: W1400 × D600 × H1000 mm',active:true}];
  const size='size ii w1400 d600 h1000 mm',templates=[{shipping_product_id:'p',size_key:size,source_type:'Base',package_no:1,package_name:'Cart base',length_mm:1400,width_mm:600,height_mm:100,weight_kg:22,active:true}];
  const rules=[{shipping_product_id:'p',size_key:size,rule_type:'Option',match_name:'Internal Shelf',match_value:'Yes',effect_type:'Add package',package_count_delta:1,package_name:'Shelf',length_mm:700,width_mm:500,height_mm:80,weight_kg:8,active:true}];
  const boxes=composeModularPackages({wc_order_items:[cart]},products,templates,rules);
  expect(boxes.map(box=>box.package_name)).toEqual(['Cart base','Shelf']);
  expect(packagingError(boxes,reviewComponents({wc_order_items:[cart]}))).toBe('');
  expect(composeModularPackages({wc_order_items:[cart]},[{...products[0],manual_sizes:`${products[0].manual_sizes}\nSize III: W1600 x D600 x H1000 mm`}],templates,rules)).toEqual([]);
 });
 it('selects one manually saved exact Main + multiple Add-ons variant',()=>{
  const cart={id:'cart',product_name:'Cart',quantity:1,catalog_reference:{catalogItemId:'catalog'},wix_options:{Size:'Size I','Internal Shelf':'Yes','Side shelves':'Yes'}};
  const mainItem={...cart,wix_options:{Size:'Size I','Internal Shelf':'Yes','Side shelves':'Yes'}};
  const contents=reviewComponents({wc_order_items:[mainItem]});
  const mainVariants=[{shipping_product_id:'p',template_item:{...mainItem,profile_scope:'cart-main',merged_add_ons:[{rule_type:'Option',match_name:'Internal Shelf',match_value:'Yes'},{rule_type:'Option',match_name:'Side shelves',match_value:'Yes'}]},packages:[{package_name:'Main with shelf and sides',length_mm:1430,width_mm:630,height_mm:120,weight_kg:24.5,contents}]}];
  const products=[{id:'p',wix_product_id:'catalog',product_name:'Cart',product_type:'Cart',active:true}];
  const rules=[{shipping_product_id:'p',size_key:'size i',rule_type:'Option',match_name:'Internal Shelf',match_value:'Yes',effect_type:'Replace profile',package_count_delta:1,package_name:'Old shelf box',length_mm:1400,width_mm:600,height_mm:40,weight_kg:5.5,active:true},{shipping_product_id:'p',size_key:'size i',rule_type:'Option',match_name:'Side shelves',match_value:'Yes',effect_type:'Add package',package_count_delta:1,package_name:'Side shelves',length_mm:630,width_mm:230,height_mm:100,weight_kg:6,active:true}];
  const boxes=composeModularPackages({wc_order_items:[cart]},products,[],rules,[],mainVariants);
  expect(boxes.map(box=>box.package_name)).toEqual(['Main with shelf and sides']);
  expect(boxes[0].contents.map(content=>content.component_key).sort()).toEqual(['main','option:internal shelf','option:side shelves']);
 });
 it('keeps reusable Main and separate boxes until an exact saved combination exists',()=>{
  const cart={id:'cart',product_name:'Cart',quantity:1,catalog_reference:{catalogItemId:'catalog'},wix_options:{Size:'Size I','Internal Shelf':'Yes'}};
  const products=[{id:'p',wix_product_id:'catalog',product_name:'Cart',product_type:'Cart',active:true}];
  const templates=[{shipping_product_id:'p',size_key:'size i',source_type:'Base',package_no:1,package_name:'Reusable Main',length_mm:1180,width_mm:670,height_mm:60,weight_kg:22.5,active:true}];
  const separate={shipping_product_id:'p',size_key:'size i',rule_type:'Option',match_name:'Internal Shelf',match_value:'Yes',effect_type:'Add package',package_count_delta:1,package_name:'Shelf box',length_mm:1200,width_mm:600,height_mm:50,weight_kg:9,active:true};
  const mainItem={...cart,wix_options:{Size:'Size I','Internal Shelf':'Yes'}},contents=reviewComponents({wc_order_items:[mainItem]});
  const variants=[{shipping_product_id:'p',template_item:{...mainItem,profile_scope:'cart-main'},packages:[{package_name:'Main + Shelf',length_mm:1230,width_mm:670,height_mm:110,weight_kg:24,contents}]}];
  expect(composeModularPackages({wc_order_items:[cart]},products,templates,[separate],[],[]).map(box=>box.package_name)).toEqual(['Reusable Main','Shelf box']);
  expect(composeModularPackages({wc_order_items:[cart]},products,templates,[separate],[],variants).map(box=>box.package_name)).toEqual(['Main + Shelf']);
 });
 it('combines a separate Add-on order line only in the exact saved combination',()=>{
  const cart={id:'cart',product_name:'Cart',quantity:1,catalog_reference:{catalogItemId:'catalog'},wix_options:{Size:'Size I'}};
  const doors={id:'doors',product_name:'Back panel with doors',quantity:1,wix_options:{}};
  const products=[{id:'p',wix_product_id:'catalog',product_name:'Cart',product_type:'Cart',active:true}],templates=[{shipping_product_id:'p',size_key:'size i',source_type:'Base',package_name:'Main',length_mm:1000,width_mm:500,height_mm:100,weight_kg:20,active:true}];
  const rule={shipping_product_id:'p',size_key:'size i',rule_type:'Add-on',match_name:'Back panel with doors',match_value:'',effect_type:'Add package',package_count_delta:1,package_name:'Doors box',length_mm:900,width_mm:500,height_mm:70,weight_kg:8,active:true};
  const profileItems=[cart,{...doors,id:'rule:doors'}],contents=reviewComponents({wc_order_items:profileItems});
  const variants=[{shipping_product_id:'p',template_item:{...cart,profile_scope:'cart-main',merged_add_ons:[{rule_type:'Add-on',match_name:'Back panel with doors',match_value:''}]},packages:[{package_name:'Main + doors',length_mm:1050,width_mm:550,height_mm:140,weight_kg:24,contents}]}];
  expect(composeModularPackages({wc_order_items:[cart,doors]},products,templates,[rule],[],variants).map(box=>box.package_name)).toEqual(['Main + doors']);
  expect(composeModularPackages({wc_order_items:[cart]},products,templates,[rule],[],variants).map(box=>box.package_name)).toEqual(['Main']);
 });
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
