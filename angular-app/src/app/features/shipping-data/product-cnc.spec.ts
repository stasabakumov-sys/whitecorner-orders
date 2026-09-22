import {describe,it,expect,vi} from 'vitest';
import {ProductCncComponent} from './product-cnc.component';

function setup(){
 const rpc=vi.fn();
 const from=vi.fn(()=>({select:()=>({eq:()=>({order:vi.fn().mockResolvedValue({data:[],error:null})})})}));
 const upload=vi.fn(),remove=vi.fn(),createSignedUrl=vi.fn();
 const storage=vi.fn(()=>({upload,remove,createSignedUrl}));
 const component=new ProductCncComponent({client:{from,rpc,auth:{getUser:vi.fn().mockResolvedValue({data:{user:{id:'worker'}},error:null})},storage:{from:storage}}} as any);
 component.productId='product';return {component,rpc,upload,remove,storage};
}

describe('Product CNC cutting sheets',()=>{
 it('offers parts from templates saved for this product card',async()=>{
  const parts=[{id:'part-1',name:'Side panel'}];
  const from=vi.fn((table:string)=>table==='wc_shop_templates'
   ?{select:()=>({eq:vi.fn().mockResolvedValue({data:[{parts}],error:null})})}
   :{select:()=>({eq:()=>({order:vi.fn().mockResolvedValue({data:[],error:null})})})});
  const component=new ProductCncComponent({client:{from}} as any);component.productId='product';
  await component.load();component.add();expect(component.availableParts(component.sheets[0])).toEqual(parts);
  expect(from).toHaveBeenCalledWith('wc_shop_templates');
 });
 it('saves a physical sheet with selected Assembling part IDs and its comment',async()=>{
  const {component,rpc}=setup();component.parts=[{id:'part-1',name:'Side panel'}];component.add();const sheet=component.sheets[0];
  component.addPart(sheet,'part-1');sheet.name='Birch sheet';sheet.comment='Cut grain along the long edge';
  rpc.mockResolvedValue({data:{...sheet,id:'sheet-1',revision:'rev-1'},error:null});await component.save(sheet);
  expect(rpc).toHaveBeenCalledWith('wc_save_product_cnc_sheet',expect.objectContaining({p_product:'product',p_number:1,p_parts:[{id:'part-1',name:'Side panel'}],p_comment:'Cut grain along the long edge'}));
  expect(sheet.id).toBe('sheet-1');expect(component.success).toContain('saved');
 });
 it('keeps edits and the previous file when saving or uploading fails',async()=>{
  const {component,rpc,upload,remove}=setup();component.add();const sheet=component.sheets[0];sheet.name='Retry me';
  rpc.mockResolvedValueOnce({data:null,error:{message:'offline'}});await component.save(sheet);
  expect(sheet.name).toBe('Retry me');expect(component.error).toContain('offline');
  Object.assign(sheet,{id:'sheet-1',revision:'rev-1',filename:'previous.tap',object_path:'old/path'});
  upload.mockResolvedValue({error:{message:'network unavailable'}});
  const input={files:[new File(['G21'], 'new.tap')],value:'selected'} as unknown as HTMLInputElement;
  await component.upload(sheet,{target:input} as unknown as Event);
  expect(sheet.filename).toBe('previous.tap');expect(sheet.object_path).toBe('old/path');expect(component.error).toContain('network unavailable');expect(remove).not.toHaveBeenCalled();
 });
 it('keeps unsaved text while attaching a confirmed TAP file',async()=>{
  const {component,rpc,upload}=setup();component.add();const sheet=component.sheets[0];
  Object.assign(sheet,{id:'sheet-1',revision:'rev-1',name:'Draft name',comment:'Draft comment'});
  upload.mockResolvedValue({error:null});rpc.mockResolvedValue({data:{object_path:'worker/file',filename:'cut.tap',size_bytes:3,revision:'rev-2',name:'Older name',comment:''},error:null});
  await component.upload(sheet,{target:{files:[new File(['G21'],'cut.tap')],value:'selected'}} as unknown as Event);
  expect(sheet.filename).toBe('cut.tap');expect(sheet.revision).toBe('rev-2');
  expect(sheet.name).toBe('Draft name');expect(sheet.comment).toBe('Draft comment');
 });
 it('rejects an oversized file with its name and limit before uploading',async()=>{
  const {component,upload}=setup();component.add();const sheet=component.sheets[0];sheet.id='sheet-1';
  const file={name:'cut.tap',size:20971521} as File;
  await component.upload(sheet,{target:{files:[file],value:''}} as unknown as Event);
  expect(component.error).toContain('cut.tap');expect(component.error).toContain('20 MB');expect(upload).not.toHaveBeenCalled();
 });
});
