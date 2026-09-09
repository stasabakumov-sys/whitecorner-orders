import {Component,Input,OnChanges} from '@angular/core';
import {SupabaseService} from '../../core/services/supabase.service';

export function sameDrawingBox(a:any,b:any):boolean {
 const stable=(v:any):string=>JSON.stringify(v===null||typeof v!=='object'?v:Array.isArray(v)?v.map(x=>JSON.parse(stable(x))):Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(stable(v[k]))])));
 return a!=null&&b!=null&&stable(a)===stable(b);
}
@Component({selector:'app-box-drawing',standalone:true,template:`
 <div class="drawing">
 @if(loading){<small>Loading…</small>}
 @else {
 @if(current){<button class="download" (click)="download()" [disabled]="busy" [title]="current.filename">{{current.filename}}</button><small>{{sizeLabel(current.size_bytes)}}</small>}
 @if(stale){<small>Box changed. Upload a matching drawing.</small>}
 <label class="upload">{{busy?'Uploading…':current?'Replace drawing':'Upload drawing'}}
 <input type="file" [attr.aria-label]="'Upload drawing for '+(box?.package_name||'box')" [disabled]="busy||loading||!!loadError" (change)="upload($event)">
 </label>
 <small>Up to 1 MB</small>
 }
 @if(error){<small role="alert">{{error}}</small>}
 @if(loadError){<button (click)="load()" [disabled]="loading">Retry</button>}
 </div>`,styles:[`
 :host{display:block;min-width:150px;max-width:220px}.drawing{display:flex;flex-direction:column;align-items:flex-start;gap:5px}
 small{font-size:.8rem;color:var(--wc-muted)}[role=alert]{color:var(--p-red-600,#b91c1c)}
 .download{max-width:100%;overflow-wrap:anywhere;text-align:left}
 .upload{position:relative;display:inline-block;border:1px solid var(--wc-border);border-radius:var(--wc-radius,6px);padding:7px 10px;font-size:.875rem;cursor:pointer;background:var(--wc-surface)}
 .upload:focus-within{outline:2px solid var(--wc-primary)}input{position:absolute;inset:0;width:100%;opacity:0;cursor:pointer}
 `]})
export class BoxDrawingComponent implements OnChanges {
 @Input() signature='';@Input() index=0;@Input() box:any;@Input() sharedSize='';
 record:any=null;busy=false;loading=false;error='';loadError=false;private generation=0;
 constructor(private db:SupabaseService){}
 get current(){return this.record&&(this.sharedSize||sameDrawingBox(this.record.box_snapshot,this.box))?this.record:null;}
 get stale(){return !!this.record&&!this.current;}
 sizeLabel(bytes:number){return `${Math.max(1,Math.ceil(bytes/1024))} KB`;}
 ngOnChanges(){void this.load();}
 async load(){const generation=++this.generation;this.loading=true;this.error='';this.loadError=false;this.record=null;
  try{const query=this.sharedSize?this.db.client.from('wc_backdrop_box_drawings').select('*').eq('size_key',this.sharedSize):this.db.client.from('wc_box_drawings').select('*').eq('profile_signature',this.signature).eq('box_index',this.index);
   const {data,error}=await query.maybeSingle();if(error)throw error;if(generation===this.generation)this.record=data;}
  catch{if(generation===this.generation){this.loadError=true;this.error='Could not load drawing. Please retry.';}}
  finally{if(generation===this.generation)this.loading=false;}
 }
 async upload(event:Event){const input=event.target as HTMLInputElement;const file=input.files?.[0];input.value='';if(!file||this.busy||this.loading||this.loadError)return;
  if(!file.size||file.size>1048576||file.name.length>255){this.error='Choose a non-empty file up to 1 MB (filename up to 255 characters).';return;}
  const generation=this.generation,signature=this.signature,index=this.index,box=structuredClone(this.box),previous=this.record,sharedSize=this.sharedSize;
  this.busy=true;this.error='';let path='';let uploaded=false;let attaching=false;
  try{
   const {data,error:authError}=await this.db.client.auth.getUser();if(authError||!data.user)throw new Error('Please sign in again.');
   path=`${data.user.id}/${crypto.randomUUID()}`;
   const binary=new File([file],file.name,{type:'application/octet-stream'});
   const {error:uploadError}=await this.db.client.storage.from('box-drawings').upload(path,binary,{contentType:'application/octet-stream',upsert:false});if(uploadError)throw uploadError;uploaded=true;
   attaching=true;
   const {data:drawing,error:saveError}=sharedSize
    ?await this.db.client.rpc('wc_save_backdrop_box_drawing',{p_size:sharedSize,p_path:path,p_filename:file.name,p_bytes:file.size,p_expected:previous?.revision??null})
    :await this.db.client.rpc('wc_attach_box_drawing',{p_signature:signature,p_index:index,p_box:box,p_path:path,p_filename:file.name,p_size:file.size,p_expected:previous?.revision??null});
   if(saveError)throw saveError;
   if(generation===this.generation)this.record=drawing;
   if(previous?.object_path)await this.db.client.storage.from('box-drawings').remove([previous.object_path]);
  }catch(e:any){if(generation===this.generation)this.error=e?.message||'Upload failed. Please retry.';
   // A lost RPC response may still have committed. Never delete a potentially linked file.
   if(uploaded&&!attaching)await this.db.client.storage.from('box-drawings').remove([path]);
  }finally{this.busy=false;}
 }
 async download(){const drawing=this.current;if(!drawing||this.busy)return;this.error='';
  try{const {data,error}=await this.db.client.storage.from('box-drawings').createSignedUrl(drawing.object_path,60,{download:drawing.filename});
  if(error||!data){this.error='Could not download drawing. Please retry.';return;}
  const a=document.createElement('a');a.href=data.signedUrl;a.download=drawing.filename;a.rel='noopener';a.click();
  }catch{this.error='Could not download drawing. Please retry.';}
 }
}
