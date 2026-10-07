import {ChangeDetectorRef,Component,Input,OnChanges,Optional} from '@angular/core';
import {DialogModule} from 'primeng/dialog';
import {SupabaseService} from '../../core/services/supabase.service';
import {BoxDrawingComponent,baseDrawingBox,sameDrawingBox} from './box-drawing.component';
import {qualifiedDrawingKey} from './product-sizes';
import {BoxRdFilesComponent} from './box-rd-files.component';
import {HubMembersService} from '../../core/services/hub-members.service';

@Component({selector:'app-packing-files-cell',standalone:true,imports:[DialogModule,BoxDrawingComponent,BoxRdFilesComponent],template:`
 <div class="presence">
  <span [class.present]="present" [attr.aria-label]="label" [title]="label">{{loading?'…':error?'?':present?'✓':'—'}}</span>
  <button type="button" class="edit" [title]="locked?'Save packaging changes before editing files':(readOnly?'View ':'Edit ')+kind.toUpperCase()+' files for '+(viewBox.package_name||sharedSize||'box')" [attr.aria-label]="(readOnly?'View ':'Edit ')+kind.toUpperCase()+' files for '+(viewBox.package_name||sharedSize||'box')" (click)="sendOnLoad=false;open=true" [disabled]="locked||!enabled">
   <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z"/></svg>
  </button>
  @if(kind==='rd'&&!readOnly&&members?.manager()){
   <button type="button" class="edit" [title]="locked?'Save packaging changes before sending':!present?'Save RD files before sending':'Send box to Cutting work'" [attr.aria-label]="'Send '+(viewBox.package_name||sharedSize||'box')+' to Cutting work'" [disabled]="locked||!enabled||loading||error||!present" (click)="sendOnLoad=true;open=true"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="m8.5 7.5 12 13m-12-4 12-13"/></svg></button>
  }
 </div>
 @if(error){<small role="alert">Could not check files. <button type="button" (click)="load()">Retry</button></small>}
 <p-dialog [(visible)]="open" [modal]="true" appendTo="body" [header]="kind.toUpperCase()+' · '+(viewBox.package_name||sharedSize||'Packaging')+' · Box '+(viewBox.package_no||index+1)" [style]="{width:'580px',maxWidth:'calc(100vw - 24px)'}" (onHide)="load()">
  @if(open){<p class="help">{{kind==='cdr'?'Source drawing for preparing cutting files. It is never sent to the laser.':'Cutting files and copies for this box.'}} {{sharedSize?'Shared by size and folding option.':resolvedId?'Shared with matching Cart packaging of this product and size.':'Files for this saved packaging box.'}}</p>
   @if(kind==='cdr'){
    @if(svgDrawing){<div class="svg-source"><strong>Constructor · SVG drawing</strong><button type="button" [disabled]="svgBusy" (click)="downloadSvg()">{{svgBusy?'Preparing download…':svgDrawing.filename}}</button></div>}
    @if(svgError){<p class="svg-error" role="alert">{{svgError}} <button type="button" (click)="downloadSvg()" [disabled]="svgBusy">Retry download</button></p>}
    <app-box-drawing [cartBasePackageId]="signature?'':viewBox.id||''" [signature]="signature" [index]="index" [sharedSize]="sharedSize" [box]="viewBox" [readOnly]="readOnly||!!sharedSize&&!qualifiedKey(sharedSize)" />
   }
   @else{<app-box-rd-files [cartBasePackageId]="signature?'':viewBox.id||''" [signature]="signature" [index]="index" [sharedSize]="sharedSize" [boxName]="viewBox.package_name||sharedSize||'Packaging box'" [sendOnLoad]="sendOnLoad" />}
  }
 </p-dialog>
 `,styles:[`
 .presence{display:flex;align-items:center;gap:4px}.presence>span{width:14px;text-align:center;color:var(--wc-muted)}.presence>.present{color:#047857;font-weight:700}.edit{flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;padding:0}.edit svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linejoin:round}.help{color:var(--wc-muted);margin:0 0 18px;font-size:.875rem;line-height:1.5}small{color:#b91c1c}
 .svg-source{display:flex;flex-direction:column;align-items:flex-start;gap:8px;margin-bottom:16px}.svg-source button{max-width:100%;overflow-wrap:anywhere;text-align:left}.svg-error{color:#991b1b;background:#fff1f1;padding:8px;border-radius:6px}
 `]})
