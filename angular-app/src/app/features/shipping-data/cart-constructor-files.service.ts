import {Injectable} from '@angular/core';
import {SupabaseService} from '../../core/services/supabase.service';
import {RdFile} from '../packing/box-constructor-rd';
import {backdropBox} from '../packing/backdrop-box-geometry';
import {drawingNumber} from '../packing/box-constructor-geometry';
import {baseDrawingBox} from './box-drawing.component';
import {BoxRdFile} from './box-rd-files.component';
import {qualifiedDrawingKey} from './product-sizes';

export type CartBoxType = 'card' | 'small' | 'backdrop';
export function cartConstructorDimensions(box:any,type:CartBoxType='card') {
 const allowance=type==='backdrop'?0:type==='small'?5:15;
 const length=Number(drawingNumber(Number(box.length_mm)-allowance)),width=Number(drawingNumber(Number(box.width_mm)-allowance)),depth=Number(box.height_mm);
 if(![length,width,depth].every(n=>Number.isFinite(n)&&n>0))throw Error(`Save valid packaging dimensions: L and W greater than ${allowance} mm, H greater than zero.`);
 return {length,width,depth};
}
export const constructorFileCount=(type:CartBoxType,box?:any)=>type==='backdrop'&&box?(()=>{const net=backdropBox(Number(box.length_mm),Number(box.width_mm),Number(box.height_mm));return net.bottom.length+net.lid.length;})():type==='backdrop'?4:type==='small'?1:2;
export const constructorCopies=(type:CartBoxType)=>type==='card'?2:1;
export const validConstructorFileCount=(count:number)=>[0,1,2,4].includes(count);
export function backdropConstructorData(box:any){
 const net=backdropBox(Number(box.length_mm),Number(box.width_mm),Number(box.height_mm));
 const dimensions=(part:any)=>({length:part.length,width:part.width,depth:part.depth});
 return JSON.parse(JSON.stringify({bottom:dimensions(net.bottom[0]),lid:dimensions(net.lid[0]),rim:net.rim,main_panel:net.bottom[0].panelLength},(_,value)=>typeof value==='number'?Number(drawingNumber(value)):value));
}
export interface CartConstructorState {drawing:any; files:BoxRdFile[]}
export interface CartConstructorSave {p_request:string;p_package:string;p_box:any;p_constructor:any;p_svg:any;p_rd_files:any[]}
export interface ProfileConstructorSave extends CartConstructorSave {p_signature:string;p_index:number}
export type BackdropConstructorSave=Omit<CartConstructorSave,'p_package'>&{p_size:string};

