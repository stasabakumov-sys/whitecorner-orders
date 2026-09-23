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
 it('keeps the prior file and gives a recovery step when replacement is uncertain',async()=>{
  const {component,rpc,remove,event}=setup();const existing:BoxRdFile={id:'saved',profile_signature:'profile',box_index:0,object_path:'old/path',filename:'old.rd',size_bytes:2,copies:2,revision:'old'};
  component.files=[existing];rpc.mockResolvedValueOnce({data:null,error:{message:'Network lost'}});
  await component.upload(event(new File(['rd'],'new.rd')),existing);
  expect(component.files[0]).toBe(existing);expect(component.error).toContain('Reload this box');expect(remove).not.toHaveBeenCalled();
 });
});
