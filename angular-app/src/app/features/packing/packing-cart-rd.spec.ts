import {describe,expect,it} from 'vitest';
import {PackingManageComponent} from './packing-manage.component';

describe('Cart Base RD visibility in Manage cutting',()=>{
 it('shows shared Base files for another option profile of the same product and size, but keeps Add-ons and replacement variants separate',()=>{
  const component=new PackingManageComponent({} as any,{manager:()=>true} as any);
  component.cartBasePackages.set([{id:'base',shipping_product_id:'cart',size_key:'regular',package_name:'Main box',length_mm:1180,width_mm:670,height_mm:60},
   {id:'large',shipping_product_id:'cart',size_key:'large',package_name:'Main box',length_mm:1180,width_mm:670,height_mm:60}]);
  const main={package_name:'Main box',length_mm:1180,width_mm:670,height_mm:60,contents:[{component_key:'main'}]};
  const addon={package_name:'Shelf',length_mm:300,width_mm:200,height_mm:40,contents:[{component_key:'option:internal shelf'}]};
  component.profiles.set([
   {signature:'regular-shelf',shipping_product_id:'cart',template_item:{wix_options:{Size:'Regular','Internal Shelf':'Yes'}},packages:[main,addon]},
   {signature:'large-shelf',shipping_product_id:'cart',template_item:{wix_options:{Size:'Large'}},packages:[main,addon]},
   {signature:'replacement',shipping_product_id:'cart',template_item:{profile_scope:'cart-main',wix_options:{Size:'Regular'}},packages:[main]},
  ]);
  component.rdFiles.set([{id:'shared',profile_signature:null,box_index:null,cart_base_package_id:'base',filename:'base.rd',copies:2},
   {id:'addon',profile_signature:'regular-shelf',box_index:1,filename:'shelf.rd',copies:1}]);
  expect(component.filesFor('regular-shelf',0).map(file=>file.filename)).toEqual(['base.rd']);
  expect(component.filesFor('regular-shelf',1).map(file=>file.filename)).toEqual(['shelf.rd']);
  expect(component.filesFor('large-shelf',0)).toEqual([]);
  expect(component.filesFor('replacement',0)).toEqual([]);
 });
});
