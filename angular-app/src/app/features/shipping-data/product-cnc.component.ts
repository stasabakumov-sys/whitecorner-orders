import {ChangeDetectorRef, Component, Input, OnChanges, Optional, SimpleChanges} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {SupabaseService} from '../../core/services/supabase.service';
import {ShopPart} from '../shop-floor/shop-floor.models';

interface CncSheet {
 id:string; product_id:string; sheet_number:number; name:string; material_id:string|null; parts:ShopPart[]; comment:string;
 object_path:string|null; filename:string|null; size_bytes:number|null; revision:string;
}

@Component({selector:'app-product-cnc',standalone:true,imports:[FormsModule],template:`
 <section class="cnc">
  <div class="heading"><div><h3>CNC · cutting sheets</h3><p>Each row is one physical sheet of material. Attach the parts to cut from it and its .crv3d file.</p></div><button (click)="add()" [disabled]="loading||busy||!productId">Add sheet</button></div>
  @if(loading){<p role="status">Loading cutting sheets…</p>}
  @if(materialsLoading){<p role="status">Loading materials…</p>}
  @if(partsLoading){<p role="status">Loading Assembling parts…</p>}
  @if(busy){<p role="status">{{activity==='upload'?'Uploading and saving CNC file…':'Saving cutting sheet…'}}</p>}
  @if(error){<p class="error" role="alert">{{error}} @if(loadError){<button (click)="load()" [disabled]="loading||busy">Retry load</button>}</p>}
  @if(success){<p role="status">{{success}}</p>}
  @if(!loading){<div class="table-wrap"><table><thead><tr><th>No</th><th>Name</th><th>Material</th><th>Parts from Assembling</th><th>CNC file</th><th>Comment</th><th></th></tr></thead><tbody>
   @for(row of sheets;track $index){<tr>
    <td><input type="number" min="1" step="1" aria-label="Cutting sheet number" [(ngModel)]="row.sheet_number"></td>
    <td><input aria-label="Cutting sheet name" maxlength="150" [(ngModel)]="row.name" placeholder="Enter name"></td>
    <td><select aria-label="Cutting sheet material" [(ngModel)]="row.material_id" [disabled]="materialsLoading"><option [ngValue]="null">{{materialsLoading?'Loading materials…':'Choose material'}}</option>@for(material of materialOptions(row);track material.id){<option [ngValue]="material.id">{{material.name}} · {{material.unit}}{{material.active?'':' (archived)'}}</option>}</select></td>
    <td><div class="parts">@for(part of row.parts;track part.id){<span>{{part.name}} <button type="button" [attr.aria-label]="'Remove '+part.name" (click)="removePart(row,part.id)">×</button></span>}</div>
      <select aria-label="Add Assembling part" #partSelect (change)="addPart(row,partSelect.value);partSelect.value=''" [disabled]="parts===null&&partsLoading"><option value="">{{parts===null&&partsLoading?'Loading parts…':'Add part…'}}</option>@for(part of availableParts(row);track part.id){<option [value]="part.id">{{part.name}}</option>}</select>
    </td>
    <td>@if(row.filename){<div class="file-line"><button type="button" class="filename" (click)="download(row)" [disabled]="busy">{{row.filename}}</button>
      @if(row.id){<label class="icon-control replace-icon" title="Replace CNC file"><i class="pi pi-refresh" [class.pi-spin]="busy===row.id&&activity==='upload'" aria-hidden="true"></i><input type="file" accept=".crv3d" aria-label="Replace CNC file" [disabled]="busy" (change)="upload(row,$event)"></label>}</div><small>{{fileSize(row.size_bytes||0)}}</small>}
      @else if(row.id){<label class="upload">{{busy===row.id&&activity==='upload'?'Uploading…':'Upload .crv3d'}}<input type="file" accept=".crv3d" aria-label="Upload CNC file" [disabled]="busy" (change)="upload(row,$event)"></label>}
      @else{<small>Save the sheet first</small>}
    </td>
    <td><textarea aria-label="Cutting sheet comment" maxlength="4000" rows="2" [(ngModel)]="row.comment" placeholder="Comment"></textarea></td>
    <td><button type="button" class="icon-control save-icon" (click)="save(row)" [disabled]="busy" [attr.aria-label]="busy===row.id?'Saving cutting sheet':'Save cutting sheet'" [attr.title]="busy===row.id?'Saving cutting sheet':'Save cutting sheet'"><i class="pi pi-save" aria-hidden="true"></i></button></td>
   </tr>}@empty{<tr><td colspan="7">No cutting sheets yet.</td></tr>}
  </tbody></table></div>}
 </section>`,styles:[`
 :host{display:block;min-width:0;container-type:inline-size}
 .cnc{min-width:0}.heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}.heading h3{margin:0 0 4px}.heading p{margin:0;color:var(--wc-muted);font-size:.875rem}
 .table-wrap{border:1px solid var(--wc-border);border-radius:12px;background:var(--wc-surface)}table{width:100%;table-layout:fixed;border-collapse:collapse;font-size:.875rem}
 th,td{padding:5px 4px;text-align:left;vertical-align:top;border-bottom:1px solid var(--wc-border);min-width:0;overflow-wrap:anywhere}th{line-height:1.2}tr:last-child td{border-bottom:0}
 th:nth-child(1){width:7%}th:nth-child(2){width:16%}th:nth-child(3){width:19%}th:nth-child(4){width:18%}th:nth-child(5){width:17%}th:nth-child(6){width:17%}th:nth-child(7){width:6%}
 td input:not([type=file]),td select,td textarea{box-sizing:border-box;width:100%;min-width:0;max-width:100%;padding:4px 6px;font-size:inherit;border:1px solid var(--wc-border);border-radius:6px;background:var(--wc-surface);color:inherit;box-shadow:none}
 td input:not([type=file]),td select{height:30px}td textarea{min-height:42px;resize:vertical}td:last-child{text-align:center}
 .parts{display:flex;flex-wrap:wrap;gap:3px;margin-bottom:3px}.parts span{background:var(--wc-ground);border-radius:5px;padding:2px 4px;overflow-wrap:anywhere}.parts button{padding:0 2px;border:0;background:transparent}
 .upload{display:inline-block;position:relative;overflow:hidden;border:1px solid var(--wc-border);border-radius:6px;padding:5px 7px;cursor:pointer;max-width:100%;text-align:center;white-space:nowrap}
 .upload input,.replace-icon input{position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer}.upload:focus-within,.replace-icon:focus-within{outline:2px solid currentColor;outline-offset:2px}
 .file-line{display:flex;align-items:flex-start;gap:4px;min-width:0}.filename{flex:0 1 auto;min-width:0;max-width:calc(100% - 32px);padding:0;border:0;background:transparent;color:inherit;font-weight:600;overflow-wrap:anywhere;text-align:left;text-decoration:underline;cursor:pointer}
 .icon-control{display:inline-grid;place-items:center;flex:none;width:28px;height:28px;padding:0;border:1px solid var(--wc-border);border-radius:6px;background:var(--wc-surface);color:inherit;cursor:pointer;font-size:13px}.icon-control:hover,.upload:hover{background:var(--wc-ground)}.icon-control:disabled{opacity:.5;cursor:default}.replace-icon{position:relative;overflow:hidden}.replace-icon:has(input:disabled){opacity:.5;cursor:default}
 .error{color:#991b1b;background:#fff1f1;border:1px solid #fecaca;padding:9px;border-radius:6px}small{display:block;margin-top:2px;color:var(--wc-muted);font-size:.75rem}
 @container (max-width:760px){table,tbody{display:block}thead{display:none}tr{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:6px;padding:8px}tr+tr{border-top:1px solid var(--wc-border)}td{display:block;width:100%;padding:0;border:0}td:nth-child(3),td:nth-child(4),td:nth-child(6),td[colspan]{grid-column:1/-1}td:not(:last-child)::before{display:block;margin-bottom:3px;color:var(--wc-muted);font-size:.8rem;font-weight:600}td:nth-child(1)::before{content:'No'}td:nth-child(2)::before{content:'Name'}td:nth-child(3)::before{content:'Material'}td:nth-child(4)::before{content:'Parts from Assembling'}td:nth-child(5)::before{content:'CNC file'}td:nth-child(6)::before{content:'Comment'}td textarea{min-height:44px}td:last-child{align-self:end}}
 `]})
