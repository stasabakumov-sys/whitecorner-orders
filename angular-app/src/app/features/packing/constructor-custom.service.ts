import {Injectable} from '@angular/core';
import {SupabaseService} from '../../core/services/supabase.service';
import {BoxNet,drawingNumber} from './box-constructor-geometry';
import {RdFile,RdSettings} from './box-constructor-rd';

export interface ConstructorCustomRequest {p_request:string;p_title:string;p_constructor:any;p_svg:any;p_rd_files:any[]}
@Injectable({providedIn:'root'})
export class ConstructorCustomService {
  constructor(private db:SupabaseService){}
  title(net:BoxNet){return `Card box · ${drawingNumber(net.length)} × ${drawingNumber(net.width)} × ${drawingNumber(net.depth)} mm`;}
  async prepare(net:BoxNet,svg:string,files:RdFile[],settings:RdSettings,progress:(text:string)=>void):Promise<ConstructorCustomRequest>{
    if(files.length!==2)throw Error('Generate both RD files first.');
    const names=[`card-box-L${drawingNumber(net.length)}-W${drawingNumber(net.width)}-D${drawingNumber(net.depth)}.svg`,...files.map(file=>file.filename)];
    const blobs=[new Blob([svg],{type:'application/octet-stream'}),...files.map(file=>new Blob([file.bytes],{type:'application/octet-stream'}))];
    blobs.forEach((blob,index)=>{if(!blob.size||blob.size>20971520)throw Error(`${names[index]}: ${blob.size} bytes; allowed size is 1–20971520 bytes.`);});
    const auth=await this.db.client.auth.getUser();if(auth.error||!auth.data.user)throw auth.error||Error('Sign in and retry.');
    const request=crypto.randomUUID(),paths=blobs.map((_,index)=>`${auth.data.user!.id}/${request}/${index}.${index?'rd':'svg'}`);
    const uploaded:{bucket:string;path:string}[]=[];
    try{for(let index=0;index<blobs.length;index++){
      const bucket=index?'box-rd-files':'custom-packing-drawings';progress(`Uploading ${index+1} of 3: ${names[index]}…`);
      const result=await this.db.client.storage.from(bucket).upload(paths[index],blobs[index],{contentType:'application/octet-stream',upsert:false});
      if(result.error)throw result.error;uploaded.push({bucket,path:paths[index]});
    }}catch(error){await Promise.allSettled(uploaded.map(file=>this.db.client.storage.from(file.bucket).remove([file.path])));throw error;}
    const bottom={length:Number(drawingNumber(net.length)),width:Number(drawingNumber(net.width)),depth:Number(drawingNumber(net.depth))};
    return {p_request:request,p_title:this.title(net),p_constructor:{bottom,lid:{length:Number(drawingNumber(bottom.length+10)),width:Number(drawingNumber(bottom.width+10)),depth:bottom.depth},settings:structuredClone(settings)},
      p_svg:{path:paths[0],filename:names[0],bytes:blobs[0].size},p_rd_files:files.map((file,index)=>({path:paths[index+1],filename:file.filename,bytes:file.bytes.length}))};
  }
  async save(request:ConstructorCustomRequest){
    const result=await this.db.client.rpc('wc_create_constructor_custom_job',request);if(result.error)throw result.error;
    const data=result.data;
    if(!data?.job?.id||data.drawing?.object_path!==request.p_svg.path||data.rd_files?.length!==2||data.rd_files.some((file:any,index:number)=>file.object_path!==request.p_rd_files[index].path||file.copies!==2))throw Error('Server confirmation is incomplete. Retry the same request.');
    return data.job as {id:string;title:string};
  }
}
