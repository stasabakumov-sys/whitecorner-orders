import {Component,Input,OnChanges,ChangeDetectorRef,Optional} from '@angular/core';
import {SupabaseService} from '../../core/services/supabase.service';

export function sameDrawingBox(a:any,b:any):boolean {
 const stable=(v:any):string=>JSON.stringify(v===null||typeof v!=='object'?v:Array.isArray(v)?v.map(x=>JSON.parse(stable(x))):Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(stable(v[k]))])));
 return a!=null&&b!=null&&stable(a)===stable(b);
}
@Component({selector:'app-box-drawing',standalone:true,template:`
 <div class="drawing">
 @if(loading){<small>Loading…</small>}
 @else {
 <div class="file-row">
 @if(current){<button class="download" (click)="download()" [disabled]="busy" [title]="current.filename">{{current.filename}}</button>}
 <label class="upload" [class.replace]="!!current" [title]="current?'Replace drawing':'Upload drawing'">
 @if(current){<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7h-9M17 4l3 3-3 3M4 17h9M7 14l-3 3 3 3"/></svg>}
 @else{ {{busy?'Uploading…':'Upload drawing'}} }
 <input type="file" [attr.aria-label]="(current?'Replace drawing for ':'Upload drawing for ')+(productId?'product':box?.package_name||'box')" [disabled]="busy||loading||!!loadError" (change)="upload($event)">
 </label>
 </div>
 @if(current){<small>{{sizeLabel(current.size_bytes)}}</small>}
 @if(busy&&current){<small role="status">Uploading replacement…</small>}
 @if(stale){<small>Box changed. Upload a matching drawing.</small>}
 @if(!current){<small>Up to 20 MB</small>}
 }
 @if(error){<div class="upload-error" role="alert"><strong>Drawing error</strong><div>{{error}}</div></div>}
 @if(success){<small role="status">{{success}}</small>}
 @if(loadError){<button (click)="load()" [disabled]="loading">Retry</button>}
 </div>`,styles:[`
 :host{display:block;min-width:150px;max-width:360px}.drawing{display:flex;flex-direction:column;align-items:flex-start;gap:5px}.file-row{display:flex;align-items:center;gap:8px;max-width:100%}.file-row .download{min-width:0}.upload.replace{display:flex;align-items:center;justify-content:center;width:34px;height:34px;box-sizing:border-box;padding:0;flex-shrink:0}.replace:hover{background:var(--wc-border)}
 small{font-size:.8rem;color:var(--wc-muted)}[role=alert]{color:var(--p-red-600,#b91c1c)}
 .upload-error{border:1px solid var(--p-red-300,#fca5a5);background:var(--p-red-50,#fef2f2);padding:10px;border-radius:6px;font-size:.875rem;overflow-wrap:anywhere}
 .download{max-width:100%;overflow-wrap:anywhere;text-align:left}
 .upload{position:relative;display:inline-block;border:1px solid var(--wc-border);border-radius:var(--wc-radius,6px);padding:7px 10px;font-size:.875rem;cursor:pointer;background:var(--wc-surface)}
 .upload:focus-within{outline:2px solid var(--wc-primary)}input{position:absolute;inset:0;width:100%;opacity:0;cursor:pointer}
 `]})
export class BoxDrawingComponent implements OnChanges {
 @Input() signature='';@Input() index=0;@Input() box:any;@Input() sharedSize='';
 @Input() productId='';@Input() variantKey='';
 record:any=null;busy=false;loading=false;error='';success='';loadError=false;private generation=0;
 constructor(private db:SupabaseService,@Optional() private cdr?:ChangeDetectorRef){}
 get current(){return this.record&&(this.productId||this.sharedSize||sameDrawingBox(this.record.box_snapshot,this.box))?this.record:null;}
 get stale(){return !!this.record&&!this.current;}
 sizeLabel(bytes:number){return bytes>=1048576?`${(bytes/1048576).toFixed(1)} MB`:`${Math.ceil(bytes/1024)} KB`;}
 ngOnChanges(){void this.load();}
 async load(){const generation=++this.generation;this.loading=true;this.error='';this.success='';this.loadError=false;this.record=null;
  try{const query=this.productId?this.db.client.from('wc_product_drawings').select('*').eq('product_id',this.productId).eq('variant_key',this.variantKey):this.sharedSize?this.db.client.from('wc_backdrop_box_drawings').select('*').eq('size_key',this.sharedSize):this.db.client.from('wc_box_drawings').select('*').eq('profile_signature',this.signature).eq('box_index',this.index);
   const {data,error}=await query.maybeSingle();if(error)throw error;if(generation===this.generation)this.record=data;}
  catch{if(generation===this.generation){this.loadError=true;this.error='Could not load drawing. Please retry.';}}
  finally{if(generation===this.generation){this.loading=false;this.cdr?.markForCheck();}}
 }
 async upload(event:Event){const input=event.target as HTMLInputElement;const file=input.files?.[0];input.value='';if(!file||this.busy||this.loading||this.loadError)return;
  this.success='';
  if(!file.size){this.error=`${file.name}: the file is empty or unavailable locally. Download it to this computer and try again.`;return;}
  if(file.size>20971520){this.error=`${file.name} (${this.sizeLabel(file.size)}) exceeds the 20 MB limit. Choose a smaller file.`;return;}
  if(file.name.length>255){this.error='Filename exceeds 255 characters. Rename the file and try again.';return;}
  const generation=this.generation,signature=this.signature,index=this.index,box=structuredClone(this.box),previous=this.record,sharedSize=this.sharedSize,productId=this.productId,variantKey=this.variantKey;
  this.busy=true;this.error='';let path='';let uploaded=false;let attaching=false;
  try{
   const {data,error:authError}=await this.db.client.auth.getUser();if(authError||!data.user)throw new Error('Please sign in again.');
   path=`${data.user.id}/${crypto.randomUUID()}`;
   const binary=new File([file],file.name,{type:'application/octet-stream'});
   const {error:uploadError}=await this.db.client.storage.from('box-drawings').upload(path,binary,{contentType:'application/octet-stream',upsert:false});if(uploadError)throw uploadError;uploaded=true;
   attaching=true;
   const {data:drawing,error:saveError}=productId
    ?await this.db.client.rpc('wc_save_product_drawing',{p_product:productId,p_variant:variantKey,p_path:path,p_filename:file.name,p_bytes:file.size,p_expected:previous?.revision??null})
    :sharedSize
    ?await this.db.client.rpc('wc_save_backdrop_box_drawing',{p_size:sharedSize,p_path:path,p_filename:file.name,p_bytes:file.size,p_expected:previous?.revision??null})
    :await this.db.client.rpc('wc_attach_box_drawing',{p_signature:signature,p_index:index,p_box:box,p_path:path,p_filename:file.name,p_size:file.size,p_expected:previous?.revision??null});
   if(saveError)throw saveError;
   if(!drawing?.object_path||!drawing?.filename)throw new Error('The server did not confirm the saved drawing. Reopen this product to check before retrying.');
   if(generation===this.generation){this.record=drawing;this.success=`${file.name} uploaded and saved.`;}
   if(previous?.object_path)await this.db.client.storage.from('box-drawings').remove([previous.object_path]);
  }catch(e:any){if(generation===this.generation)this.error=`${file.name}: ${e?.message||'Upload failed.'} ${attaching?'Reopen this product to check whether the file was saved before retrying.':'Check the file and connection, then try again.'}`;
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
