import {ChangeDetectorRef, Component, Input, OnChanges, Optional, SimpleChanges} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {SupabaseService} from '../../core/services/supabase.service';
import {ShopPart} from '../shop-floor/shop-floor.models';
import {Folding,foldingLabel} from '../costing/production-cost';

interface CncSheet {
 id:string; product_id:string; sheet_number:number; name:string; material_id:string|null; folding:Folding|null; parts:ShopPart[]; comment:string;
 object_path:string|null; filename:string|null; size_bytes:number|null; revision:string;
}

@Component({selector:'app-product-cnc',standalone:true,imports:[FormsModule],template:`
 <section class="cnc">
  <div class="heading"><div><h3>CNC · cutting sheets</h3><p>Each row is one physical sheet of material. Attach the parts to cut from it and its .crv3d file.</p></div><button (click)="add()" [disabled]="loading||busy||!productId||(backdrop&&requireOrderFolding&&!orderFolding)">Add sheet</button></div>
  @if(loading){<p role="status">Loading cutting sheets…</p>}
  @if(materialsLoading){<p role="status">Loading materials…</p>}
  @if(partsLoading){<p role="status">Loading Assembling parts…</p>}
  @if(busy){<p role="status">{{activity==='upload'?'Uploading and saving CNC file…':'Saving cutting sheet…'}}</p>}
  @if(error){<p class="error" role="alert">{{error}} @if(loadError){<button (click)="load()" [disabled]="loading||busy">Retry load</button>}</p>}
  @if(success){<p role="status">{{success}}</p>}
  @if(backdrop && !orderFolding){<nav class="folding-tabs" aria-label="Backdrop CNC folding option"><button type="button" [class.active]="activeFolding==='foldable'" [attr.aria-pressed]="activeFolding==='foldable'" (click)="activeFolding='foldable'">Foldable</button><button type="button" [class.active]="activeFolding==='nonfoldable'" [attr.aria-pressed]="activeFolding==='nonfoldable'" (click)="activeFolding='nonfoldable'">Non-foldable</button></nav>}
  @if(backdrop && orderFolding){<p class="variant-note">{{foldingLabel(orderFolding)}} CNC sheets for this order</p>}
  @if(backdrop && requireOrderFolding && !orderFolding){<p class="error" role="alert">This order has no clear Foldable option. Check its product options before using CNC sheets.</p>}
  @if(!loading && (!backdrop || !requireOrderFolding || orderFolding)){<div class="table-wrap"><table><thead><tr><th>No</th><th>Name</th><th>Material</th><th>Parts</th><th>CNC file</th><th>Comment</th><th></th></tr></thead><tbody>
   @for(row of visibleSheets();track row.id || $index){<tr>
    <td><input type="number" min="1" step="1" aria-label="Cutting sheet number" [(ngModel)]="row.sheet_number"></td>
    <td><input aria-label="Cutting sheet name" maxlength="150" [(ngModel)]="row.name" placeholder="Enter name"></td>
    <td><select aria-label="Cutting sheet material" [(ngModel)]="row.material_id" [disabled]="materialsLoading"><option [ngValue]="null">{{materialsLoading?'Loading materials…':'Choose material'}}</option>@for(material of materialOptions(row);track material.id){<option [ngValue]="material.id">{{material.name}} · {{material.unit}}{{material.active?'':' (archived)'}}</option>}</select></td>
    <td class="parts-cell" [title]="partsTitle(row)"><div class="part-summary">
      <input readonly aria-label="First selected part" [value]="row.parts[0]?.name||''" placeholder="No parts">
      <button type="button" class="icon-control" aria-label="Add part" title="Add part" (click)="openParts(row,'add')" [disabled]="parts===null&&partsLoading"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>
      @if(row.parts.length){<button type="button" class="icon-control" aria-label="Edit parts" title="Edit parts" (click)="openParts(row,'edit')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4"/></svg></button>}
     </div>
     @if(partsEditor===row){<div class="parts-editor" role="dialog" aria-label="Edit cutting sheet parts">
      @for(part of row.parts;track part.id){<div class="part-edit-row"><input maxlength="150" [value]="part.name" (input)="renamePart(part,$event)" [attr.aria-label]="'Part name '+($index+1)"><button type="button" class="icon-control remove-part" [attr.aria-label]="'Remove '+part.name" [attr.title]="'Remove '+part.name" (click)="removePart(row,part.id)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V4h6v3M8 7l1 13h6l1-13"/></svg></button></div>}
      <div class="part-add-row"><select aria-label="Part to add" [(ngModel)]="pendingPartId" [disabled]="parts===null&&partsLoading"><option value="">{{parts===null&&partsLoading?'Loading parts…':'Choose part'}}</option>@for(part of availableParts(row);track part.id){<option [value]="part.id">{{part.name}}</option>}</select><button type="button" class="icon-control" aria-label="Confirm add part" title="Add selected part" (click)="addSelectedPart(row)" [disabled]="!pendingPartId"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button><button type="button" class="icon-control" aria-label="Close parts editor" title="Close" (click)="closeParts()"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
     </div>}
    </td>
    <td>@if(row.filename){<div class="file-line"><button type="button" class="filename" (click)="download(row)" [disabled]="busy" [title]="row.filename + ' · ' + fileSize(row.size_bytes||0)">{{row.filename}}</button>
      @if(row.id){<label class="icon-control replace-icon" title="Replace CNC file"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 1-2.35-5.66M20 4v7h-7"/></svg><input type="file" accept=".crv3d" aria-label="Replace CNC file" [disabled]="busy" (change)="upload(row,$event)"></label>}</div>}
      @else if(row.id){<label class="upload">{{busy===row.id&&activity==='upload'?'Uploading…':'Upload .crv3d'}}<input type="file" accept=".crv3d" aria-label="Upload CNC file" [disabled]="busy" (change)="upload(row,$event)"></label>}
      @else{<small>Save the sheet first</small>}
    </td>
    <td><textarea aria-label="Cutting sheet comment" maxlength="4000" rows="1" wrap="off" [(ngModel)]="row.comment" [title]="row.comment" placeholder="Comment"></textarea></td>
    <td><button type="button" class="icon-control save-icon" (click)="save(row)" [disabled]="busy" [attr.aria-label]="busy===row.id?'Saving cutting sheet':'Save cutting sheet'" [attr.title]="busy===row.id?'Saving cutting sheet':'Save cutting sheet'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3h13l3 3v15H4zM7 3v6h10V3M7 21v-8h10v8"/></svg></button></td>
   </tr>}@empty{<tr><td colspan="7">No cutting sheets yet.</td></tr>}
  </tbody></table></div>}
 </section>`,styles:[`
 :host{display:block;min-width:0;container-type:inline-size}
 .cnc{min-width:0}.heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}.heading h3{margin:0 0 4px}.heading p{margin:0;color:var(--wc-muted);font-size:.875rem}
 .folding-tabs{display:flex;gap:6px;margin:0 0 12px}.folding-tabs button{border:1px solid var(--wc-border);border-radius:6px;background:var(--wc-surface);padding:6px 10px;cursor:pointer}.folding-tabs button.active{border-color:var(--p-primary-color);color:var(--p-primary-color);font-weight:600}.variant-note{margin:0 0 10px;color:var(--wc-muted)}
 .table-wrap{border:1px solid var(--wc-border);border-radius:12px;background:var(--wc-surface)}table{width:100%;table-layout:fixed;border-collapse:collapse;font-size:.875rem}
 th,td{padding:5px 4px;text-align:left;vertical-align:middle;border-bottom:1px solid var(--wc-border);min-width:0;overflow-wrap:anywhere}th{line-height:1.2}tr:last-child td{border-bottom:0}
 th:nth-child(1){width:7%}th:nth-child(2){width:16%}th:nth-child(3){width:19%}th:nth-child(4){width:18%}th:nth-child(5){width:17%}th:nth-child(6){width:17%}th:nth-child(7){width:6%}
 td input:not([type=file]),td select,td textarea{box-sizing:border-box;width:100%;min-width:0;max-width:100%;padding:4px 6px;font-size:inherit;border:1px solid var(--wc-border);border-radius:6px;background:var(--wc-surface);color:inherit;box-shadow:none}
 td input:not([type=file]),td select,td textarea{height:30px}td textarea{min-height:30px;max-height:30px;resize:none;overflow-x:auto;overflow-y:hidden;white-space:nowrap;text-overflow:ellipsis}td:last-child{text-align:center}
 .parts-cell{position:relative}.part-summary,.part-edit-row,.part-add-row{display:flex;align-items:center;gap:4px;min-width:0}.part-summary>input{flex:1;width:auto!important;text-overflow:ellipsis}.parts-editor{position:absolute;z-index:5;top:calc(100% - 2px);left:4px;width:min(330px,calc(100vw - 48px));padding:7px;border:1px solid var(--wc-border);border-radius:8px;background:var(--wc-surface);box-shadow:0 8px 24px rgba(15,23,42,.16)}.part-edit-row+.part-edit-row,.part-add-row{margin-top:5px}.part-edit-row>input,.part-add-row>select{flex:1;width:auto!important}.remove-part{color:#991b1b}
 .upload{display:inline-block;position:relative;overflow:hidden;border:1px solid var(--wc-border);border-radius:6px;padding:5px 7px;cursor:pointer;max-width:100%;text-align:center;white-space:nowrap}
 .upload input,.replace-icon input{position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer}.upload:focus-within,.replace-icon:focus-within{outline:2px solid currentColor;outline-offset:2px}
 .file-line{display:flex;align-items:center;gap:4px;min-width:0;white-space:nowrap}.filename{flex:0 1 auto;min-width:0;max-width:calc(100% - 32px);padding:0;border:0;background:transparent;color:inherit;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left;text-decoration:underline;cursor:pointer}
 .icon-control{display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;flex:none;box-sizing:border-box;width:28px;height:28px;padding:0;line-height:0;border:1px solid var(--wc-border);border-radius:6px;background:var(--wc-surface);color:inherit;cursor:pointer}.icon-control svg{display:block;flex:none;width:16px;height:16px;margin:auto;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}.icon-control:hover,.upload:hover{background:var(--wc-ground)}.icon-control:disabled{opacity:.5;cursor:default}.replace-icon{position:relative;overflow:hidden}.replace-icon:has(input:disabled){opacity:.5;cursor:default}
 .error{color:#991b1b;background:#fff1f1;border:1px solid #fecaca;padding:9px;border-radius:6px}small{display:block;margin-top:2px;color:var(--wc-muted);font-size:.75rem}
 @container (max-width:760px){table,tbody{display:block}thead{display:none}tr{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:6px;padding:8px}tr+tr{border-top:1px solid var(--wc-border)}td{display:block;width:100%;padding:0;border:0}td:nth-child(3),td:nth-child(4),td:nth-child(6),td[colspan]{grid-column:1/-1}td:not(:last-child)::before{display:block;margin-bottom:3px;color:var(--wc-muted);font-size:.8rem;font-weight:600}td:nth-child(1)::before{content:'No'}td:nth-child(2)::before{content:'Name'}td:nth-child(3)::before{content:'Material'}td:nth-child(4)::before{content:'Parts'}td:nth-child(5)::before{content:'CNC file'}td:nth-child(6)::before{content:'Comment'}td:last-child{align-self:end}.parts-editor{position:static;width:auto;margin-top:5px}}
 `]})
