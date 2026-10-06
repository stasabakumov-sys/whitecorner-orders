import {TestBed} from '@angular/core/testing';
import {CartConstructorFilesService,cartConstructorDimensions} from './cart-constructor-files.service';
import {CartBoxConstructorComponent} from './cart-box-constructor.component';
import {HubMembersService} from '../../core/services/hub-members.service';
import {SupabaseService} from '../../core/services/supabase.service';
import {signal} from '@angular/core';

const box={id:'box',package_name:'Top/Bottom',length_mm:1230,width_mm:630,height_mm:80};
const rd=[{filename:'bottom.rd',bytes:new Uint8Array(120)},{filename:'lid.rd',bytes:new Uint8Array(130)}];
describe('Cart Constructor files',()=>{
 it('subtracts transport allowance and preserves height for any dimensions',()=>{
  expect(cartConstructorDimensions(box)).toEqual({length:1215,width:615,depth:80});
  expect(cartConstructorDimensions({...box,length_mm:735,width_mm:435,height_mm:49.3})).toEqual({length:720,width:420,depth:49.3});
  expect(cartConstructorDimensions({...box,length_mm:30.1,width_mm:35.2})).toEqual({length:15.1,width:20.2,depth:80});
  expect(()=>cartConstructorDimensions({...box,width_mm:15})).toThrow('greater than 15');
 });
 it('uploads all three private files before saving and requires server confirmation',async()=>{
  const upload=vi.fn().mockResolvedValue({error:null}),remove=vi.fn(),rpc=vi.fn();
  const storage=vi.fn((_bucket:string)=>({upload,remove}));
  const service=new CartConstructorFilesService({client:{storage:{from:storage},auth:{getUser:async()=>({data:{user:{id:'user'}},error:null})},rpc}} as any);
  const prepared=await service.prepare(box,'<svg/>',rd,{}, {drawing:null,files:[]},[],()=>{});
  expect(upload).toHaveBeenCalledTimes(3);expect(rpc).not.toHaveBeenCalled();
  expect(storage.mock.calls.map(call=>call[0])).toEqual(['box-drawings','box-rd-files','box-rd-files']);
  expect(prepared.p_constructor.lid).toEqual({length:1225,width:625,depth:80});
  rpc.mockResolvedValueOnce({error:Error('Connection lost')}).mockImplementation(async()=>({data:{drawing:{object_path:prepared.p_svg.path},rd_files:prepared.p_rd_files.map(file=>({object_path:file.path,copies:2}))}}));
  await expect(service.save(prepared)).rejects.toThrow('Connection lost');await service.save(prepared);
  expect(rpc.mock.calls[0][1]).toBe(rpc.mock.calls[1][1]);expect(upload).toHaveBeenCalledTimes(3);
 });
 it('does not save a partial upload and cleans up unreferenced objects',async()=>{
  const upload=vi.fn().mockResolvedValueOnce({error:null}).mockResolvedValueOnce({error:Error('Upload failed')}),remove=vi.fn().mockResolvedValue({error:null}),rpc=vi.fn();
  const service=new CartConstructorFilesService({client:{storage:{from:()=>({upload,remove})},auth:{getUser:async()=>({data:{user:{id:'user'}}})},rpc}} as any);
  await expect(service.prepare(box,'<svg/>',rd,{}, {drawing:null,files:[]},[],()=>{})).rejects.toThrow('Upload failed');
  expect(rpc).not.toHaveBeenCalled();expect(remove).toHaveBeenCalledTimes(1);
 });
 it('requires distinct replacement IDs before uploading',async()=>{
  const upload=vi.fn();const service=new CartConstructorFilesService({client:{storage:{from:()=>({upload})}}} as any);
  await expect(service.prepare(box,'<svg/>',rd,{}, {drawing:null,files:[{id:'a'},{id:'b'}] as any},['a','a'],()=>{})).rejects.toThrow('Select the existing');expect(upload).not.toHaveBeenCalled();
 });
 it('keeps the same pending save and generated files after a lost response',async()=>{
  const pending={p_request:'request'};const files={prepare:vi.fn().mockResolvedValue(pending),save:vi.fn().mockRejectedValueOnce(Error('Disconnected')).mockResolvedValue({drawing:{},files:[]})};
  TestBed.configureTestingModule({providers:[{provide:CartConstructorFilesService,useValue:files},{provide:HubMembersService,useValue:{manager:signal(true)}}]});
  const component=TestBed.createComponent(CartBoxConstructorComponent).componentInstance;
  component.snapshot=box;component.seed=cartConstructorDimensions(box);
  component.editor={drawing:{width:1,height:1,cuts:[],folds:[],pieces:4},rdFiles:rd,rdSettings:{}} as any;
  await component.confirmSave();expect(component.error).toContain('Retry Save');expect(component.pending).toBe(pending);expect(component.editor?.rdFiles).toBe(rd);
  await component.confirmSave();expect(files.prepare).toHaveBeenCalledTimes(1);expect(files.save).toHaveBeenNthCalledWith(2,pending);expect(component.success).toContain('saved');expect(component.canSave).toBe(false);
 });
 it('uses one Small box RD, one copy and private uploads with a recoverable conversion request',async()=>{
  const upload=vi.fn().mockResolvedValue({error:null}),rpc=vi.fn();
  const service=new CartConstructorFilesService({client:{storage:{from:()=>({upload})},auth:{getUser:async()=>({data:{user:{id:'user'}}})},rpc}} as any);
  const smallBox={...box,length_mm:220,width_mm:140,height_mm:110};
  expect(cartConstructorDimensions(smallBox,'small')).toEqual({length:215,width:135,depth:110});
  const previous={drawing:{revision:'svg'},files:[{id:'bottom',revision:'a'},{id:'lid',revision:'b'}]} as any;
  const prepared=await service.prepare(smallBox,'<svg/>',[rd[0]],{},previous,[],()=>{},'small',40);
  expect(upload).toHaveBeenCalledTimes(2);
  expect(prepared.p_constructor.box_type).toBe('small');
  expect(prepared.p_constructor.box).toEqual({length:215,width:135,depth:110});
  expect(prepared.p_constructor.replace_files).toEqual([{id:'bottom',expected:'a'},{id:'lid',expected:'b'}]);
  expect(prepared.p_rd_files[0].id).toBeNull();
  rpc.mockResolvedValue({data:{drawing:{object_path:prepared.p_svg.path},rd_files:[{object_path:prepared.p_rd_files[0].path,copies:2}]}});
  await expect(service.save(prepared)).rejects.toThrow('confirmation');
  rpc.mockResolvedValue({data:{drawing:{object_path:prepared.p_svg.path},rd_files:[{object_path:prepared.p_rd_files[0].path,copies:1}]}});
  await service.save(prepared);
 });
 it('requires confirmation and keeps generated files when cancelled; restores a saved Small type',async()=>{
  const files={prepare:vi.fn(),load:vi.fn().mockResolvedValue({drawing:{constructor_data:{box_type:'small',tuck:35,rd_ids:['single']}},files:[{id:'single'}]})};
  TestBed.configureTestingModule({providers:[{provide:CartConstructorFilesService,useValue:files},{provide:HubMembersService,useValue:{manager:signal(true)}}]});
  const component=TestBed.createComponent(CartBoxConstructorComponent).componentInstance;
  component.box={...box,length_mm:220,width_mm:140,height_mm:110};await component.show();
  expect(component.boxType).toBe('small');expect(component.tuckSeed).toBe(35);expect(component.replacementIds).toEqual(['single']);
  component.editor={drawing:{},rdFiles:[rd[0]],rdBusy:false} as any;
  component.save();expect(component.confirmOpen).toBe(true);expect(files.prepare).not.toHaveBeenCalled();
  component.confirmOpen=false;expect(component.editor?.rdFiles).toEqual([rd[0]]);
  component.boxType='card';component.changeType();expect(component.seed).toEqual({length:205,width:125,depth:110});
 });
 it('does not open unsaved packaging or non-manager controls',async()=>{
  TestBed.configureTestingModule({providers:[{provide:CartConstructorFilesService,useValue:{load:vi.fn()}},{provide:HubMembersService,useValue:{manager:signal(false)}}]});
  const fixture=TestBed.createComponent(CartBoxConstructorComponent);fixture.componentRef.setInput('box',box);fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('button')).toBeNull();await fixture.componentInstance.show();expect(fixture.componentInstance.open).toBe(false);
 });
 it('opens Constructor for a saved Main + Add-ons box without a shared package ID',async()=>{
  const files={loadProfile:vi.fn().mockResolvedValue({drawing:null,files:[]})};
  TestBed.configureTestingModule({providers:[{provide:CartConstructorFilesService,useValue:files},{provide:HubMembersService,useValue:{manager:signal(true)}}]});
  const component=TestBed.createComponent(CartBoxConstructorComponent).componentInstance;
  component.box={...box,id:undefined,contents:[]};component.profileSignature='variant';component.profileIndex=2;
  await component.show();
  expect(component.open).toBe(true);expect(files.loadProfile).toHaveBeenCalledWith('variant',2);
  expect(component.seed).toEqual({length:1215,width:615,depth:80});
 });
 it('saves generated files to the exact variant and resumes after a partial response failure',async()=>{
  const upload=vi.fn().mockResolvedValue({error:null});
  let drawing:any=null;const saved:any[]=[];let failLid=true;
  const rpc=vi.fn(async(name:string,args:any)=>{
   if(name==='wc_attach_box_drawing'){drawing={object_path:args.p_path,filename:args.p_filename,revision:'new-svg'};return {data:drawing,error:null};}
   if(name==='wc_save_box_rd_file'){
    if(args.p_filename==='lid.rd'&&failLid){failLid=false;return {data:null,error:Error('Connection lost')};}
    const file={id:args.p_id||args.p_filename,object_path:args.p_path,filename:args.p_filename,copies:args.p_copies,revision:'new-rd'};
    saved.push(file);return {data:file,error:null};
   }
   throw Error('Unexpected RPC '+name);
  });
  const profileBox={...box,id:undefined,contents:[{component_key:'main'}]};
  const profileQuery:any={select:()=>profileQuery,eq:()=>profileQuery,maybeSingle:async()=>({data:{packages:[{}, {}, profileBox]},error:null})};
  const service=new CartConstructorFilesService({client:{from:()=>profileQuery,storage:{from:()=>({upload})},auth:{getUser:async()=>({data:{user:{id:'user'}},error:null})},rpc}} as any);
  vi.spyOn(service,'loadProfile').mockImplementation(async()=>({drawing,files:[...saved]}));
  const request=await service.prepareProfile('variant',2,profileBox,'<svg/>',rd,{}, {drawing:null,files:[]},[],()=>{});
  expect(request.p_box).toEqual(profileBox);expect(upload).toHaveBeenCalledTimes(3);
  await expect(service.saveProfile(request)).rejects.toThrow('Connection lost');
  expect(saved).toHaveLength(1);
  const state=await service.saveProfile(request);
  expect(state.files).toHaveLength(2);
  expect(rpc.mock.calls.filter(call=>call[0]==='wc_attach_box_drawing')).toHaveLength(1);
  expect(rpc.mock.calls.filter(call=>call[0]==='wc_save_box_rd_file'&&call[1].p_filename==='bottom.rd')).toHaveLength(1);
  expect(rpc.mock.calls.filter(call=>call[0]==='wc_save_box_rd_file'&&call[1].p_filename==='lid.rd')).toHaveLength(2);
 });
 it('rejects a box type change before uploading when profile RD files already exist',async()=>{
  const upload=vi.fn();const service=new CartConstructorFilesService({client:{storage:{from:()=>({upload})}}} as any);
  await expect(service.prepareProfile('variant',0,box,'<svg/>',[rd[0]],{}, {drawing:null,files:[{id:'a'},{id:'b'}] as any},[],()=>{},'small')).rejects.toThrow('Remove the old RD files');
  expect(upload).not.toHaveBeenCalled();
 });
});
