import {describe,it,expect,vi} from 'vitest';
import {ConstructorCustomService} from './constructor-custom.service';
import {ConstructorCustomSendComponent} from './constructor-custom-send.component';
import {boxNet} from './box-constructor-geometry';

const files=[{filename:'bottom.rd',bytes:new Uint8Array(100)},{filename:'lid.rd',bytes:new Uint8Array(101)}];
const settings:any={cut:{speed:120,minPower:70,maxPower:80},fold:{speed:120,minPower:70,maxPower:80},foldMode:'dot',dotTime:.1,dotInterval:2,dotLength:1};
describe('Constructor Custom creation',()=>{
  function setup(){const upload=vi.fn().mockResolvedValue({error:null}),remove=vi.fn().mockResolvedValue({error:null}),rpc=vi.fn();const from=vi.fn().mockReturnValue({upload,remove});const service=new ConstructorCustomService({client:{auth:{getUser:async()=>({data:{user:{id:'owner'}}})},storage:{from},rpc}} as any);return {service,upload,remove,rpc,from};}
  it('uploads SVG and both RD files privately and checks complete server confirmation',async()=>{
    const {service,upload,rpc,from}=setup();const request=await service.prepare(boxNet(1515,615,70),'<svg/>',files,settings,()=>{});
    expect(upload).toHaveBeenCalledTimes(3);expect(from).toHaveBeenCalledWith('custom-packing-drawings');expect(from).toHaveBeenCalledWith('box-rd-files');
    expect(request.p_constructor.lid).toEqual({length:1525,width:625,depth:70});
    rpc.mockResolvedValue({data:{job:{id:'job',title:request.p_title},drawing:{object_path:request.p_svg.path},rd_files:request.p_rd_files.map(file=>({...file,object_path:file.path,copies:2}))}});
    expect((await service.save(request)).id).toBe('job');
    rpc.mockResolvedValue({data:{job:{id:'job'}}});await expect(service.save(request)).rejects.toThrow('confirmation is incomplete');
  });
  it('cleans up partial uploads before any save and does not create an incomplete job',async()=>{
    const {service,upload,remove,rpc}=setup();upload.mockResolvedValueOnce({error:null}).mockResolvedValueOnce({error:Error('offline')});
    await expect(service.prepare(boxNet(1515,615,70),'<svg/>',files,settings,()=>{})).rejects.toThrow('offline');expect(remove).toHaveBeenCalledOnce();expect(rpc).not.toHaveBeenCalled();
  });
  it('requires confirmation, keeps files on cancellation and retries the identical pending save',async()=>{
    const pending:any={p_title:'Card box',p_request:'request'};const prepare=vi.fn().mockResolvedValue(pending),save=vi.fn().mockRejectedValueOnce(Error('lost response')).mockResolvedValueOnce({id:'job',title:'Card box'});
    const component=new ConstructorCustomSendComponent({title:()=> 'Card box',prepare,save} as any,{markForCheck:()=>{}} as any);
    const generateRd=vi.fn();component.editor={net:boxNet(1515,615,70),layout:'pair',rdFiles:files,rdSettings:settings,generateRd} as any;
    component.open();expect(save).not.toHaveBeenCalled();component.confirmation=false;await component.confirm();expect(prepare).not.toHaveBeenCalled();expect(component.editor.rdFiles).toEqual(files);
    component.open();await component.confirm();expect(component.pending).toBe(pending);expect(component.confirmation).toBe(true);expect(component.error).toContain('lost response');
    await component.confirm();expect(prepare).toHaveBeenCalledOnce();expect(save).toHaveBeenNthCalledWith(2,pending);expect(component.success).toContain('created');expect(component.confirmation).toBe(false);expect(generateRd).not.toHaveBeenCalled();
  });
  it('generates RD only after confirmation and preserves a generation failure for retry',async()=>{
    const prepare=vi.fn();const component=new ConstructorCustomSendComponent({title:()=> 'Card box',prepare} as any,{markForCheck:()=>{}} as any);
    const generateRd=vi.fn().mockResolvedValue(undefined);component.editor={net:boxNet(1515,615,70),rdFiles:[],rdError:'Generation failed',generateRd} as any;
    component.open();expect(generateRd).not.toHaveBeenCalled();await component.confirm();expect(generateRd).toHaveBeenCalledOnce();expect(prepare).not.toHaveBeenCalled();expect(component.error).toContain('Generation failed');expect(component.busy).toBe(false);
  });
});
