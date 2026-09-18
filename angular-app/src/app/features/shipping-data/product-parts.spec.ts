import {describe,it,expect,vi} from 'vitest';
import {ProductPartsComponent} from './product-parts.component';

function setup(){
 const templates:any[]=[];const components=[{id:'main',product_name:'Cart',component_role:'Product'},{id:'addon',product_name:'Ice shelf',component_role:'Add-on'}];
 const query:any={select:()=>query,eq:()=>query,order:async()=>({data:templates,error:null})};
 const rpc=vi.fn(async(name:string,args:any)=>name==='wc_shop_product_components'?{data:components,error:null}:{data:{id:'template',product_id:args.p_product,name:args.p_name,parts:args.p_parts,estimates:args.p_estimates,version:1},error:null});
 return {component:new ProductPartsComponent({client:{from:()=>query,rpc}} as any),rpc,templates};
}
describe('Product-owned Shop Floor parts',()=>{
 it('defaults new Backdrop estimates to Foldable and persists without clicking the option',async()=>{
  const {component,rpc,templates}=setup();component.product={id:'main',product_name:'Hollow Arch Backdrop'};await component.load();
  expect(component.folding).toBe('foldable');component.addPart();component.parts[0].name='Body';component.estimates={CNC:12};
  rpc.mockImplementation(async(name,args)=>{if(name==='wc_shop_product_components')return {data:[{id:'main',product_name:'Backdrop',component_role:'Product'}],error:null} as any;
   const row={id:'folded',product_id:args.p_product,name:args.p_name,parts:args.p_parts,estimates:args.p_estimates,version:1,size_key:null,folding:args.p_folding};templates.push(row);return {data:row,error:null};});
  await component.save();expect(component.done).toBe(true);expect(rpc).toHaveBeenLastCalledWith('wc_shop_save_backdrop_template',expect.objectContaining({p_folding:'foldable',p_estimates:{CNC:12}}));
  const reopened=new ProductPartsComponent((component as any).db);reopened.product=component.product;await reopened.load();expect(reopened.folding).toBe('foldable');expect(reopened.estimates).toEqual({CNC:12});expect(reopened.parts[0].name).toBe('Body');
 });
 it('opens Foldable first regardless of saved template ordering and preserves Non-foldable',async()=>{
  const {component,templates}=setup();component.product={id:'main',product_name:'Arch Backdrop'};
  templates.push({id:'flat',name:'A flat',folding:'nonfoldable',size_key:null,parts:[],estimates:{CNC:20},version:1},{id:'folded',name:'Z folded',folding:'foldable',size_key:null,parts:[],estimates:{CNC:10},version:1});
  await component.load();expect(component.editingId).toBe('folded');component.chooseVariant('nonfoldable');expect(component.estimates).toEqual({CNC:20});await component.load();expect(component.folding).toBe('nonfoldable');
 });
 it('does not repurpose a Non-foldable template when opening a new Foldable estimate',async()=>{
  const {component,templates}=setup();component.product={id:'main',product_type:'Backdrop'};templates.push({id:'flat',name:'Flat',folding:'nonfoldable',size_key:null,parts:[],estimates:{CNC:20},version:1});
  await component.load();expect(component.folding).toBe('foldable');expect(component.editingId).toBe('');expect(component.estimates).toEqual({});component.chooseVariant('nonfoldable');expect(component.editingId).toBe('flat');
  templates.length=0;component.product={id:'cart',product_type:'Cart'};await component.load();expect(component.folding).toBe('');
 });
 it('offers a manually entered unitless size as centimetres',()=>{const {component}=setup();component.sizes=['190x100'];expect(component.sizeKeys()).toEqual(['1900x1000']);});
 it('retains independent folding drafts and saves one structural variant for every size',async()=>{const {component,rpc}=setup();component.product={id:'main',product_name:'Arch Backdrop'};component.sizes=['200cm x 100cm','180cm x 90cm'];await component.load();component.chooseVariant('foldable');component.addPart();component.parts[0].name='Folded body';component.estimates={CNC:10};component.chooseVariant('nonfoldable');expect(component.parts).toEqual([]);component.addPart();component.parts[0].name='Flat body';component.estimates={CNC:20};component.chooseVariant('foldable');expect(component.parts[0].name).toBe('Folded body');expect(component.estimates['CNC']).toBe(10);rpc.mockImplementation(async(name,args)=>({data:{id:'folded',product_id:args.p_product,name:args.p_name,parts:args.p_parts,estimates:args.p_estimates,version:1,size_key:null,folding:args.p_folding},error:null}));await component.save();expect(rpc).toHaveBeenCalledWith('wc_shop_save_backdrop_template',expect.objectContaining({p_folding:'foldable',p_estimates:{CNC:10}}));expect(rpc.mock.calls.at(-1)?.[1]).not.toHaveProperty('p_size');expect(component.done).toBe(true);component.chooseVariant('nonfoldable');expect(component.estimates['CNC']).toBe(20);});
 it('assigns new parts to the main product and saves explicit add-on ownership',async()=>{const {component,rpc,templates}=setup();component.product={id:'main',product_name:'Cart'};await component.load();component.addPart();component.parts[0].name='Body';component.parts.push({id:'shelf',name:'Shelf',component_product_id:'addon'});templates.push({id:'template',product_id:'main',name:'Cart standard',parts:structuredClone(component.parts),estimates:{},version:1});await component.save();expect(rpc).toHaveBeenCalledWith('wc_shop_save_product_template',expect.objectContaining({p_product:'main',p_parts:[expect.objectContaining({name:'Body',component_product_id:'main'}),expect.objectContaining({name:'Shelf',component_product_id:'addon'})]}));});
 it('saves Cart estimated minutes only for the selected Wix size',async()=>{const {component,rpc}=setup();component.product={id:'main',product_name:'Ply Classic Cart',product_type:'Cart'};component.selectedSize='size ii w1400 x d600 x h1000 mm';await component.load();component.addPart();component.parts[0].name='Body';rpc.mockImplementation(async(name,args)=>name==='wc_shop_product_components'?{data:[{id:'main',product_name:'Cart',component_role:'Product'}],error:null}:{data:{id:'sized',product_id:'main',name:args.p_name,parts:args.p_parts,estimates:args.p_estimates,version:1,size_key:args.p_size,folding:null},error:null});await component.save();expect(rpc).toHaveBeenCalledWith('wc_shop_save_sized_product_template',expect.objectContaining({p_size:'size ii w1400 x d600 x h1000 mm'}));expect(component.done).toBe(true);});
 it('keeps invalid rows visible and does not send them',async()=>{const {component,rpc}=setup();component.product={id:'main',product_name:'Cart'};await component.load();component.addPart();await component.save();expect(component.error).toContain('template name');expect(rpc).toHaveBeenCalledTimes(1);});
 it('assigns an unassigned legacy template to a product-wide folding option',async()=>{const {component,rpc,templates}=setup();component.product={id:'main',product_name:'Arch Backdrop'};component.sizes=['200cm x 100cm','180cm x 90cm'];templates.push({id:'legacy',product_id:'main',name:'Plane Arch',parts:[{id:'body',name:'Backdrop body',component_product_id:'main'}],estimates:{CNC:10},version:2,size_key:null,folding:null});await component.load();component.chooseVariant('foldable');component.editTemplate(templates[0]);expect(component.sizeKey).toBe('');expect(component.folding).toBe('foldable');rpc.mockImplementation(async(name,args)=>({data:{...templates[0],size_key:null,folding:args.p_folding,version:3},error:null}));await component.save();expect(rpc).toHaveBeenCalledWith('wc_shop_save_backdrop_template',expect.objectContaining({p_id:'legacy',p_folding:'foldable'}));expect(component.done).toBe(true);});
});