export class PackingFilesCellComponent implements OnChanges{
 @Input()box:any={};@Input()kind:'cdr'|'rd'='rd';@Input()signature='';@Input()index=0;@Input()sharedSize='';@Input()backdrop=false;@Input()dimensions:any=null;@Input()readOnly=false;@Input()locked=false;@Input()refreshVersion=0;
 viewBox:any={};resolvedId='';qualifiedKey=qualifiedDrawingKey;svgDrawing:any=null;svgBusy=false;svgError='';
 open=false;sendOnLoad=false;present=false;loading=false;error=false;private generation=0;
 constructor(private db:SupabaseService,private cdr:ChangeDetectorRef,@Optional() readonly members?:HubMembersService){}
 get enabled(){return (!this.backdrop||!!this.sharedSize)&&(!this.sharedSize||this.kind==='cdr'||qualifiedDrawingKey(this.sharedSize))&&!!(this.viewBox.id||this.signature||this.sharedSize);}
 get label(){return `${this.kind==='cdr'&&this.svgDrawing?'CDR / SVG':this.kind.toUpperCase()}: ${this.loading?'checking files':this.error?'check failed':this.present?'file uploaded':'no saved file'}`;}
 ngOnChanges(){this.viewBox=this.dimensions?{...this.box,package_name:this.dimensions.package_name,length_mm:Number(this.dimensions.length_mm),width_mm:Number(this.dimensions.width_mm),height_mm:Number(this.dimensions.height_mm)}:this.box;void this.load();}
 async load(){const version=++this.generation;this.loading=true;this.error=false;this.svgDrawing=null;this.svgError='';
  try{
   // Direct instances also support explicit load after the dialog is closed.
   if(!this.signature&&!this.sharedSize)this.viewBox=this.box;
   if(!this.enabled){this.present=false;return;}
   let packageId=!this.signature&&!this.sharedSize?this.viewBox.id||'':'';
   if(this.signature&&!this.sharedSize){const key=await this.db.client.rpc('wc_cart_base_package',{p_signature:this.signature,p_index:this.index});if(key.error)throw key.error;packageId=typeof key.data==='string'?key.data:'';}
   if(version!==this.generation)return;this.resolvedId=packageId;
   const drawing=this.kind==='cdr';
   const table=drawing?(this.sharedSize?'wc_backdrop_box_drawings':packageId?'wc_cart_base_box_drawings':'wc_box_drawings'):'wc_box_rd_files';
   const key=this.sharedSize?(drawing?'size_key':'backdrop_size_key'):packageId?'cart_base_package_id':'profile_signature',value=this.sharedSize||packageId||this.signature;
   let query=this.db.client.from(table).select(drawing?'*':'id').eq(key,value);if(!this.sharedSize&&!packageId)query=query.eq('box_index',this.index);
   const [response,svgResponse]=await Promise.all([query,drawing&&packageId?this.db.client.from('wc_cart_box_svg_drawings').select('*').eq('cart_base_package_id',packageId):Promise.resolve({data:[],error:null})]);
   if(response.error)throw response.error;if(svgResponse.error)throw svgResponse.error;let rows=response.data||[];
   if(!rows.length&&packageId&&this.signature){const legacy=await this.db.client.from(drawing?'wc_box_drawings':'wc_box_rd_files').select(drawing?'*':'id').eq('profile_signature',this.signature).eq('box_index',this.index);if(legacy.error)throw legacy.error;rows=legacy.data||[];}
   if(!rows.length&&drawing&&qualifiedDrawingKey(this.sharedSize)){const legacy=await this.db.client.from(table).select('*').eq('size_key',this.sharedSize.split(':')[0]);if(legacy.error)throw legacy.error;rows=legacy.data||[];}
   if(version===this.generation){
    this.svgDrawing=(svgResponse.data||[]).find((row:any)=>row.filename?.toLowerCase().endsWith('.svg')&&sameDrawingBox(row.box_snapshot,baseDrawingBox(this.viewBox)))||null;
    this.present=!!this.svgDrawing||(drawing&&!this.sharedSize?rows.some((row:any)=>sameDrawingBox(row.box_snapshot,row.cart_base_package_id?baseDrawingBox(this.viewBox):this.viewBox)):rows.length>0);
   }
  }catch{if(version===this.generation)this.error=true;}
  finally{if(version===this.generation){this.loading=false;this.cdr.markForCheck();}}
 }
 async downloadSvg(){if(!this.svgDrawing||this.svgBusy)return;this.svgBusy=true;this.svgError='';
  try{const file=this.svgDrawing;const response=await this.db.client.storage.from('box-drawings').createSignedUrl(file.object_path,60,{download:file.filename});
   if(response.error)throw response.error;if(!response.data?.signedUrl)throw Error('No download link returned.');
   const link=document.createElement('a');link.href=response.data.signedUrl;link.download=file.filename;link.rel='noopener';link.click();
  }catch(error){this.svgError=`Could not download the SVG drawing. ${(error as {message?:string})?.message||'Connection or server error.'} Retry download.`;}
  finally{this.svgBusy=false;this.cdr.markForCheck();}
 }
}
