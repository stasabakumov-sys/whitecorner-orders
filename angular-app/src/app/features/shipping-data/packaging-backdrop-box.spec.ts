import {TestBed} from '@angular/core/testing';
import {signal} from '@angular/core';
import {CartConstructorFilesService,cartConstructorDimensions,backdropConstructorData} from './cart-constructor-files.service';
import {CartBoxConstructorComponent} from './cart-box-constructor.component';
import {HubMembersService} from '../../core/services/hub-members.service';
import {backdropBox} from '../packing/backdrop-box-geometry';

const box={id:'box',package_name:'Arch box',length_mm:930,width_mm:930,height_mm:80};
const size='1800x900:foldable';
const rd=Array.from({length:4},(_,i)=>({filename:`PART${i}.rd`,bytes:new Uint8Array(120)}));
describe('Backdrop box in saved packaging',()=>{
 it('seeds package dimensions unchanged and derives the reference only once',()=>{
  expect(cartConstructorDimensions(box,'backdrop')).toEqual({length:930,width:930,depth:80});
  const seed=cartConstructorDimensions(box,'backdrop'),net=backdropBox(seed.length,seed.width,seed.depth);
  expect(net.bottom[0].length).toBe(915);expect(net.lid[0].length).toBe(925);
  expect(backdropConstructorData(box)).toEqual({bottom:{length:915,width:915,depth:80},lid:{length:925,width:925,depth:80},rim:80,main_panel:786});
  expect(backdropConstructorData({...box,length_mm:1850,width_mm:1100})).toMatchObject({rim:37.5,main_panel:952.5});
 });
 it('uploads SVG and four distinct RD files, preserves revisions and requires one-copy confirmation',async()=>{
  const upload=vi.fn().mockResolvedValue({error:null}),rpc=vi.fn();
  const service=new CartConstructorFilesService({client:{auth:{getUser:async()=>({data:{user:{id:'owner'}}})},storage:{from:()=>({upload})},rpc}} as any);
  const previous={drawing:{revision:'svg'},files:[{id:'old',revision:'rd'}]} as any;
  const request=await service.prepareBackdrop(size,box,'<svg/>',rd,{},previous,[],()=>{},'backdrop');
  expect(upload).toHaveBeenCalledTimes(5);expect(request.p_constructor.replace_files).toEqual([{id:'old',expected:'rd'}]);
  expect(request.p_constructor).toMatchObject({box_type:'backdrop',rim:80,main_panel:786});
  expect(new Set(request.p_rd_files.map(file=>file.path)).size).toBe(4);
  expect(request.p_rd_files.every(file=>file.id===null)).toBe(true);
  const data={drawing:{size_key:size,object_path:request.p_svg.path},rd_files:request.p_rd_files.map(file=>({backdrop_size_key:size,object_path:file.path,copies:2}))};
  rpc.mockResolvedValue({data});await expect(service.saveBackdrop(request)).rejects.toThrow('confirmation');
  data.rd_files.forEach(file=>file.copies=1);await service.saveBackdrop(request);expect(upload).toHaveBeenCalledTimes(5);
  const existing={drawing:{revision:'svg'},files:rd.map((file,i)=>({...file,id:`id${i}`,revision:`rev${i}`}))} as any;
  const replacement=await service.prepare(box,'<svg/>',rd,{},existing,['id3','id2','id1','id0'],()=>{},'backdrop');
  expect(replacement.p_rd_files.map(file=>file.expected)).toEqual(['rev3','rev2','rev1','rev0']);
  expect(replacement.p_constructor.replace_files).toBeUndefined();
 });
 it('rejects impossible geometry and unsupported saved sets before uploading',async()=>{
  const upload=vi.fn();const service=new CartConstructorFilesService({client:{storage:{from:()=>({upload})}}} as any);
  await expect(service.prepare({...box,width_mm:1175},'<svg/>',rd,{}, {drawing:null,files:[]},[],()=>{},'backdrop')).rejects.toThrow('border');
  await expect(service.prepare(box,'<svg/>',rd,{}, {drawing:null,files:[{},{},{}] as any},[],()=>{},'backdrop')).rejects.toThrow('Review this RD set');
  expect(upload).not.toHaveBeenCalled();
 });
 it('restores the saved type and ordered replacements, preserving the same save for retry',async()=>{
  const previous={drawing:{constructor_data:{box_type:'backdrop',rd_ids:['d','c','b','a']}},files:['a','b','c','d'].map(id=>({id}))};
  const request={p_request:'same'};
  const files={loadBackdrop:vi.fn().mockResolvedValue(previous),prepareBackdrop:vi.fn().mockResolvedValue(request),saveBackdrop:vi.fn().mockRejectedValueOnce(Error('Lost response')).mockResolvedValue(previous)};
  TestBed.configureTestingModule({providers:[{provide:CartConstructorFilesService,useValue:files},{provide:HubMembersService,useValue:{manager:signal(true)}}]});
  const c=TestBed.createComponent(CartBoxConstructorComponent).componentInstance;c.box=box;c.sharedSize=size;await c.show();
  expect(c.boxType).toBe('backdrop');expect(c.seed).toEqual({length:930,width:930,depth:80});expect(c.replacementIds).toEqual(['d','c','b','a']);
  expect(c.fileLabels).toEqual(['Bottom main','Bottom short','Lid main','Lid short']);expect(c.copies).toBe(1);expect(c.saveLabel).toContain('four RD files');
  c.editor={drawing:backdropBox(930,930,80).drawing,rdFiles:rd,rdSettings:{}} as any;
  c.save();expect(c.confirmOpen).toBe(true);expect(files.prepareBackdrop).not.toHaveBeenCalled();
  await c.confirmSave();expect(c.pending).toBe(request);expect(c.error).toContain('Retry Save');
  await c.confirmSave();expect(files.prepareBackdrop).toHaveBeenCalledTimes(1);expect(files.saveBackdrop).toHaveBeenLastCalledWith(request);expect(c.success).toContain('4 RD files');
 });
 it('infers four-file profile drawings but honours explicit saved metadata',async()=>{
  const state:any={drawing:{},files:['a','b','c','d'].map(id=>({id}))};
  const files={loadProfile:vi.fn().mockResolvedValue(state)};
  TestBed.configureTestingModule({providers:[{provide:CartConstructorFilesService,useValue:files},{provide:HubMembersService,useValue:{manager:signal(true)}}]});
  const c=TestBed.createComponent(CartBoxConstructorComponent).componentInstance;c.box=box;c.profileSignature='profile';await c.show();
  expect(c.boxType).toBe('backdrop');expect(c.replacementIds).toEqual(['a','b','c','d']);
  state.drawing={constructor_data:{box_type:'card'}};await c.load();expect(c.boxType).toBe('card');
 });
 it('saves four profile-local files with one copy through the existing profile contract',async()=>{
  const upload=vi.fn().mockResolvedValue({error:null});let drawing:any=null;const saved:any[]=[];
  const rpc=vi.fn(async(name:string,args:any)=>{
   if(name==='wc_attach_box_drawing'){drawing={object_path:args.p_path};return {data:drawing};}
   const file={id:args.p_filename,object_path:args.p_path,copies:args.p_copies};saved.push(file);return {data:file};
  });
  const query:any={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:{packages:[box]}})};
  const service=new CartConstructorFilesService({client:{from:()=>query,auth:{getUser:async()=>({data:{user:{id:'owner'}}})},storage:{from:()=>({upload})},rpc}} as any);
  vi.spyOn(service,'loadProfile').mockImplementation(async()=>({drawing,files:saved}));
  const request=await service.prepareProfile('profile',0,box,'<svg/>',rd,{}, {drawing:null,files:[]},[],()=>{},'backdrop');
  const result=await service.saveProfile(request);expect(result.files).toHaveLength(4);expect(result.files.every(file=>file.copies===1)).toBe(true);
  expect(rpc.mock.calls.filter(call=>call[0]==='wc_save_box_rd_file')).toHaveLength(4);
 });
});
