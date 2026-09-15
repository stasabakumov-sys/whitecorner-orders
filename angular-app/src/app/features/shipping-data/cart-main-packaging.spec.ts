import {describe,expect,it,vi} from 'vitest';
import {CartMainPackagingComponent} from './cart-main-packaging.component';

describe('Cart Main packaging variants',()=>{
 function setup(){
  const invoke=vi.fn(async()=>({data:{ok:true},error:null}));
  const from=vi.fn((table:string)=>{const query:any={select:()=>query,eq:()=>query,then:(resolve:any)=>resolve({data:table==='wc_delivery_packaging_profiles'?[]:[],error:null})};return query;});
  const component=new CartMainPackagingComponent({client:{from,functions:{invoke}}} as any);
  component.product={id:'product',product_name:'Cart',product_type:'Cart',wix_product_id:'catalog'};component.sizeKey='size i';component.sizeLabel='Size I';
  return{component,invoke};
 }
 it('puts Internal Shelf inside the manually entered Main composition',()=>{
  const{component}=setup();
  expect(component.components().map(c=>c.component_key).sort()).toEqual(['main','option:internal shelf']);
 });
 it('saves the complete dimensions as a Cart Main profile without calculating them',async()=>{
  const{component,invoke}=setup();component.boxes=[{package_name:'Top/Bottom + shelf',length_mm:1430,width_mm:630,height_mm:110,weight_kg:22.5,contents:component.components()}];component.confirmed=true;
  await component.save();
  expect(invoke).toHaveBeenCalledWith('delivery-cost-review',{body:expect.objectContaining({profileScope:'cart-main',options:[{name:'Size',value:'Size I'},{name:'Internal Shelf',value:'Yes'}],packages:[expect.objectContaining({height_mm:110,weight_kg:22.5})]})});
  expect(component.saved()).toBe(true);
 });
});