export class ProductCncComponent implements OnChanges {
 @Input() productId=''; @Input() parts:ShopPart[]|null=null;
 sheets:CncSheet[]=[]; catalogParts:ShopPart[]=[]; materials:{id:string;name:string;unit:string;active:boolean}[]=[]; loading=false; materialsLoading=false; partsLoading=false; loadError=false; busy=''; activity:''|'save'|'upload'=''; error=''; success=''; private generation=0;private loadedProductId='';
 constructor(private db:SupabaseService,@Optional() private cdr?:ChangeDetectorRef){}
 private refresh(){this.cdr?.markForCheck();}
 ngOnChanges(changes:SimpleChanges){if(changes['productId'])void this.load();}
 async load(){const generation=++this.generation;this.loading=true;this.materialsLoading=true;this.partsLoading=this.parts===null;this.loadError=false;this.error='';this.success='';if(this.loadedProductId!==this.productId){this.sheets=[];this.catalogParts=[];this.materials=[];this.loadedProductId=this.productId;}
  if(!this.productId){this.sheets=[];this.loading=false;this.materialsLoading=false;this.partsLoading=false;this.refresh();return;}
  const materialLoad=this.loadMaterials().then(data=>{if(generation===this.generation)this.materials=data;})
   .catch(e=>{if(generation===this.generation){this.error+=` Could not load materials. ${this.message(e)} Retry load.`;this.loadError=true;}})
   .finally(()=>{if(generation===this.generation){this.materialsLoading=false;this.refresh();}});
  const templates=this.parts===null?this.db.client.from('wc_shop_templates').select('parts').eq('product_id',this.productId):Promise.resolve({data:[],error:null});
  const templateLoad=Promise.resolve(templates).then(({data,error})=>{if(error)throw error;if(generation===this.generation)this.catalogParts=[...new Map((data||[]).flatMap((t:{parts:ShopPart[]})=>t.parts||[]).map((p:ShopPart)=>[p.id,p])).values()];})
   .catch(e=>{if(generation===this.generation&&this.parts===null){this.error+=` Could not load Assembling parts. ${this.message(e)} Retry load.`;this.loadError=true;}})
   .finally(()=>{if(generation===this.generation){this.partsLoading=false;this.refresh();}});
  try{const sheets=await this.db.client.from('wc_product_cnc_sheets').select('*').eq('product_id',this.productId).order('sheet_number');
   if(sheets.error)throw sheets.error;
   if(generation===this.generation)this.sheets=(sheets.data||[]) as CncSheet[];
  }catch(e){if(generation===this.generation){this.loadError=true;this.error=`Could not load cutting sheets. ${this.message(e)} Retry.`;}}
  finally{if(generation===this.generation){this.loading=false;this.refresh();}}
  await Promise.all([materialLoad,templateLoad]);
 }
 private async loadMaterials(){const all:{id:string;name:string;unit:string;active:boolean}[]=[];for(let start=0;;start+=250){const {data,error}=await this.db.client.from('wc_materials').select('id,name,unit,active').order('name').order('id').range(start,start+249);if(error)throw error;all.push(...(data||[]));if((data||[]).length<250)return all;}}
 materialOptions(row:CncSheet){return this.materials.filter(m=>m.active||m.id===row.material_id);}
 add(){this.error='';this.success='';this.sheets=[...this.sheets,{id:'',product_id:this.productId,sheet_number:Math.max(0,...this.sheets.map(s=>Number(s.sheet_number)||0))+1,name:'',material_id:null,parts:[],comment:'',object_path:null,filename:null,size_bytes:null,revision:''}];}
 availableParts(row:CncSheet){return (this.parts??this.catalogParts).filter(p=>!row.parts.some(x=>x.id===p.id));}
 addPart(row:CncSheet,id:string){const part=(this.parts??this.catalogParts).find(p=>p.id===id);if(part)row.parts=[...row.parts,{id:part.id,name:part.name}];}
 removePart(row:CncSheet,id:string){row.parts=row.parts.filter(p=>p.id!==id);}
 async save(row:CncSheet){if(this.busy)return;this.error='';this.loadError=false;this.success='';if(!Number.isSafeInteger(Number(row.sheet_number))||Number(row.sheet_number)<1){this.error='Enter a positive whole sheet number, then retry.';return;}
  if(!row.material_id||!this.materialOptions(row).some(m=>m.id===row.material_id)){this.error='Choose a material from the list, then retry.';return;}
  const draft={sheet_number:Number(row.sheet_number),name:row.name,material_id:row.material_id,parts:structuredClone(row.parts),comment:row.comment};
  this.busy=row.id||'new';this.activity='save';try{const {data,error}=await this.db.client.rpc('wc_save_product_cnc_sheet',{p_id:row.id||null,p_product:this.productId,p_number:draft.sheet_number,p_name:draft.name,p_material:draft.material_id,p_parts:draft.parts,p_comment:draft.comment,p_expected:row.revision||null});if(error)throw error;
   if(!data?.id)throw Error('Server did not confirm the saved sheet');row.id=data.id;row.revision=data.revision;
   if(row.sheet_number===draft.sheet_number)row.sheet_number=data.sheet_number;
   if(row.name===draft.name)row.name=data.name;
   if(row.material_id===draft.material_id)row.material_id=data.material_id;
   if(JSON.stringify(row.parts)===JSON.stringify(draft.parts))row.parts=data.parts;
   if(row.comment===draft.comment)row.comment=data.comment;
   this.success=`Sheet ${data.sheet_number} saved.${row.sheet_number!==data.sheet_number||row.name!==data.name||row.material_id!==data.material_id||JSON.stringify(row.parts)!==JSON.stringify(data.parts)||row.comment!==data.comment?' You have newer edits; save again.':''}`;
  }catch(e){this.error=`Could not save sheet ${row.sheet_number}. ${this.message(e)} Check the details and retry.`;}finally{this.busy='';this.activity='';this.refresh();}
 }
 async upload(row:CncSheet,event:Event){const input=event.target as HTMLInputElement,file=input.files?.[0];input.value='';if(!file||this.busy)return;this.error='';this.loadError=false;this.success='';
  if(!/\.crv3d$/i.test(file.name)){this.error=`${file.name}: choose a .crv3d CNC file.`;return;}
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
  }finally{this.busy='';this.activity='';this.refresh();}
 }
 async download(row:CncSheet){if(!row.object_path)return;this.error='';try{const {data,error}=await this.db.client.storage.from('cnc-files').createSignedUrl(row.object_path,60,{download:row.filename||'cutting.crv3d'});if(error||!data)throw error||Error('File unavailable');const link=document.createElement('a');link.href=data.signedUrl;link.download=row.filename||'cutting.crv3d';link.rel='noopener';link.click();}catch(e){this.error=`Could not download ${row.filename}. ${this.message(e)} Retry.`;}finally{this.refresh();}}
 fileSize(bytes:number){return bytes>=1048576?`${(bytes/1048576).toFixed(1)} MB`:`${Math.ceil(bytes/1024)} KB`;}
 private message(e:unknown){return e instanceof Error?e.message:(e as {message?:string})?.message||'Connection or server error.';}
}
