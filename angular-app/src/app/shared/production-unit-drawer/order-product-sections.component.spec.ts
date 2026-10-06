import {signal} from '@angular/core';
import {describe,expect,it,vi} from 'vitest';
import {OrderProductSectionsComponent} from './order-product-sections.component';
import {variantSignature} from '../../../../../supabase/functions/_shared/delivery-review-domain';

function section(options:Record<string,string>){
 const component=new OrderProductSectionsComponent({} as any,{} as any,{materials:()=>[]} as any);
 component.view={mainItem:{wix_options:options},addons:[],order:{id:'order'}} as any;
 component.product.set({id:'product',product_name:'Ripple Arch Backdrop',product_type:'Backdrop'});
 return component;
}

describe('Order product cost source',()=>{
 it('uses a confirmed Hub size for an older order without a Wix Size choice',async()=>{
  const rpc=vi.fn().mockResolvedValue({data:'190cm x 100cm',error:null});
  const component=new OrderProductSectionsComponent({client:{rpc}} as any,{manager:()=>true} as any,{materials:()=>[]} as any);
  component.view={mainItem:{id:'item',size:null,wix_options:{Foldable:'YES',Colour:'Raw'}},addons:[],order:{id:'order'}} as any;
  component.product.set({id:'product',product_name:'Plywood Hollow Event Backdrop',product_type:'Backdrop'});
  component.sizeDraft='190x100';component.load=vi.fn().mockResolvedValue(undefined);
  await component.saveSize();
  expect(rpc).toHaveBeenCalledWith('wc_set_order_item_size',{p_item:'item',p_size:'190cm x 100cm'});
  expect(component.choices()).toEqual({Foldable:'YES',Colour:'Raw',Size:'190cm x 100cm'});
  expect(component.backdropKey()).toBe('1900x1000:foldable');
  expect(component.sizeMessage()).toContain('saved');
  const main={id:'item',product_name:'Plywood Hollow Event Backdrop',quantity:1,wix_options:{Foldable:'YES',Colour:'Raw'},size:'190cm x 100cm'};
  expect(variantSignature(main)).toBe(variantSignature({...main,wix_options:{...main.wix_options,Size:'190cm x 100cm'},size:null}));
 });
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

it('opens product sections while order material details are still loading',async()=>{
 let finishParts!:(value:{data:any[];error:null})=>void;
 const pendingParts=new Promise<{data:any[];error:null}>(resolve=>finishParts=resolve);
 const result={data:[],error:null};
 const query=(table:string):any=>({
  select(){return this;},eq(){return this;},order(){return this;},range(){return this;},
  maybeSingle(){return Promise.resolve({data:table==='wc_shipping_products'?{id:'product',product_name:'Ripple Arch Backdrop',product_type:'Backdrop'}:null,error:null});},
  then(resolve:any,reject:any){return Promise.resolve(result).then(resolve,reject);},
 });
 const db={client:{from:query,rpc:()=>({...query('parts'),then:(resolve:any,reject:any)=>pendingParts.then(resolve,reject)})}};
 const members={members:signal([{user_id:'user'}]),loading:signal(false),manager:signal(true)};
 const costing={materials:signal([{id:'wood'}])};
 const component=new OrderProductSectionsComponent(db as any,members as any,costing as any);
 component.view={mainItem:{id:'item',catalog_reference:{catalogItemId:'wix-id'},wix_options:{Size:'190cm x 95cm',Foldable:'NO'}},addons:[],order:{id:'order'}} as any;
 const request=component.load();
 await vi.waitFor(()=>expect(component.costLoading()).toBe(false));
 expect(component.loading()).toBe(false);
 expect(component.detailsLoading()).toBe(false);
 expect(component.product()?.id).toBe('product');
 expect(component.partsLoading()).toBe(true);
 finishParts(result);
 await request;
 expect(component.partsLoading()).toBe(false);
});
