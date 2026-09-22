import {Component, Input, OnChanges, SimpleChanges} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {SupabaseService} from '../../core/services/supabase.service';
import {ShopPart, ShopTemplate} from '../shop-floor/shop-floor.models';

interface CncSheet {
 id:string; product_id:string; sheet_number:number; name:string; parts:ShopPart[]; comment:string;
 object_path:string|null; filename:string|null; size_bytes:number|null; revision:string;
}

@Component({selector:'app-product-cnc',standalone:true,imports:[FormsModule],template:`
 <section class="cnc">
  <div class="heading"><div><h3>CNC · cutting sheets</h3><p>Each row is one physical sheet of material. Attach the parts to cut from it and its .tap file.</p></div><button (click)="add()" [disabled]="loading||busy||!productId">Add sheet</button></div>
  @if(loading){<p role="status">Loading cutting sheets…</p>}
  @if(busy){<p role="status">{{activity==='upload'?'Uploading and saving CNC file…':'Saving cutting sheet…'}}</p>}
  @if(error){<p class="error" role="alert">{{error}} @if(loadError){<button (click)="load()" [disabled]="loading||busy">Retry load</button>}</p>}
  @if(success){<p role="status">{{success}}</p>}
  @if(!loading){<div class="table-wrap"><table><thead><tr><th>Sheet no.</th><th>Name</th><th>Parts from Assembling</th><th>CNC file</th><th>Comment</th><th></th></tr></thead><tbody>
   @for(row of sheets;track $index){<tr>
    <td><input type="number" min="1" step="1" aria-label="Cutting sheet number" [(ngModel)]="row.sheet_number" [disabled]="busy"></td>
    <td><input aria-label="Cutting sheet name" maxlength="150" [(ngModel)]="row.name" [disabled]="busy" placeholder="Enter name"></td>
    <td><div class="parts">@for(part of row.parts;track part.id){<span>{{part.name}} <button type="button" [attr.aria-label]="'Remove '+part.name" (click)="removePart(row,part.id)" [disabled]="busy">×</button></span>}</div>
      <select aria-label="Add Assembling part" #partSelect (change)="addPart(row,partSelect.value);partSelect.value=''" [disabled]="busy"><option value="">Add part…</option>@for(part of availableParts(row);track part.id){<option [value]="part.id">{{part.name}}</option>}</select>
    </td>
    <td>@if(row.filename){<button class="filename" (click)="download(row)" [disabled]="busy">{{row.filename}}</button><small>{{fileSize(row.size_bytes||0)}}</small>}
      @if(row.id){<label class="upload">{{busy===row.id&&activity==='upload'?'Uploading…':row.filename?'Replace .tap':'Upload .tap'}}<input type="file" accept=".tap" [disabled]="busy" (change)="upload(row,$event)"></label>}
      @else{<small>Save the sheet first</small>}
    </td>
    <td><textarea aria-label="Cutting sheet comment" maxlength="4000" rows="2" [(ngModel)]="row.comment" [disabled]="busy" placeholder="Comment"></textarea></td>
    <td><button (click)="save(row)" [disabled]="busy">{{busy===row.id?'Saving…':'Save'}}</button></td>
   </tr>}@empty{<tr><td colspan="6">No cutting sheets yet.</td></tr>}
  </tbody></table></div>}
 </section>`,styles:[`
 :host{display:block}.cnc{min-width:0}.heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}.heading h3{margin:0 0 4px}.heading p{margin:0;color:var(--wc-muted);font-size:.875rem}.table-wrap{overflow:auto;border:1px solid var(--wc-border);border-radius:12px;background:var(--wc-surface)}table{width:100%;min-width:780px;border-collapse:collapse}th,td{padding:9px;text-align:left;vertical-align:top;border-bottom:1px solid var(--wc-border)}th{white-space:nowrap}tr:last-child td{border-bottom:0}input[type=number]{width:75px}input:not([type=file]),select,textarea{box-sizing:border-box;max-width:100%}td:nth-child(2) input{width:145px}td:nth-child(3){min-width:170px}td:nth-child(4){min-width:140px}textarea{width:180px;resize:vertical}.parts{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:5px}.parts span{background:var(--wc-ground);border-radius:5px;padding:3px 5px}.parts button{padding:0 3px;border:0;background:transparent}.upload{display:block;position:relative;overflow:hidden;border:1px solid var(--wc-border);border-radius:6px;padding:5px 8px;cursor:pointer;width:max-content;max-width:100%;margin-top:5px}.upload input{position:absolute;inset:0;opacity:0;width:100%;cursor:pointer}.filename{display:block;max-width:180px;overflow-wrap:anywhere;text-align:left}.error{color:#991b1b;background:#fff1f1;border:1px solid #fecaca;padding:9px;border-radius:6px}small{display:block;color:var(--wc-muted)}
 `]})
