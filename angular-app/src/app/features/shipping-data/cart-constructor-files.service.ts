import {Injectable} from '@angular/core';
import {SupabaseService} from '../../core/services/supabase.service';
import {RdFile} from '../packing/box-constructor-rd';
import {drawingNumber} from '../packing/box-constructor-geometry';
import {baseDrawingBox} from './box-drawing.component';
import {BoxRdFile} from './box-rd-files.component';

export function cartConstructorDimensions(box:any) {
 const length=Number(drawingNumber(Number(box.length_mm)-15)),width=Number(drawingNumber(Number(box.width_mm)-15)),depth=Number(box.height_mm);
 if(![length,width,depth].every(n=>Number.isFinite(n)&&n>0))throw Error('Save valid packaging dimensions: L and W greater than 15 mm, H greater than zero.');
 return {length,width,depth};
}
export interface CartConstructorState {drawing:any; files:BoxRdFile[]}
export interface CartConstructorSave {p_request:string;p_package:string;p_box:any;p_constructor:any;p_svg:any;p_rd_files:any[]}

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
 async prepare(box:any,svg:string,files:RdFile[],settings:any,previous:CartConstructorState,replacements:string[],progress:(text:string)=>void):Promise<CartConstructorSave>{
  const bottom=cartConstructorDimensions(box);
  if(files.length!==2)throw Error('Generate both RD files first.');
  if(previous.files.length!==0&&(previous.files.length!==2||replacements.length!==2||new Set(replacements).size!==2||replacements.some(id=>!previous.files.some(file=>file.id===id))))throw Error('Select the existing bottom and lid RD files to replace.');
  const svgBlob=new Blob([svg],{type:'image/svg+xml'}),blobs=[svgBlob,...files.map(file=>new Blob([file.bytes],{type:'application/octet-stream'}))];
  const filename=`cart-box-L${bottom.length}-W${bottom.width}-D${bottom.depth}.svg`;
  const names=[filename,...files.map(file=>file.filename)];
  blobs.forEach((blob,index)=>{if(!blob.size||blob.size>20971520)throw Error(`${names[index]}: ${blob.size} bytes; allowed size is 1–20971520 bytes.`);});
  const auth=await this.db.client.auth.getUser();if(auth.error)throw auth.error;if(!auth.data.user)throw Error('Sign in and retry.');
  const request=crypto.randomUUID(),paths=names.map((_,index)=>`${auth.data.user!.id}/${request}/${index}.${index?'rd':'svg'}`);
  const uploaded:{bucket:string;path:string}[]=[];
  try {
   for(let index=0;index<blobs.length;index++){
    progress(`Uploading ${index+1} of 3: ${names[index]}…`);
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
   p_constructor:{bottom,lid:{length:Number(drawingNumber(bottom.length+10)),width:Number(drawingNumber(bottom.width+10)),depth:bottom.depth},settings},
   p_svg:{path:paths[0],filename,bytes:svgBlob.size,expected:previous.drawing?.revision??null},
   p_rd_files:files.map((file,index)=>{const prior=previous.files.find(row=>row.id===replacements[index]);return {id:prior?.id??null,expected:prior?.revision??null,path:paths[index+1],filename:file.filename,bytes:file.bytes.length};})};
 }
 async save(request:CartConstructorSave):Promise<CartConstructorState>{
  const result=await this.db.client.rpc('wc_save_cart_constructor_files',request);if(result.error)throw result.error;
  const data=result.data;
  if(data?.drawing?.object_path!==request.p_svg.path||data?.rd_files?.length!==2||data.rd_files.some((file:any,index:number)=>file.object_path!==request.p_rd_files[index].path||file.copies!==2))throw Error('Server confirmation is incomplete. Retry the same save to check the result.');
  return {drawing:data.drawing,files:data.rd_files};
 }
 async downloadSvg(path:string,filename:string){
  const result=await this.db.client.storage.from('box-drawings').createSignedUrl(path,60,{download:filename});
  if(result.error)throw result.error;if(!result.data?.signedUrl)throw Error('Could not open the saved SVG. Retry.');
  const link=document.createElement('a');link.href=result.data.signedUrl;link.download=filename;link.rel='noopener';link.click();
 }
}