function stableJson(value:any):string {
 return JSON.stringify(value,(_,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
}

@Injectable({providedIn:'root'})
export class CartConstructorFilesService {
 constructor(private db:SupabaseService){}
 async load(id:string):Promise<CartConstructorState>{
  const results=await Promise.all([
   this.db.client.from('wc_cart_box_svg_drawings').select('*').eq('cart_base_package_id',id).maybeSingle(),
   this.db.client.from('wc_box_rd_files').select('*').eq('cart_base_package_id',id).order('filename'),
  ]);
  for(const result of results)if(result.error)throw result.error;
  return {drawing:results[0].data,files:results[1].data||[]};
 }
 async loadProfile(signature:string,index:number):Promise<CartConstructorState>{
  const results=await Promise.all([
   this.db.client.from('wc_box_drawings').select('*').eq('profile_signature',signature).eq('box_index',index).maybeSingle(),
   this.db.client.from('wc_box_rd_files').select('*').eq('profile_signature',signature).eq('box_index',index).order('created_at'),
  ]);
  for(const result of results)if(result.error)throw result.error;
  return {drawing:results[0].data,files:results[1].data||[]};
 }
 async loadBackdrop(size:string):Promise<CartConstructorState>{
  if(!qualifiedDrawingKey(size))throw Error('Choose an exact size and Foldable or Non-foldable.');
  const results=await Promise.all([
   this.db.client.from('wc_backdrop_box_svg_drawings').select('*').eq('size_key',size).maybeSingle(),
   this.db.client.from('wc_box_rd_files').select('*').eq('backdrop_size_key',size).order('created_at'),
  ]);
  for(const result of results)if(result.error)throw result.error;
  return {drawing:results[0].data,files:results[1].data||[]};
 }
 async prepareBackdrop(size:string,box:any,svg:string,files:RdFile[],settings:any,previous:CartConstructorState,replacements:string[],progress:(text:string)=>void,type:CartBoxType='card',tuck=40):Promise<BackdropConstructorSave>{
  if(!qualifiedDrawingKey(size))throw Error('Save dimensions for an exact size and Foldable or Non-foldable before opening Constructor.');
  const {p_package,...request}=await this.prepare(box,svg,files,settings,previous,replacements,progress,type,tuck,'backdrop');
  return {...request,p_size:size};
 }
 async saveBackdrop(request:BackdropConstructorSave):Promise<CartConstructorState>{
  const result=await this.db.client.rpc('wc_save_backdrop_constructor_files',request);if(result.error)throw result.error;
  const data=result.data;
  if(data?.drawing?.size_key!==request.p_size||data.drawing.object_path!==request.p_svg.path||data.rd_files?.length!==request.p_rd_files.length||data.rd_files.some((file:any,index:number)=>file.backdrop_size_key!==request.p_size||file.object_path!==request.p_rd_files[index].path||file.copies!==constructorCopies(request.p_constructor.box_type)))throw Error('Server confirmation is incomplete. Retry the same save to check the result.');
  return {drawing:data.drawing,files:data.rd_files};
 }
 async prepare(box:any,svg:string,files:RdFile[],settings:any,previous:CartConstructorState,replacements:string[],progress:(text:string)=>void,type:CartBoxType='card',tuck=40,scope:'cart'|'backdrop'='cart'):Promise<CartConstructorSave>{
  const bottom=cartConstructorDimensions(box,type),count=constructorFileCount(type,box);
  const geometry=type==='backdrop'?backdropConstructorData(box):type==='small'?{box:bottom,tuck}:{bottom,lid:{length:Number(drawingNumber(bottom.length+10)),width:Number(drawingNumber(bottom.width+10)),depth:bottom.depth}};
  if(files.length!==count)throw Error(`Generate ${count} RD file${count===1?'':'s'} first.`);
  if(!validConstructorFileCount(previous.files.length))throw Error('Review this RD set first; Constructor supports one, two or four saved files.');
  const resize=previous.files.length>0&&previous.files.length!==count;
  if(!resize&&previous.files.length!==0&&(replacements.length!==count||new Set(replacements).size!==count||replacements.some(id=>!previous.files.some(file=>file.id===id))))throw Error('Select the existing RD files to replace.');
  const svgBlob=new Blob([svg],{type:'image/svg+xml'}),blobs=[svgBlob,...files.map(file=>new Blob([file.bytes],{type:'application/octet-stream'}))];
  const filename=`${scope}-${type}-box-L${bottom.length}-W${bottom.width}-D${bottom.depth}${type==='small'?'-T'+drawingNumber(tuck):''}.svg`;
  const names=[filename,...files.map(file=>file.filename)];
  blobs.forEach((blob,index)=>{if(!blob.size||blob.size>20971520)throw Error(`${names[index]}: ${blob.size} bytes; allowed size is 1–20971520 bytes.`);});
  const auth=await this.db.client.auth.getUser();if(auth.error)throw auth.error;if(!auth.data.user)throw Error('Sign in and retry.');
  const request=crypto.randomUUID(),paths=names.map((_,index)=>`${auth.data.user!.id}/${request}/${index}.${index?'rd':'svg'}`);
  const uploaded:{bucket:string;path:string}[]=[];
  try {
   for(let index=0;index<blobs.length;index++){
    progress(`Uploading ${index+1} of ${blobs.length}: ${names[index]}…`);
    const bucket=index?'box-rd-files':'box-drawings';
    const upload=await this.db.client.storage.from(bucket).upload(paths[index],blobs[index],{upsert:false});
    if(upload.error)throw upload.error;
    uploaded.push({bucket,path:paths[index]});
   }
  }catch(error){
   // No save RPC has run: these objects cannot be referenced by a saved drawing.
   await Promise.allSettled(uploaded.map(file=>this.db.client.storage.from(file.bucket).remove([file.path])));
   throw error;
  }
  return {p_request:request,p_package:box.id,p_box:baseDrawingBox(box),
   p_constructor:{box_type:type,...geometry,settings,...(resize?{replace_files:previous.files.map(file=>({id:file.id,expected:file.revision}))}:{})},
   p_svg:{path:paths[0],filename,bytes:svgBlob.size,expected:previous.drawing?.revision??null},
   p_rd_files:files.map((file,index)=>{const prior=resize?undefined:previous.files.find(row=>row.id===replacements[index]);return {id:prior?.id??null,expected:prior?.revision??null,path:paths[index+1],filename:file.filename,bytes:file.bytes.length};})};
 }
 async prepareProfile(signature:string,index:number,box:any,svg:string,files:RdFile[],settings:any,previous:CartConstructorState,replacements:string[],progress:(text:string)=>void,type:CartBoxType='card',tuck=40):Promise<ProfileConstructorSave>{
  if(!signature||!Number.isSafeInteger(index)||index<0)throw Error('Save this packaging variant before opening Constructor.');
  if(previous.files.length&&previous.files.length!==files.length)throw Error('Remove the old RD files in the RD editor before changing box type.');
  const request=await this.prepare(box,svg,files,settings,previous,replacements,progress,type,tuck);
  return {...request,p_signature:signature,p_index:index,p_box:box};
 }
 async save(request:CartConstructorSave):Promise<CartConstructorState>{
  const result=await this.db.client.rpc('wc_save_cart_constructor_files',request);if(result.error)throw result.error;
  const data=result.data;
  if(data?.drawing?.object_path!==request.p_svg.path||data?.rd_files?.length!==request.p_rd_files.length||data.rd_files.some((file:any,index:number)=>file.object_path!==request.p_rd_files[index].path||file.copies!==constructorCopies(request.p_constructor.box_type)))throw Error('Server confirmation is incomplete. Retry the same save to check the result.');
  return {drawing:data.drawing,files:data.rd_files};
 }
 async saveProfile(request:ProfileConstructorSave):Promise<CartConstructorState>{
  const {p_signature:signature,p_index:index}=request;
  if(!signature||!Number.isSafeInteger(index)||index<0)throw Error('Packaging variant is missing. Reopen Constructor.');
  const profile=await this.db.client.from('wc_delivery_packaging_profiles').select('packages').eq('signature',signature).maybeSingle();
  if(profile.error)throw profile.error;
  if(stableJson(profile.data?.packages?.[index])!==stableJson(request.p_box))throw Error('Packaging dimensions or contents changed. Reopen Constructor.');
  const current=await this.loadProfile(signature,index);
  const wanted=request.p_rd_files;
  if(current.files.some(file=>!wanted.some(entry=>entry.id===file.id||!entry.id&&entry.path===file.object_path)))throw Error('RD files changed. Reopen Constructor before saving.');
  if(current.drawing?.object_path!==request.p_svg.path){
   const result=await this.db.client.rpc('wc_attach_box_drawing',{p_signature:signature,p_index:index,p_box:request.p_box,p_path:request.p_svg.path,p_filename:request.p_svg.filename,p_size:request.p_svg.bytes,p_expected:request.p_svg.expected});
   if(result.error)throw result.error;
   if(result.data?.object_path!==request.p_svg.path)throw Error('Server did not confirm the SVG drawing. Reload and retry.');
  }
  for(const entry of wanted){
   const saved=current.files.find(file=>entry.id?file.id===entry.id:file.object_path===entry.path);
   if(saved?.object_path===entry.path)continue;
   const result=await this.db.client.rpc('wc_save_box_rd_file',{p_id:entry.id,p_signature:signature,p_index:index,p_path:entry.path,p_filename:entry.filename,p_bytes:entry.bytes,p_copies:constructorCopies(request.p_constructor.box_type),p_expected:entry.expected});
   if(result.error)throw result.error;
   if(result.data?.object_path!==entry.path)throw Error(`${entry.filename}: server did not confirm the RD file. Reload and retry.`);
  }
  const confirmed=await this.loadProfile(signature,index);
  if(confirmed.drawing?.object_path!==request.p_svg.path||confirmed.files.length!==wanted.length||wanted.some(entry=>!confirmed.files.some(file=>file.object_path===entry.path&&file.copies===constructorCopies(request.p_constructor.box_type))))throw Error('Server confirmation is incomplete. Retry the same save to check the result.');
  return confirmed;
 }
 async downloadSvg(path:string,filename:string){
  const result=await this.db.client.storage.from('box-drawings').createSignedUrl(path,60,{download:filename});
  if(result.error)throw result.error;if(!result.data?.signedUrl)throw Error('Could not open the saved SVG. Retry.');
  const link=document.createElement('a');link.href=result.data.signedUrl;link.download=filename;link.rel='noopener';link.click();
 }
}
