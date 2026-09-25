import {describe,expect,it} from 'vitest';
import {OrderProductSectionsComponent} from './order-product-sections.component';

function section(options:Record<string,string>){
 const component=new OrderProductSectionsComponent({} as any,{} as any,{materials:()=>[]} as any);
 component.view={mainItem:{wix_options:options},addons:[],order:{id:'order'}} as any;
 component.product.set({id:'product',product_name:'Ripple Arch Backdrop',product_type:'Backdrop'});
 return component;
}

describe('Order product cost source',()=>{
 it('uses Raw when the order has no finish option',()=>{
  expect(section({Size:'190cm x 95cm',Foldable:'NO'}).orderFinishes()).toEqual([false]);
 });
 it('uses the saved shared Product materials for the ordered construction',()=>{
  const component=section({Size:'190cm x 95cm',Foldable:'NO'});
  component.sharedCostProfiles.set([{variant_key:'shared',shipping_product_id:'product',product_name:'Ripple Arch Backdrop',materials_confirmed:true,lines:[{material_id:'wood',quantity:2}],template_item:{profile_scope:'backdrop-structure-v2',kind:'main',options:{Foldable:'NO'}}}]);
  const profiles=component.costProfiles();
  expect(profiles).toHaveLength(1);
  expect(profiles[0].profile.lines).toEqual([{material_id:'wood',quantity:2}]);
  expect(profiles[0].folding).toBe('nonfoldable');
 });
 it('does not substitute a different folding construction',()=>{
  const component=section({Size:'190cm x 95cm',Foldable:'NO'});
  component.sharedCostProfiles.set([{variant_key:'foldable',shipping_product_id:'product',product_name:'Ripple Arch Backdrop',materials_confirmed:true,lines:[{material_id:'wood',quantity:2}],template_item:{profile_scope:'backdrop-structure-v2',kind:'main',options:{Foldable:'YES'}}}]);
  const profiles=component.costProfiles();
  expect(profiles).toHaveLength(1);
  expect(profiles[0].profile).toBeNull();
  expect(profiles[0].folding).toBe('nonfoldable');
 });
});
