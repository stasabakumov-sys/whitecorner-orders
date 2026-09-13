import {describe,it,expect,vi} from 'vitest';
import {BoxDrawingComponent,sameDrawingBox} from './box-drawing.component';
function setup(){
 const bucket={upload:vi.fn().mockResolvedValue({error:null}),remove:vi.fn().mockResolvedValue({error:null}),createSignedUrl:vi.fn().mockResolvedValue({data:{signedUrl:'https://example.invalid/drawing'},error:null})};
 const rpc=vi.fn().mockResolvedValue({data:{filename:'box.cdr',box_snapshot:{length_mm:970},object_path:'new'},error:null});
 const db={client:{auth:{getUser:vi.fn().mockResolvedValue({data:{user:{id:'user'}}})},storage:{from:vi.fn().mockReturnValue(bucket)},rpc}};
 const c=new BoxDrawingComponent(db as any);c.signature='profile';c.index=0;c.box={length_mm:970};return {c,bucket,rpc};
}
const event=(size=25*1024)=>({target:{files:[new File([new Uint8Array(size)],'box.cdr',{type:'application/x-coreldraw'})],value:'chosen'}} as unknown as Event);
describe('Private saved box drawings',()=>{
 it('accepts a 1.7 MB CDR and confirms persistence',async()=>{const {c,bucket}=setup();await c.upload(event(Math.ceil(1.7*1048576)));expect(bucket.upload).toHaveBeenCalled();expect(c.success).toContain('uploaded and saved');});
 it('reports the filename, actual size and limit for oversized drawings',async()=>{const {c,bucket}=setup();await c.upload(event(21*1048576));expect(c.error).toContain('box.cdr (21.0 MB)');expect(c.error).toContain('20 MB limit');expect(bucket.upload).not.toHaveBeenCalled();});
 it('does not claim success when the server returns no attachment',async()=>{const {c,rpc}=setup();rpc.mockResolvedValue({data:null,error:null} as any);await c.upload(event());expect(c.success).toBe('');expect(c.error).toContain('did not confirm');});
 it('links a product drawing to its product and variant, independently from packaging',async()=>{
  const {c,rpc}=setup();c.productId='product';c.variantKey='size-190';
  await c.upload(event());
  expect(rpc).toHaveBeenCalledWith('wc_save_product_drawing',expect.objectContaining({p_product:'product',p_variant:'size-190',p_filename:'box.cdr',p_expected:null}));
  c.box={length_mm:123};expect(c.current.filename).toBe('box.cdr');
 });
 it('uploads CDR unchanged and links it only after successful storage upload',async()=>{
  const {c,bucket,rpc}=setup();await c.upload(event());
  expect(bucket.upload.mock.calls[0][1].name).toBe('box.cdr');expect(bucket.upload.mock.calls[0][2]).toEqual({contentType:'application/octet-stream',upsert:false});
  expect(rpc).toHaveBeenCalledWith('wc_attach_box_drawing',expect.objectContaining({p_signature:'profile',p_index:0,p_box:{length_mm:970},p_filename:'box.cdr',p_size:25600,p_expected:null}));expect(c.current.filename).toBe('box.cdr');
 });
 it('keeps the previous drawing when a replacement upload fails',async()=>{
  const {c,bucket,rpc}=setup();c.record={filename:'old.cdr',object_path:'old',box_snapshot:c.box,revision:'old'};bucket.upload.mockResolvedValue({error:new Error('Upload failed')});
  await c.upload(event());expect(c.current.filename).toBe('old.cdr');expect(rpc).not.toHaveBeenCalled();expect(bucket.remove).not.toHaveBeenCalled();expect(c.busy).toBe(false);
 });
 it('does not delete a file after an uncertain attachment response',async()=>{
  const {c,bucket,rpc}=setup();rpc.mockRejectedValue(new Error('Network interrupted'));await c.upload(event());expect(bucket.remove).not.toHaveBeenCalled();expect(c.error).toContain('Network interrupted');
 });
 it('rejects oversized files before uploading and hides a drawing after box changes',async()=>{
  const {c,bucket}=setup();await c.upload(event(20971521));expect(bucket.upload).not.toHaveBeenCalled();c.record={box_snapshot:{length_mm:900}};expect(c.current).toBeNull();expect(c.stale).toBe(true);
  expect(sameDrawingBox({a:1,b:[{x:2,y:3}]},{b:[{y:3,x:2}],a:1})).toBe(true);
 });
 it('downloads through a short lived attachment URL, without public storage',async()=>{
  const {c,bucket}=setup();c.record={box_snapshot:c.box,object_path:'user/file',filename:'box.cdr'};const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});await c.download();expect(bucket.createSignedUrl).toHaveBeenCalledWith('user/file',60,{download:'box.cdr'});expect(click).toHaveBeenCalled();click.mockRestore();
 });
});

describe('Qualified shared drawing uploads',()=>{
 it('saves and replaces only the selected folding variant',async()=>{
  const {c,rpc}=setup();c.sharedSize='2000x1000:nonfoldable';c.record={filename:'flat.cdr',revision:'flat-revision'};
  await c.upload(event());expect(rpc).toHaveBeenCalledWith('wc_save_backdrop_box_drawing',expect.objectContaining({p_size:'2000x1000:nonfoldable',p_expected:'flat-revision'}));
 });
 it('blocks unclassified and read-only slots before any storage upload',async()=>{
  const {c,bucket}=setup();c.sharedSize='2000x1000';await c.upload(event());expect(c.error).toContain('Foldable');expect(bucket.upload).not.toHaveBeenCalled();
  c.sharedSize='2000x1000:foldable';c.legacySizeDrawing=true;await c.upload(event());expect(bucket.upload).not.toHaveBeenCalled();
  c.legacySizeDrawing=false;c.readOnly=true;await c.upload(event());expect(bucket.upload).not.toHaveBeenCalled();
 });
 it('keeps the known shared file and reports a concurrent replacement without claiming success',async()=>{
  const {c,rpc}=setup();c.sharedSize='2000x1000:foldable';c.record={filename:'original.cdr',revision:'r1'};rpc.mockResolvedValue({data:null,error:Error('Packaging drawing already exists or changed. Refresh before replacing it.')} as any);
  await c.upload(event());expect(c.current.filename).toBe('original.cdr');expect(c.success).toBe('');expect(c.error).toContain('already exists');
 });
 it('fails closed when looking for a legacy drawing fails and recovers on retry',async()=>{
  const {c}=setup();c.sharedSize='2000x1000:foldable';let fail=true;
  (c as any).db.client.from=()=>{let key='';const q:any={select:()=>q,eq:(_field:string,value:string)=>{key=value;return q;},maybeSingle:async()=>({data:null,error:!key.includes(':')&&fail?Error('offline'):null})};return q;};
  await c.load();expect(c.loadError).toBe(true);fail=false;await c.load();expect(c.loadError).toBe(false);expect(c.current).toBeNull();
 });
});