export class ProductCncComponent implements OnChanges {
 @Input() productId=''; @Input() parts:ShopPart[]|null=null;
 sheets:CncSheet[]=[]; catalogParts:ShopPart[]=[]; loading=false; loadError=false; busy=''; activity:''|'save'|'upload'=''; error=''; success=''; private generation=0;private loadedProductId='';
 constructor(private db:SupabaseService){}
 ngOnChanges(changes:SimpleChanges){if(changes['productId'])void this.load();}
 async load(){const generation=++this.generation;this.loading=true;this.loadError=false;this.error='';this.success='';if(this.loadedProductId!==this.productId){this.sheets=[];this.catalogParts=[];this.loadedProductId=this.productId;}
  if(!this.productId){this.sheets=[];this.loading=false;return;}
  try{const [sheets,templates]=await Promise.all([
   this.db.client.from('wc_product_cnc_sheets').select('*').eq('product_id',this.productId).order('sheet_number'),
   this.parts===null?this.db.client.from('wc_shop_templates').select('parts').eq('product_id',this.productId):Promise.resolve({data:[],error:null})
  ]);
   if(sheets.error||templates.error)throw sheets.error||templates.error;
   if(generation===this.generation){this.sheets=(sheets.data||[]) as CncSheet[];this.catalogParts=[...new Map((templates.data||[]).flatMap((t:{parts:ShopPart[]})=>t.parts||[]).map((p:ShopPart)=>[p.id,p])).values()];}
  }
  catch(e){if(generation===this.generation){this.loadError=true;this.error=`Could not load cutting sheets. ${this.message(e)} Retry.`;}}
  finally{if(generation===this.generation)this.loading=false;}
 }
 add(){this.error='';this.success='';this.sheets=[...this.sheets,{id:'',product_id:this.productId,sheet_number:Math.max(0,...this.sheets.map(s=>Number(s.sheet_number)||0))+1,name:'',parts:[],comment:'',object_path:null,filename:null,size_bytes:null,revision:''}];}
 availableParts(row:CncSheet){return (this.parts??this.catalogParts).filter(p=>!row.parts.some(x=>x.id===p.id));}
 addPart(row:CncSheet,id:string){const part=(this.parts??this.catalogParts).find(p=>p.id===id);if(part)row.parts=[...row.parts,{id:part.id,name:part.name}];}
 removePart(row:CncSheet,id:string){row.parts=row.parts.filter(p=>p.id!==id);}
 async save(row:CncSheet){this.error='';this.loadError=false;this.success='';if(!Number.isSafeInteger(Number(row.sheet_number))||Number(row.sheet_number)<1){this.error='Enter a positive whole sheet number, then retry.';return;}
  this.busy=row.id||'new';this.activity='save';try{const {data,error}=await this.db.client.rpc('wc_save_product_cnc_sheet',{p_id:row.id||null,p_product:this.productId,p_number:Number(row.sheet_number),p_name:row.name,p_parts:row.parts,p_comment:row.comment,p_expected:row.revision||null});if(error)throw error;
   if(!data?.id)throw Error('Server did not confirm the saved sheet');Object.assign(row,data);this.success=`Sheet ${row.sheet_number} saved.`;
  }catch(e){this.error=`Could not save sheet ${row.sheet_number}. ${this.message(e)} Check the details and retry.`;}finally{this.busy='';this.activity='';}
 }
 async upload(row:CncSheet,event:Event){const input=event.target as HTMLInputElement,file=input.files?.[0];input.value='';if(!file||this.busy)return;this.error='';this.loadError=false;this.success='';
  if(!/\.tap$/i.test(file.name)){this.error=`${file.name}: choose a .tap CNC file.`;return;}
  if(!file.size||file.size>20971520){this.error=`${file.name} (${this.fileSize(file.size)}) cannot be uploaded. File must be non-empty and at most 20 MB. Choose another file.`;return;}
  if(file.name.length>255){this.error=`${file.name}: filename is over 255 characters. Rename it and retry.`;return;}
  const generation=this.generation,previous=row.object_path;this.busy=row.id;this.activity='upload';let path='',uploaded=false,attaching=false;
  try{const {data,error:authError}=await this.db.client.auth.getUser();if(authError||!data.user)throw Error('Sign in again');
   path=`${data.user.id}/${crypto.randomUUID()}`;
   const binary=new File([file],file.name,{type:'application/octet-stream'});
   const {error:uploadError}=await this.db.client.storage.from('cnc-files').upload(path,binary,{contentType:'application/octet-stream',upsert:false});if(uploadError)throw uploadError;uploaded=true;
   attaching=true;const {data:saved,error:saveError}=await this.db.client.rpc('wc_attach_product_cnc_file',{p_id:row.id,p_path:path,p_filename:file.name,p_size:file.size,p_expected:row.revision});if(saveError)throw saveError;
   if(!saved?.object_path)throw Error('Server did not confirm the file attachment');
   if(generation===this.generation){row.object_path=saved.object_path;row.filename=saved.filename;row.size_bytes=saved.size_bytes;row.revision=saved.revision;this.success=`${file.name} uploaded and saved for sheet ${row.sheet_number}.`;}
   if(previous)await this.db.client.storage.from('cnc-files').remove([previous]);
  }catch(e){if(generation===this.generation)this.error=`${file.name}: ${this.message(e)} ${attaching?'Reload the sheet to check whether it was saved, then retry.':'Check the file and connection, then retry.'}`;
   if(uploaded&&!attaching)await this.db.client.storage.from('cnc-files').remove([path]);
  }finally{this.busy='';this.activity='';}
 }
 async download(row:CncSheet){if(!row.object_path)return;this.error='';try{const {data,error}=await this.db.client.storage.from('cnc-files').createSignedUrl(row.object_path,60,{download:row.filename||'cutting.tap'});if(error||!data)throw error||Error('File unavailable');const link=document.createElement('a');link.href=data.signedUrl;link.download=row.filename||'cutting.tap';link.rel='noopener';link.click();}catch(e){this.error=`Could not download ${row.filename}. ${this.message(e)} Retry.`;}}
 fileSize(bytes:number){return bytes>=1048576?`${(bytes/1048576).toFixed(1)} MB`:`${Math.ceil(bytes/1024)} KB`;}
 private message(e:unknown){return e instanceof Error?e.message:(e as {message?:string})?.message||'Connection or server error.';}
}
