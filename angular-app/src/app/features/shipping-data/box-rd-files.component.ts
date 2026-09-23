import {ChangeDetectorRef,Component,Input,OnChanges,Optional} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {SupabaseService} from '../../core/services/supabase.service';
import {HubMembersService} from '../../core/services/hub-members.service';

export interface BoxRdFile {
 id:string;profile_signature:string;box_index:number;object_path:string;filename:string;
 size_bytes:number;copies:number;revision:string;
}

@Component({selector:'app-box-rd-files',standalone:true,imports:[FormsModule],template:`
 <div class="rd-files">
  <strong>Laser cutting · RD files</strong>
  @if(loading){<span role="status">Loading RD files…</span>}
  @if(busy){<span role="status">{{busy==='upload'?'Uploading and saving RD file…':'Saving RD files…'}}</span>}
  @if(error){<p class="error" role="alert">{{error}} @if(loadError){<button type="button" (click)="load()">Retry load</button>}</p>}
  @if(success){<p role="status">{{success}}</p>}
  @for(file of files;track file.id){<div class="file-row">
   <button type="button" class="filename" [disabled]="!!busy" (click)="download(file)" [title]="file.filename">{{file.filename}}</button>
   @if(members.manager()){
    <label>Copies <input type="number" min="1" max="1000" step="1" [(ngModel)]="file.copies" [disabled]="!!busy" [attr.aria-label]="'Copies for '+file.filename"></label>
    <button type="button" class="icon" title="Save copies" [attr.aria-label]="'Save copies for '+file.filename" [disabled]="!!busy" (click)="saveCopies(file)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3h13l3 3v15H4zM7 3v6h10V3M7 21v-8h10v8"/></svg></button>
    <label class="icon replace" [title]="'Replace '+file.filename"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 1-2.35-5.66M20 4v7h-7"/></svg><input type="file" accept=".rd" [attr.aria-label]="'Replace '+file.filename" [disabled]="!!busy" (change)="upload($event,file)"></label>
    <button type="button" class="icon remove" [title]="'Remove '+file.filename" [attr.aria-label]="'Remove '+file.filename" [disabled]="!!busy" (click)="remove(file)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V4h6v3M8 7l1 13h6l1-13"/></svg></button>
   }@else{<span>{{file.copies}} ×</span>}
  </div>}@empty{<small>No RD files for this box.</small>}
  @if(members.manager()){
  <div class="new-file"><label class="upload icon" title="Add RD file" aria-label="Add RD file"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><input type="file" accept=".rd" aria-label="Add RD file" [disabled]="!!busy||loading||loadError" (change)="upload($event)"></label><label>Copies <input type="number" min="1" max="1000" step="1" [(ngModel)]="newCopies" [disabled]="!!busy" aria-label="Copies for new RD file"></label></div>
  }
 </div>`,styles:[`
 :host{display:block;min-width:0}.rd-files{display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding-top:8px}.rd-files strong{font-size:.82rem}
 .file-row,.new-file{display:flex;align-items:center;flex-wrap:wrap;gap:5px;max-width:100%;font-size:.8rem}.filename{max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:none;border:0;text-decoration:underline;text-align:left;cursor:pointer;padding:3px}
 input[type=number]{width:54px;padding:4px;border:1px solid var(--wc-border);border-radius:6px}.icon{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;box-sizing:border-box;border:1px solid var(--wc-border);border-radius:6px;background:var(--wc-surface);cursor:pointer;padding:0}.icon svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.replace,.upload{position:relative;overflow:hidden}.replace input,.upload input{position:absolute;inset:0;opacity:0;width:100%;cursor:pointer}.replace:focus-within,.upload:focus-within{outline:2px solid currentColor;outline-offset:2px}.remove{color:#991b1b}.error{color:#991b1b;background:#fff1f1;border:1px solid #fecaca;padding:8px;border-radius:6px;margin:0}small{color:var(--wc-muted)}[disabled]{opacity:.55;cursor:default}
 `]})