export class ProductCncComponent implements OnChanges {
 @Input() productId=''; @Input() parts:ShopPart[]|null=null; @Input() backdrop=false; @Input() orderFolding:Folding|''=''; @Input() requireOrderFolding=false;
 sheets:CncSheet[]=[]; catalogParts:ShopPart[]=[]; variantParts:Record<Folding,ShopPart[]>={foldable:[],nonfoldable:[]}; activeFolding:Folding='foldable'; foldingLabel=foldingLabel;
 materials:{id:string;name:string;unit:string;active:boolean}[]=[]; partsEditor:CncSheet|null=null; pendingPartId=''; loading=false; materialsLoading=false; partsLoading=false; loadError=false; busy=''; activity:''|'save'|'upload'=''; error=''; success=''; private generation=0;private loadedProductId='';
 constructor(private db:SupabaseService,@Optional() private cdr?:ChangeDetectorRef){}
 private refresh(){this.cdr?.markForCheck();}
 ngOnChanges(changes:SimpleChanges){if(changes['productId']||changes['orderFolding'])this.activeFolding=this.orderFolding||'foldable';if(changes['productId'])void this.load();}
 visibleSheets(){const folding=this.orderFolding||this.activeFolding;return this.sheets.filter(row=>this.backdrop?row.folding===folding:!row.folding);}
 async load(){const generation=++this.generation;this.loading=true;this.materialsLoading=true;this.partsLoading=this.parts===null;this.loadError=false;this.error='';this.success='';if(this.loadedProductId!==this.productId){this.sheets=[];this.catalogParts=[];this.variantParts={foldable:[],nonfoldable:[]};this.materials=[];this.loadedProductId=this.productId;}
  if(!this.productId){this.sheets=[];this.loading=false;this.materialsLoading=false;this.partsLoading=false;this.refresh();return;}
  const materialLoad=this.loadMaterials().then(data=>{if(generation===this.generation)this.materials=data;})
   .catch(e=>{if(generation===this.generation){this.error+=` Could not load materials. ${this.message(e)} Retry load.`;this.loadError=true;}})
   .finally(()=>{if(generation===this.generation){this.materialsLoading=false;this.refresh();}});
  const templates=this.parts===null?this.db.client.from('wc_shop_templates').select('parts,folding').eq('product_id',this.productId):Promise.resolve({data:[],error:null});
  const templateLoad=Promise.resolve(templates).then(({data,error})=>{if(error)throw error;if(generation===this.generation){const rows=(data||[]) as {parts:ShopPart[];folding:Folding|null}[];
    this.catalogParts=[...new Map(rows.flatMap(t=>t.parts||[]).map(p=>[p.id,p])).values()];
    this.variantParts={foldable:[...new Map(rows.filter(t=>t.folding==='foldable').flatMap(t=>t.parts||[]).map(p=>[p.id,p])).values()],nonfoldable:[...new Map(rows.filter(t=>t.folding==='nonfoldable').flatMap(t=>t.parts||[]).map(p=>[p.id,p])).values()]};
   }})
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
 add(){if(this.backdrop&&this.requireOrderFolding&&!this.orderFolding)return;this.error='';this.success='';const folding=this.backdrop?(this.orderFolding||this.activeFolding):null;
  this.sheets=[...this.sheets,{id:'',product_id:this.productId,sheet_number:Math.max(0,...this.sheets.filter(s=>s.folding===folding).map(s=>Number(s.sheet_number)||0))+1,name:'',material_id:null,folding,parts:[],comment:'',object_path:null,filename:null,size_bytes:null,revision:''}];}
 private partsFor(row:CncSheet){return this.parts??(this.backdrop&&row.folding?this.variantParts[row.folding]:this.catalogParts);}
 availableParts(row:CncSheet){return this.partsFor(row).filter(p=>!row.parts.some(x=>x.id===p.id));}
 addPart(row:CncSheet,id:string){const part=this.partsFor(row).find(p=>p.id===id);if(part)row.parts=[...row.parts,{id:part.id,name:part.name}];}
 openParts(row:CncSheet,mode:'add'|'edit'){this.partsEditor=row;this.pendingPartId='';if(mode==='add'&&this.availableParts(row).length===1)this.pendingPartId=this.availableParts(row)[0].id;}
 closeParts(){this.partsEditor=null;this.pendingPartId='';}
 addSelectedPart(row:CncSheet){if(!this.pendingPartId)return;this.addPart(row,this.pendingPartId);this.pendingPartId='';}
 renamePart(part:ShopPart,event:Event){part.name=(event.target as HTMLInputElement).value;}
 partsTitle(row:CncSheet){return row.parts.map(part=>part.name).join('\n');}
 removePart(row:CncSheet,id:string){row.parts=row.parts.filter(p=>p.id!==id);}
 async save(row:CncSheet){if(this.busy)return;this.error='';this.loadError=false;this.success='';if(!Number.isSafeInteger(Number(row.sheet_number))||Number(row.sheet_number)<1){this.error='Enter a positive whole sheet number, then retry.';return;}
  if(!row.material_id||!this.materialOptions(row).some(m=>m.id===row.material_id)){this.error='Choose a material from the list, then retry.';return;}
  if(row.parts.some(part=>!part.name.trim())){this.error='Enter a name for every part, then retry.';return;}
  row.parts=row.parts.map(part=>({...part,name:part.name.trim()}));
  const draft={sheet_number:Number(row.sheet_number),name:row.name,material_id:row.material_id,parts:structuredClone(row.parts),comment:row.comment};
  this.busy=row.id||'new';this.activity='save';try{const {data,error}=await this.db.client.rpc('wc_save_product_cnc_sheet',{p_id:row.id||null,p_product:this.productId,p_number:draft.sheet_number,p_name:draft.name,p_material:draft.material_id,p_parts:draft.parts,p_comment:draft.comment,p_folding:row.folding,p_expected:row.revision||null});if(error)throw error;
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
