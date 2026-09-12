import {describe,it,expect,vi} from 'vitest';
import {ProductPartsComponent} from './product-parts.component';

function setup(){
 const templates:any[]=[];const components=[{id:'main',product_name:'Cart',component_role:'Product'},{id:'addon',product_name:'Ice shelf',component_role:'Add-on'}];
 const query:any={select:()=>query,eq:()=>query,order:async()=>({data:templates,error:null})};
 const rpc=vi.fn(async(name:string,args:any)=>name==='wc_shop_product_components'?{data:components,error:null}:{data:{id:'template',product_id:args.p_product,name:args.p_name,parts:args.p_parts,estimates:args.p_estimates,version:1},error:null});
 return {component:new ProductPartsComponent({client:{from:()=>query,rpc}} as any),rpc,templates};
}
describe('Product-owned Shop Floor parts',()=>{
 it('assigns new parts to the main product and saves explicit add-on ownership',async()=>{const {component,rpc,templates}=setup();component.product={id:'main',product_name:'Cart'};await component.load();component.addPart();component.parts[0].name='Body';component.parts.push({id:'shelf',name:'Shelf',component_product_id:'addon'});templates.push({id:'template',product_id:'main',name:'Cart standard',parts:structuredClone(component.parts),estimates:{},version:1});await component.save();expect(rpc).toHaveBeenCalledWith('wc_shop_save_product_template',expect.objectContaining({p_product:'main',p_parts:[expect.objectContaining({name:'Body',component_product_id:'main'}),expect.objectContaining({name:'Shelf',component_product_id:'addon'})]}));});
 it('keeps invalid rows visible and does not send them',async()=>{const {component,rpc}=setup();component.product={id:'main',product_name:'Cart'};await component.load();component.addPart();await component.save();expect(component.error).toContain('template name');expect(rpc).toHaveBeenCalledTimes(1);});
});
