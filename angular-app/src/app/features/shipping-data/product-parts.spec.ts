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

describe('Parts template reopening and persistence feedback',()=>{
 const saved={id:'template',product_id:'main',name:'Plane Arch',parts:[{id:'arch',name:'Arch',component_product_id:'main'}],estimates:{CNC:12,'Assembly:arch':8,'Sanding:arch':5,'Painting:First primer':10},version:2};
 it('opens the saved template, including all minutes, when a fresh product card loads',async()=>{
  const {component,templates}=setup();component.product={id:'main',short_name:'Plane Arch'};templates.push(structuredClone(saved));await component.load();
  expect(component.editingId).toBe('template');expect(component.parts).toEqual(saved.parts);expect(component.estimates).toEqual(saved.estimates);expect(component.version).toBe(2);
  component.newTemplate();expect(component.parts).toEqual([]);component.editTemplate(templates[0]);expect(component.estimates['CNC']).toBe(12);
 });
 it('renders a saved edit again after closing and recreating the card',async()=>{
  const {component,rpc,templates}=setup();component.product={id:'main',short_name:'Plane Arch'};await component.load();component.parts=structuredClone(saved.parts);component.estimates={...saved.estimates};
  rpc.mockImplementation(async(name,args)=>{if(name==='wc_shop_product_components')return {data:[{id:'main',product_name:'Plane Arch',component_role:'Product'}],error:null} as any;const row={...saved,name:args.p_name,parts:args.p_parts,estimates:args.p_estimates};templates.push(structuredClone(row));return {data:row,error:null};});
  await component.save();expect(component.done).toBe(true);expect(component.parts).toEqual(saved.parts);
  const reopened=new ProductPartsComponent((component as any).db);reopened.product=component.product;await reopened.load();expect(reopened.parts).toEqual(saved.parts);expect(reopened.estimates).toEqual(saved.estimates);expect(reopened.editingId).toBe('template');
 });
 it('does not claim success or clear the draft when saving throws or returns no record',async()=>{
  for(const result of ['throw','empty']){const {component,rpc}=setup();component.product={id:'main'};component.templateName=saved.name;component.parts=structuredClone(saved.parts);component.estimates={...saved.estimates};
   rpc.mockImplementation(async()=>{if(result==='throw')throw Error('offline');return {data:null,error:null} as any;});await component.save();expect(component.done).toBe(false);expect(component.busy).toBe(false);expect(component.error).toContain('retained');expect(component.parts).toEqual(saved.parts);expect(component.estimates).toEqual(saved.estimates);
  }
 });
 it('retains the current draft and blocks saving after a read failure',async()=>{
  const {component,rpc}=setup();component.product={id:'main'};await component.load();component.parts=structuredClone(saved.parts);component.estimates={...saved.estimates};rpc.mockRejectedValue(Error('offline'));await component.load();expect(component.loadFailed).toBe(true);expect(component.loading).toBe(false);expect(component.parts).toEqual(saved.parts);expect(component.estimates).toEqual(saved.estimates);const calls=rpc.mock.calls.length;await component.save();expect(rpc).toHaveBeenCalledTimes(calls);
 });
 it('does not show an old save in another product card',async()=>{
  const {component,rpc}=setup();component.product={id:'main'};component.templateName=saved.name;component.parts=structuredClone(saved.parts);let resolve!:(value:any)=>void;
  rpc.mockImplementationOnce(()=>new Promise(r=>resolve=r));const pending=component.save();component.product={id:'another'};await component.load();resolve({data:saved,error:null});await pending;expect(component.done).toBe(false);expect(component.parts).toEqual([]);expect(component.editingId).toBe('');
 });
});