describe('Parts template reopening and persistence feedback',()=>{
 const saved={id:'template',product_id:'main',name:'Plane Arch',parts:[{id:'arch',name:'Arch',component_product_id:'main'}],estimates:{CNC:12,'Assembly:arch':8,'Sanding:arch':5,'Painting:First primer':10},version:2};
 it('opens the saved structural template without legacy Painting minutes',async()=>{
  const {component,templates}=setup();component.product={id:'main',short_name:'Plane Arch'};templates.push(structuredClone(saved));await component.load();
  expect(component.editingId).toBe('template');expect(component.parts).toEqual(saved.parts);expect(component.estimates).toEqual({CNC:12,'Assembly:arch':8,'Sanding:arch':5});expect(component.version).toBe(2);
  component.newTemplate();expect(component.parts).toEqual([]);component.editTemplate(templates[0]);expect(component.estimates['CNC']).toBe(12);
 });
 it('renders a saved edit again after closing and recreating the card',async()=>{
  const {component,rpc,templates}=setup();component.product={id:'main',short_name:'Plane Arch'};await component.load();component.parts=structuredClone(saved.parts);component.estimates={...saved.estimates};
  rpc.mockImplementation(async(name,args)=>{if(name==='wc_shop_product_components')return {data:[{id:'main',product_name:'Plane Arch',component_role:'Product'}],error:null} as any;const row={...saved,name:args.p_name,parts:args.p_parts,estimates:args.p_estimates};templates.push(structuredClone(row));return {data:row,error:null};});
  await component.save();expect(component.done).toBe(true);expect(component.parts).toEqual(saved.parts);expect(component.estimates['Painting:First primer']).toBeUndefined();
  const reopened=new ProductPartsComponent((component as any).db);reopened.product=component.product;await reopened.load();expect(reopened.parts).toEqual(saved.parts);expect(reopened.estimates['Painting:First primer']).toBeUndefined();expect(reopened.editingId).toBe('template');
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
