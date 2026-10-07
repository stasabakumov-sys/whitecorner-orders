import {describe,it,expect,vi} from 'vitest';
import {BoxRdFilesComponent,BoxRdFile} from './box-rd-files.component';

function setup(){
 const upload=vi.fn().mockResolvedValue({error:null}),remove=vi.fn().mockResolvedValue({error:null});
 const rpc=vi.fn().mockResolvedValue({data:{id:'saved',profile_signature:'profile',box_index:0,object_path:'worker/path',filename:'box.rd',size_bytes:2,copies:3,revision:'new'},error:null});
 const db={client:{auth:{getUser:vi.fn().mockResolvedValue({data:{user:{id:'worker'}},error:null})},storage:{from:vi.fn().mockReturnValue({upload,remove})},rpc}};
 const members={manager:()=>true};const component=new BoxRdFilesComponent(db as any,members as any);
 component.signature='profile';component.index=0;component.newCopies=3;
 const event=(file:File)=>({target:{files:[file],value:'selected'}} as unknown as Event);
 return {component,upload,remove,rpc,event};
}

describe('box RD files',()=>{
 it('reviews saved files before dispatch and blocks unsaved copy edits',async()=>{
  const {component,rpc,event}=setup();await component.upload(event(new File(['rd'],'box.rd')));rpc.mockClear();
  component.files[0].copies=4;component.openSend();expect(component.sendOpen).toBe(false);expect(component.error).toContain('Save copy changes');
  component.files[0].copies=3;component.openSend();expect(component.sendOpen).toBe(true);expect(component.sendFiles[0].copies).toBe(3);expect(rpc).not.toHaveBeenCalled();
  rpc.mockResolvedValueOnce({data:{task:{id:'task',state:'assigned'},created:true},error:null});await component.confirmSend();
  expect(rpc).toHaveBeenCalledWith('wc_send_box_cutting_task',{p_files:[{id:'saved',revision:'new',copies:3}]});expect(component.sentTask).toBe('task');expect(component.sendOpen).toBe(false);
 });
 it('keeps confirmation and files after dispatch failure, then accepts an idempotent retry',async()=>{
  const {component,rpc,event}=setup();await component.upload(event(new File(['rd'],'box.rd')));component.openSend();
  rpc.mockResolvedValueOnce({data:null,error:{message:'Connection lost'}});await component.confirmSend();
  expect(component.sendOpen).toBe(true);expect(component.sendError).toContain('Connection lost');expect(component.files).toHaveLength(1);expect(component.sentTask).toBe('');
  rpc.mockResolvedValueOnce({data:{task:{id:'task',state:'assigned'},created:false},error:null});await component.confirmSend();expect(component.success).toContain('already has an active');
 });
 it('requires manager access and explicit confirmation to dispatch',async()=>{
  const {component,rpc,event}=setup();await component.upload(event(new File(['rd'],'box.rd')));rpc.mockClear();
  await component.confirmSend();expect(rpc).not.toHaveBeenCalled();
  vi.spyOn(component.members,'manager').mockReturnValue(false);component.openSend();expect(component.sendOpen).toBe(false);
 });
 it('rejects the wrong type and an oversized file before uploading',async()=>{
  const {component,upload,event}=setup();await component.upload(event(new File(['x'],'box.txt')));
  expect(component.error).toContain('.rd');expect(upload).not.toHaveBeenCalled();
  const large=new File(['x'],'box.rd');Object.defineProperty(large,'size',{value:20971521});
  await component.upload(event(large));expect(component.error).toContain('20 MB');expect(upload).not.toHaveBeenCalled();
 });
 it('saves the RD file with its own copy count after upload confirmation',async()=>{
  const {component,upload,rpc,event}=setup();await component.upload(event(new File(['rd'],'box.rd')));
  expect(upload).toHaveBeenCalledOnce();expect(rpc).toHaveBeenCalledWith('wc_save_box_rd_file',expect.objectContaining({p_signature:'profile',p_index:0,p_copies:3,p_filename:'box.rd'}));
  expect(component.files[0].copies).toBe(3);expect(component.success).toContain('uploaded and saved');
 });
 it('saves Backdrop RD files to the shared size and folding library',async()=>{
  const {component,rpc,event}=setup();component.sharedSize='1200x1000:foldable';
  await component.upload(event(new File(['rd'],'arch.rd')));
  expect(rpc).toHaveBeenCalledWith('wc_save_backdrop_rd_file',expect.objectContaining({p_size:'1200x1000:foldable',p_filename:'arch.rd',p_copies:3}));
  const file=component.files[0];await component.saveCopies(file);
  expect(rpc).toHaveBeenCalledWith('wc_save_backdrop_rd_file',expect.objectContaining({p_size:'1200x1000:foldable',p_id:file.id,p_path:null}));
 });
 it('saves Cart Base RD files to the shared Base box',async()=>{
  const {component,rpc,event}=setup();component.cartBaseId='base-package';
  await component.upload(event(new File(['rd'],'base.rd')));
  expect(rpc).toHaveBeenCalledWith('wc_save_cart_base_rd_file',expect.objectContaining({p_signature:'profile',p_index:0,p_filename:'base.rd'}));
  await component.saveCopies(component.files[0]);
  expect(rpc).toHaveBeenCalledWith('wc_save_cart_base_rd_file',expect.objectContaining({p_id:'saved',p_path:null}));
 });
 it('manages the shared RD set directly from a Products Base box',async()=>{
  const {component,rpc,event}=setup();component.cartBasePackageId='base-package';
  await component.upload(event(new File(['rd'],'base.rd')));
  expect(rpc).toHaveBeenCalledWith('wc_save_cart_base_rd_file_for_package',expect.objectContaining({p_package:'base-package',p_filename:'base.rd'}));
  await component.saveCopies(component.files[0]);
  expect(rpc).toHaveBeenCalledWith('wc_save_cart_base_rd_file_for_package',expect.objectContaining({p_package:'base-package',p_id:'saved',p_path:null}));
 });
 it('keeps the prior file and gives a recovery step when replacement is uncertain',async()=>{
  const {component,rpc,remove,event}=setup();const existing:BoxRdFile={id:'saved',profile_signature:'profile',box_index:0,object_path:'old/path',filename:'old.rd',size_bytes:2,copies:2,revision:'old'};
  component.files=[existing];rpc.mockResolvedValueOnce({data:null,error:{message:'Network lost'}});
  await component.upload(event(new File(['rd'],'new.rd')),existing);
  expect(component.files[0]).toBe(existing);expect(component.error).toContain('Reload this box');expect(remove).not.toHaveBeenCalled();
 });
 it('confirms replacement and the required laser reload only after saving',async()=>{
  const {component,rpc,remove,event}=setup();const existing:BoxRdFile={id:'saved',profile_signature:'profile',box_index:0,object_path:'old/path',filename:'old.rd',size_bytes:2,copies:2,revision:'old'};
  component.files=[existing];let finish:any;rpc.mockReturnValueOnce(new Promise(resolve=>finish=resolve));
  const pending=component.upload(event(new File(['rd'],'new.rd')),existing);
  await vi.waitFor(()=>expect(rpc).toHaveBeenCalledOnce());
  expect(component.success).toBe('');expect(component.files[0]).toBe(existing);expect(component.busy).toBe('upload');
  finish({data:{...existing,filename:'new.rd',object_path:'new/path',revision:'new'},error:null});await pending;
  expect(rpc).toHaveBeenCalledWith('wc_save_box_rd_file',expect.objectContaining({p_id:'saved',p_expected:'old'}));
  expect(component.files[0].filename).toBe('new.rd');expect(component.success).toContain('all unfinished Packing tasks');expect(component.success).toContain('laser again');
  expect(remove).toHaveBeenCalledWith(['old/path']);
 });
 it('keeps the old file when an affected task is transferring',async()=>{
  const {component,rpc,remove,event}=setup();const existing:BoxRdFile={id:'saved',profile_signature:'profile',box_index:0,object_path:'old/path',filename:'old.rd',size_bytes:2,copies:2,revision:'old'};
  component.files=[existing];rpc.mockResolvedValueOnce({data:null,error:{message:'An affected Packing task is loading files to the laser. Wait for the transfer to finish, then replace the file again.'}});
  await component.upload(event(new File(['rd'],'new.rd')),existing);
  expect(component.files[0]).toBe(existing);expect(component.error).toContain('Wait for the transfer');expect(component.success).toBe('');expect(component.busy).toBe('');expect(remove).not.toHaveBeenCalled();
 });
});