export class BoxRdFilesComponent implements OnChanges {
 @Input() signature='';@Input() index=0;
 files:BoxRdFile[]=[];newCopies=1;loading=false;loadError=false;busy:''|'upload'|'save'='';error='';success='';private generation=0;
 constructor(private db:SupabaseService,readonly members:HubMembersService,@Optional() private cdr?:ChangeDetectorRef){}
 ngOnChanges(){void this.load();}
 private refresh(){this.cdr?.markForCheck();}
 private message(e:unknown){return e instanceof Error?e.message:(e as {message?:string})?.message||'Connection or server error.';}
 private copies(value:number){return Number.isSafeInteger(Number(value))&&Number(value)>=1&&Number(value)<=1000;}
 async load(){const generation=++this.generation;this.loading=true;this.loadError=false;this.error='';this.success='';this.files=[];
  try{const {data,error}=await this.db.client.from('wc_box_rd_files').select('*').eq('profile_signature',this.signature).eq('box_index',this.index).order('created_at');if(error)throw error;if(generation===this.generation)this.files=(data||[]) as BoxRdFile[];}
  catch(e){if(generation===this.generation){this.loadError=true;this.error=`Could not load RD files. ${this.message(e)} Retry load.`;}}
  finally{if(generation===this.generation){this.loading=false;this.refresh();}}
 }
 async upload(event:Event,replacing?:BoxRdFile){const input=event.target as HTMLInputElement,file=input.files?.[0];input.value='';if(!file||this.busy)return;this.error='';this.success='';
  const copies=replacing?Number(replacing.copies):Number(this.newCopies);
  if(!this.copies(copies)){this.error='Enter a whole copy count from 1 to 1000, then choose the RD file again.';return;}
  if(!/\.rd$/i.test(file.name)){this.error=`${file.name}: choose an .rd laser cutting file.`;return;}
  if(!file.size||file.size>20971520){this.error=`${file.name} (${this.size(file.size)}) cannot be uploaded. File must be non-empty and at most 20 MB.`;return;}
  if(file.name.length>255){this.error=`${file.name}: filename is over 255 characters. Rename it and retry.`;return;}
  const generation=this.generation,previous=replacing?.object_path;this.busy='upload';let path='',uploaded=false,attaching=false;
  try{const {data,error:authError}=await this.db.client.auth.getUser();if(authError||!data.user)throw Error('Sign in again.');
   path=`${data.user.id}/${crypto.randomUUID()}`;const bucket=this.db.client.storage.from('box-rd-files');
   const {error:uploadError}=await bucket.upload(path,file,{contentType:'application/octet-stream',upsert:false});if(uploadError)throw uploadError;uploaded=true;
   attaching=true;const {data:saved,error:saveError}=await this.db.client.rpc('wc_save_box_rd_file',{p_id:replacing?.id||null,p_signature:this.signature,p_index:this.index,p_path:path,p_filename:file.name,p_bytes:file.size,p_copies:copies,p_expected:replacing?.revision||null});if(saveError)throw saveError;
   if(!saved?.id)throw Error('Server did not confirm the saved file.');
   if(generation===this.generation){this.files=replacing?this.files.map(row=>row.id===saved.id?saved:row):[...this.files,saved];this.success=`${file.name} uploaded and saved with ${copies} ${copies===1?'copy':'copies'}.`;this.newCopies=1;}
   if(previous)await bucket.remove([previous]);
  }catch(e){if(generation===this.generation)this.error=`${file.name}: ${this.message(e)} ${attaching?'Reload this box to check whether it was saved, then retry.':'Check the file and connection, then retry.'}`;
   if(uploaded&&!attaching)await this.db.client.storage.from('box-rd-files').remove([path]);
  }finally{this.busy='';this.refresh();}
 }
 async saveCopies(file:BoxRdFile){if(this.busy)return;this.error='';this.success='';if(!this.copies(file.copies)){this.error=`${file.filename}: enter a whole copy count from 1 to 1000.`;return;}
  this.busy='save';try{const {data,error}=await this.db.client.rpc('wc_save_box_rd_file',{p_id:file.id,p_signature:this.signature,p_index:this.index,p_path:null,p_filename:null,p_bytes:null,p_copies:Number(file.copies),p_expected:file.revision});if(error||!data?.revision)throw error||Error('Server did not confirm the copy count.');file.revision=data.revision;this.success=`${file.filename}: copy count saved.`;}
  catch(e){this.error=`Could not save copies for ${file.filename}. ${this.message(e)} Retry.`;}finally{this.busy='';this.refresh();}
 }
 async remove(file:BoxRdFile){if(this.busy)return;this.error='';this.success='';this.busy='save';try{const {data,error}=await this.db.client.rpc('wc_delete_box_rd_file',{p_id:file.id,p_expected:file.revision});if(error||!data)throw error||Error('Server did not confirm removal.');this.files=this.files.filter(row=>row.id!==file.id);this.success=`${file.filename} removed.`;await this.db.client.storage.from('box-rd-files').remove([data]);}
  catch(e){this.error=`Could not remove ${file.filename}. ${this.message(e)} Reload and retry.`;}finally{this.busy='';this.refresh();}
 }
 async download(file:BoxRdFile){this.error='';try{const {data,error}=await this.db.client.storage.from('box-rd-files').createSignedUrl(file.object_path,60,{download:file.filename});if(error||!data)throw error||Error('File unavailable.');const link=document.createElement('a');link.href=data.signedUrl;link.download=file.filename;link.rel='noopener';link.click();}
  catch(e){this.error=`Could not download ${file.filename}. ${this.message(e)} Retry.`;}finally{this.refresh();}}
 private size(bytes:number){return bytes>=1048576?`${(bytes/1048576).toFixed(1)} MB`:`${Math.ceil(bytes/1024)} KB`;}
}
