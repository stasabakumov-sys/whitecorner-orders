import {describe,it,expect,vi} from 'vitest';
import {TestBed} from '@angular/core/testing';
import {ProductCncComponent} from './product-cnc.component';
import {SupabaseService} from '../../core/services/supabase.service';

function setup(){
 const rpc=vi.fn();
 const from=vi.fn((table:string)=>table==='wc_materials'
  ?{select:()=>({order:()=>({order:()=>({range:vi.fn().mockResolvedValue({data:[{id:'birch',name:'Birch plywood',unit:'sheet',active:true}],error:null})})})})}
  :{select:()=>({eq:()=>({order:vi.fn().mockResolvedValue({data:[],error:null})})})});
 const upload=vi.fn(),remove=vi.fn(),createSignedUrl=vi.fn();
 const storage=vi.fn(()=>({upload,remove,createSignedUrl}));
 const component=new ProductCncComponent({client:{from,rpc,auth:{getUser:vi.fn().mockResolvedValue({data:{user:{id:'worker'}},error:null})},storage:{from:storage}}} as any);
 component.productId='product';return {component,rpc,upload,remove,storage};
}

describe('Product CNC cutting sheets',()=>{
 it('renders editable name, material and comment during a pending save',async()=>{
  const fixture=TestBed.configureTestingModule({imports:[ProductCncComponent],providers:[{provide:SupabaseService,useValue:{client:{}}}]}).createComponent(ProductCncComponent);
  fixture.componentInstance.productId='product';fixture.componentInstance.materials=[{id:'birch',name:'Birch plywood',unit:'sheet',active:true}];fixture.componentInstance.add();fixture.componentInstance.busy='new';fixture.detectChanges();
  const name=fixture.nativeElement.querySelector('[aria-label="Cutting sheet name"]') as HTMLInputElement;
  const material=fixture.nativeElement.querySelector('[aria-label="Cutting sheet material"]') as HTMLSelectElement;
  const comment=fixture.nativeElement.querySelector('[aria-label="Cutting sheet comment"]') as HTMLTextAreaElement;
  expect(name.disabled).toBe(false);expect(material.disabled).toBe(false);expect(comment.disabled).toBe(false);
  expect(material.textContent).toContain('Birch plywood');
  expect((fixture.nativeElement.querySelector('td:last-child button') as HTMLButtonElement).disabled).toBe(true);
 });
 it('offers parts from templates saved for this product card',async()=>{
  const parts=[{id:'part-1',name:'Side panel'}];
  const from=vi.fn((table:string)=>table==='wc_materials'
   ?{select:()=>({order:()=>({order:()=>({range:vi.fn().mockResolvedValue({data:[{id:'birch',name:'Birch plywood',unit:'sheet',active:true}],error:null})})})})}
   :table==='wc_shop_templates'
   ?{select:()=>({eq:vi.fn().mockResolvedValue({data:[{parts}],error:null})})}
   :{select:()=>({eq:()=>({order:vi.fn().mockResolvedValue({data:[],error:null})})})});
  const component=new ProductCncComponent({client:{from}} as any);component.productId='product';
  await component.load();component.add();expect(component.availableParts(component.sheets[0])).toEqual(parts);
  expect(from).toHaveBeenCalledWith('wc_shop_templates');
 });
 it('shows sheet rows before the Assembling request finishes',async()=>{
  let finishTemplates!:(value:any)=>void;
  const from=vi.fn((table:string)=>table==='wc_shop_templates'
   ?{select:()=>({eq:()=>new Promise(resolve=>{finishTemplates=resolve;})})}
   :table==='wc_materials'
    ?{select:()=>({order:()=>({order:()=>({range:vi.fn().mockResolvedValue({data:[],error:null})})})})}
    :{select:()=>({eq:()=>({order:vi.fn().mockResolvedValue({data:[{id:'sheet-1',name:'Existing',material_id:null,parts:[]}],error:null})})})});
  const markForCheck=vi.fn();const component=new ProductCncComponent({client:{from}} as any,{markForCheck} as any);component.productId='product';
  const pending=component.load();await vi.waitFor(()=>expect(component.loading).toBe(false));
  expect(component.sheets[0].name).toBe('Existing');expect(component.partsLoading).toBe(true);expect(markForCheck).toHaveBeenCalled();
  finishTemplates({data:[],error:null});await pending;
 });
 it('saves a physical sheet with selected Assembling part IDs and its comment',async()=>{
  const {component,rpc}=setup();component.parts=[{id:'part-1',name:'Side panel'}];component.materials=[{id:'birch',name:'Birch plywood',unit:'sheet',active:true}];component.add();const sheet=component.sheets[0];
  component.addPart(sheet,'part-1');sheet.name='Birch sheet';sheet.material_id='birch';sheet.comment='Cut grain along the long edge';
  rpc.mockResolvedValue({data:{...sheet,id:'sheet-1',revision:'rev-1'},error:null});await component.save(sheet);
  expect(rpc).toHaveBeenCalledWith('wc_save_product_cnc_sheet',expect.objectContaining({p_product:'product',p_number:1,p_name:'Birch sheet',p_material:'birch',p_parts:[{id:'part-1',name:'Side panel'}],p_comment:'Cut grain along the long edge'}));
  expect(sheet.id).toBe('sheet-1');expect(component.success).toContain('saved');
 });
 it('keeps edits and the previous file when saving or uploading fails',async()=>{
  const {component,rpc,upload,remove}=setup();component.materials=[{id:'birch',name:'Birch plywood',unit:'sheet',active:true}];component.add();const sheet=component.sheets[0];sheet.name='Retry me';sheet.material_id='birch';
  rpc.mockResolvedValueOnce({data:null,error:{message:'offline'}});await component.save(sheet);
  expect(sheet.name).toBe('Retry me');expect(component.error).toContain('offline');
  Object.assign(sheet,{id:'sheet-1',revision:'rev-1',filename:'previous.crc3d',object_path:'old/path'});
  upload.mockResolvedValue({error:{message:'network unavailable'}});
  const input={files:[new File(['design'], 'new.crv3d')],value:'selected'} as unknown as HTMLInputElement;
  await component.upload(sheet,{target:input} as unknown as Event);
  expect(sheet.filename).toBe('previous.crc3d');expect(sheet.object_path).toBe('old/path');expect(component.error).toContain('network unavailable');expect(remove).not.toHaveBeenCalled();
 });
 it('keeps unsaved text while attaching a confirmed CRV3D file',async()=>{
  const {component,rpc,upload}=setup();component.add();const sheet=component.sheets[0];
  Object.assign(sheet,{id:'sheet-1',revision:'rev-1',name:'Draft name',comment:'Draft comment'});
  upload.mockResolvedValue({error:null});rpc.mockResolvedValue({data:{object_path:'worker/file',filename:'cut.crv3d',size_bytes:6,revision:'rev-2',name:'Older name',comment:''},error:null});
  await component.upload(sheet,{target:{files:[new File(['design'],'cut.crv3d')],value:'selected'}} as unknown as Event);
  expect(sheet.filename).toBe('cut.crv3d');expect(sheet.revision).toBe('rev-2');
  expect(sheet.name).toBe('Draft name');expect(sheet.comment).toBe('Draft comment');
 });
 it('rejects an oversized file with its name and limit before uploading',async()=>{
  const {component,upload}=setup();component.add();const sheet=component.sheets[0];sheet.id='sheet-1';
  const file={name:'cut.crv3d',size:20971521} as File;
  await component.upload(sheet,{target:{files:[file],value:''}} as unknown as Event);
  expect(component.error).toContain('cut.crv3d');expect(component.error).toContain('20 MB');expect(upload).not.toHaveBeenCalled();
 });
 it('rejects old TAP files before upload',async()=>{
  const {component,upload}=setup();component.add();const sheet=component.sheets[0];sheet.id='sheet-1';
  await component.upload(sheet,{target:{files:[new File(['G21'],'cut.tap')],value:''}} as unknown as Event);
  expect(component.error).toContain('.crv3d');expect(upload).not.toHaveBeenCalled();
 });
 it('rejects the mistaken CRC3D extension before upload',async()=>{
  const {component,upload}=setup();component.add();const sheet=component.sheets[0];sheet.id='sheet-1';
  await component.upload(sheet,{target:{files:[new File(['design'],'cut.crc3d')],value:''}} as unknown as Event);
  expect(component.error).toContain('.crv3d');expect(upload).not.toHaveBeenCalled();
 });
 it('keeps name and material editable while saving and preserves later edits',async()=>{
  const {component,rpc}=setup();component.materials=[{id:'birch',name:'Birch plywood',unit:'sheet',active:true},{id:'mdf',name:'MDF',unit:'sheet',active:true}];component.add();const sheet=component.sheets[0];sheet.name='Original';sheet.material_id='birch';
  let confirm!:(value:any)=>void;rpc.mockReturnValue(new Promise(resolve=>{confirm=resolve;}));
  const pending=component.save(sheet);expect(component.busy).toBe('new');
  sheet.name='Edited while saving';sheet.material_id='mdf';sheet.comment='New note';
  confirm({data:{...sheet,id:'sheet-1',name:'Original',material_id:'birch',revision:'rev-1'},error:null});await pending;
  expect(sheet.name).toBe('Edited while saving');expect(sheet.material_id).toBe('mdf');expect(sheet.comment).toBe('New note');expect(sheet.id).toBe('sheet-1');expect(component.success).toContain('save again');
 });
 it('requests a screen update when an asynchronous save finishes',async()=>{
  const markForCheck=vi.fn();const rpc=vi.fn().mockResolvedValue({data:{id:'sheet-1',revision:'rev-1',sheet_number:1,name:'Name',material_id:'birch',parts:[],comment:''},error:null});
  const component=new ProductCncComponent({client:{rpc}} as any,{markForCheck} as any);component.productId='product';component.materials=[{id:'birch',name:'Birch',unit:'sheet',active:true}];component.add();const sheet=component.sheets[0];sheet.name='Name';sheet.material_id='birch';
  await component.save(sheet);expect(component.busy).toBe('');expect(markForCheck).toHaveBeenCalled();
 });
 it('requires an available material and keeps archived selections on existing sheets',async()=>{
  const {component,rpc}=setup();component.materials=[{id:'birch',name:'Birch plywood',unit:'sheet',active:true},{id:'old',name:'Old MDF',unit:'sheet',active:false}];component.add();const sheet=component.sheets[0];
  await component.save(sheet);expect(component.error).toContain('Choose a material');expect(rpc).not.toHaveBeenCalled();
  sheet.material_id='old';expect(component.materialOptions(sheet).map(m=>m.id)).toContain('old');
 });
});
