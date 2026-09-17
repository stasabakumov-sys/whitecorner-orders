import {describe,expect,it,vi} from 'vitest';
import {ShippingDataComponent} from './shipping-data.component';

const rule={id:'rule',shipping_product_id:'cart',package_count_delta:1,package_name:'Shelf box',length_mm:600,width_mm:400,height_mm:80,weight_kg:6};
describe('Shipping rule save feedback',()=>{
 it('does not show inactive legacy placeholder rules as selectable package rules',()=>{
  const component=new ShippingDataComponent({} as any,undefined,{} as any);
  component.rules.set([{...rule,active:true},{...rule,id:'placeholder',match_name:'Shelf add-on',active:false}] as any);
  expect(component.productRules('cart').map(item=>item.id)).toEqual(['rule']);
 });
 it('shows a row-level saved result after the database confirms the update',async()=>{
  const eq=vi.fn().mockResolvedValue({error:null});
  const component=new ShippingDataComponent({client:{from:()=>({update:()=>({eq})})}} as any,undefined,{} as any);
  await component.saveRule(rule);
  expect(component.ruleFeedback()[rule.id]).toEqual({ok:true,text:'Saved ✓'});
  expect(component.ruleSaving(rule.id)).toBe(false);
 });
 it('selects one or several Add-ons for a Main combination without changing their package rules',()=>{
  const component=new ShippingDataComponent({} as any,undefined,{} as any),second={...rule,id:'second',match_name:'Side shelves'};
  component.toggleMainAddOn(rule as any,true);component.toggleMainAddOn(second as any,true);
  expect(component.mainAddOns().map(item=>item.id)).toEqual(['rule','second']);
  component.toggleMainAddOn(rule as any,false);expect(component.mainAddOns().map(item=>item.id)).toEqual(['second']);
 });
 it('lists a saved combination after reload and restores its Add-on checkboxes when opened',()=>{
  const component=new ShippingDataComponent({} as any,undefined,{parts:()=>[]} as any),shelf={...rule,id:'shelf',rule_type:'Option',match_name:'Internal Shelf',match_value:'Yes',size_key:'size i',effect_type:'Add package',active:true},side={...rule,id:'side',rule_type:'Option',match_name:'Side shelves',match_value:'Yes',size_key:'size i',effect_type:'Add package',active:true};
  const profile={signature:'combined',template_item:{profile_scope:'cart-main',wix_options:{Size:'Size I','Internal Shelf':'Yes','Side shelves':'Yes'},merged_add_ons:[{rule_type:'Option',match_name:'Side shelves',match_value:'Yes'},{rule_type:'Option',match_name:'Internal Shelf',match_value:'Yes'}]},packages:[{},{}]};
  const product={id:'cart',product_name:'Cart',product_type:'Cart',saved_profiles:[profile]};component.products.set([product] as any);component.rules.set([shelf,side] as any);
  component.updateCatalog('cart',{variants:[{choices:{Size:'Size I'}}]});
  expect(component.cartMainProfiles(product as any)).toEqual([profile]);expect(component.cartMainProfileLabel(profile)).toBe('Side shelves + Internal Shelf');
  component.openCartMainProfile(product as any,profile);expect(component.mainAddOns().map(item=>item.id)).toEqual(['side','shelf']);expect(component.cartMainProfileSelected(profile)).toBe(true);
 });
 it('adds a newly confirmed Main combination to the visible saved list immediately',()=>{
  const component=new ShippingDataComponent({} as any,undefined,{} as any),product={id:'cart',product_name:'Cart',saved_profiles:[]},profile={signature:'combined',template_item:{profile_scope:'cart-main'}};
  component.products.set([product] as any);component.storeCartMainProfile(product as any,profile);
  expect(component.products()[0].saved_profiles).toEqual([profile]);
 });
 it('does not reuse another Backdrop model weight for the same size',()=>{
  const saved={signature:'source-profile',template_item:{wix_options:{Size:'190cm x 95cm',Foldable:'YES',Colour:'White'}},packages:[{length_mm:1980,width_mm:1040,height_mm:90,weight_kg:22,contents:[{component_key:'main',unit_index:1,product_name:'Ripple Arch Backdrop'}]}]};
  const source={id:'source',product_name:'Ripple Arch Backdrop',product_type:'Backdrop',saved_profiles:[saved]},target={id:'target',product_name:'Half Ripple Arch Backdrop',product_type:'Backdrop',saved_profiles:[]};
  const component=new ShippingDataComponent({} as any,undefined,{parts:()=>[{shipping_product_id:'target',options:{Size:'190cm x 95cm'}}]} as any);component.products.set([source,target] as any);
  component.updateCatalog('target',{variants:[{choices:{Size:'190cm x 95cm'}},{choices:{Size:'180cm x 90cm'}}]});
  const profiles=component.packingProfiles(target as any);expect(profiles).toHaveLength(0);expect(component.reusableProfileCount(target as any)).toBe(0);
  expect(component.productSizes(target as any)).toEqual(['190cm x 95cm','180cm x 90cm']);expect(component.sizePackingCount(target as any,'180cm x 90cm')).toBe(0);
 });
 it('keeps the draft and shows a row-level reason when required measurements are missing',async()=>{
  const from=vi.fn(),component=new ShippingDataComponent({client:{from}} as any,undefined,{} as any);
  component.setRuleDraft(rule.id,'length_mm','');
  await component.saveRule(rule);
  expect(component.ruleFeedback()[rule.id]).toEqual({ok:false,text:'Complete the box name, L, W, H and kg before saving.'});
  expect(component.ruleDrafts.get(rule.id)?.length_mm).toBeNull();
  expect(from).not.toHaveBeenCalled();
 });
 it('shows the database error beside the same rule and allows retry',async()=>{
  const component=new ShippingDataComponent({client:{from:()=>({update:()=>({eq:async()=>({error:{message:'offline'}})})})}} as any,undefined,{} as any);
  await component.saveRule(rule);
  expect(component.ruleFeedback()[rule.id]).toEqual({ok:false,text:'Could not save: offline. Please retry.'});
  expect(component.ruleSaving(rule.id)).toBe(false);
 });
 it('keeps shared Backdrop dimension edits beside a failed save',async()=>{
  const component=new ShippingDataComponent({client:{rpc:vi.fn().mockResolvedValue({data:null,error:{message:'offline'}})}} as any,undefined,{} as any),key='1800x900:foldable';
  component.setDimensionDraft(key,'package_name','Backdrop');component.setDimensionDraft(key,'length_mm',930);component.setDimensionDraft(key,'width_mm',930);component.setDimensionDraft(key,'height_mm',90);
  await component.saveBackdropDimensions(key);
  expect(component.dimensionFeedback[key]).toEqual({ok:false,text:'Could not save dimensions: offline'});expect(component.dimensionValue(key,'height_mm')).toBe(90);
 });
 it('stores confirmed shared Backdrop dimensions and clears their draft',async()=>{
  const row={size_key:'1800x900:foldable',package_name:'Backdrop',length_mm:930,width_mm:930,height_mm:90,revision:'new'};
  const component=new ShippingDataComponent({client:{rpc:vi.fn().mockResolvedValue({data:row,error:null})}} as any,undefined,{} as any);
  for(const [field,value] of Object.entries(row).filter(([field])=>['package_name','length_mm','width_mm','height_mm'].includes(field)))component.setDimensionDraft(row.size_key,field as any,value);
  await component.saveBackdropDimensions(row.size_key);
  expect(component.backdropDimensions()[row.size_key]).toEqual(row);expect(component.dimensionDrafts[row.size_key]).toBeUndefined();expect(component.dimensionFeedback[row.size_key].ok).toBe(true);
 });
});
