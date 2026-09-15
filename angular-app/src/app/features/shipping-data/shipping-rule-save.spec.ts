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
 it('saves Main + Shelf mode without requiring separate-box measurements',async()=>{
  let payload:any;const eq=vi.fn().mockResolvedValue({error:null});
  const component=new ShippingDataComponent({client:{from:()=>({update:(value:any)=>(payload=value,{eq})})}} as any,undefined,{} as any);
  const shelfRule={...rule,match_name:'Internal Shelf',effect_type:'Add package',length_mm:null,width_mm:null,height_mm:null,weight_kg:null};
  component.setRuleDraft(rule.id,'effect_type','Replace profile');await component.saveRule(shelfRule as any);
  expect(payload.effect_type).toBe('Replace profile');expect(component.ruleFeedback()[rule.id]).toEqual({ok:true,text:'Saved ✓'});
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
});
