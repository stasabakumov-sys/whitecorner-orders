import {Component,Input,OnChanges,SimpleChanges,ChangeDetectorRef,Optional} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {SupabaseService} from '../../core/services/supabase.service';
import {paintOperations,paintLabel,ShopPart,ShopTemplate} from '../shop-floor/shop-floor.models';
import {backdropSizeKey,sizeKeyLabel} from './product-sizes';
import {Folding,foldingLabel} from '../costing/production-cost';

type ProductComponent={id:string;product_name:string;component_role:string};
type AssignedPart=ShopPart&{component_product_id:string};

@Component({selector:'app-product-parts',standalone:true,imports:[FormsModule],template:`
 <h3>Parts & estimated minutes</h3>
 <p class="mut">@if(hasFolding){Save separate parts and minutes for each size and folding option.}@else{Save one template for each size or composition.} Raw skips painting; Painted includes the painting minutes below. Add-on parts apply only when ordered.</p>
 @if(product?.saved_only){<p class="error" role="alert">Link this imported profile to a catalogue product before adding production parts.</p>}
 @else if(loading){<p>Loading parts…</p>}
 @else if(loadFailed){<button type="button" (click)="load()">Retry loading parts</button>}
 @else {
  @if(hasFolding){
   <label>Product size<select aria-label="Estimated time product size" [ngModel]="sizeKey" (ngModelChange)="chooseSize($event)" [disabled]="busy"><option value="">Choose size</option>@for(size of sizeKeys();track size){<option [value]="size">{{sizeLabel(size)}}</option>}</select></label>
   <nav class="template-tabs" aria-label="Estimated time folding option">@for(fold of folds;track fold){<button type="button" [class.active]="folding===fold" [attr.aria-pressed]="folding===fold" (click)="chooseVariant(fold)" [disabled]="busy||!sizeKey">{{foldingLabel(fold)}}</button>}</nav>
   @if(unassigned().length){<p class="mut">Previously saved estimates need a folding option. Open a saved template to assign it; its parts and minutes are retained.</p><div class="template-tabs">@for(t of unassigned();track t.id){<button type="button" [disabled]="busy" (click)="editTemplate(t)">Unassigned · {{t.name}}</button>}</div>}
   @if(editingId&&!templates.find(isAssignedEditing)){<label>Assign saved estimates to<select aria-label="Assign saved folding option" [(ngModel)]="folding" [disabled]="busy"><option value="">Choose folding option</option>@for(fold of folds;track fold){<option [value]="fold">{{foldingLabel(fold)}}</option>}</select></label>}
  }@else{
   <div class="template-tabs"><button type="button" (click)="newTemplate()" [disabled]="busy">New template</button>@for(t of templates;track t.id){<button type="button" [class.active]="editingId===t.id" [attr.aria-pressed]="editingId===t.id" [disabled]="busy" (click)="editTemplate(t)">{{t.name}}</button>}</div>
  }
  <label>Template name<input [(ngModel)]="templateName" maxlength="150" placeholder="Product / size / version" [disabled]="busy"></label>
  <div class="table-wrap"><table><thead><tr><th>Part</th><th>Belongs to</th><th>Assembly (min)</th><th>Sanding (min)</th><th></th></tr></thead><tbody>
   @for(part of parts;track part.id){<tr><td><input [(ngModel)]="part.name" aria-label="Part name" [disabled]="busy"></td><td><select [(ngModel)]="part.component_product_id" aria-label="Part component" [disabled]="busy">@for(c of components;track c.id){<option [value]="c.id">{{c.component_role}} · {{c.product_name}}</option>}</select></td><td><input type="number" min="0" [ngModel]="estimates['Assembly:'+part.id]" (ngModelChange)="setEstimate('Assembly:'+part.id,$event)" aria-label="Assembly minutes" [disabled]="busy"></td><td><input type="number" min="0" [ngModel]="estimates['Sanding:'+part.id]" (ngModelChange)="setEstimate('Sanding:'+part.id,$event)" aria-label="Sanding minutes" [disabled]="busy"></td><td><button type="button" (click)="removePart(part.id)" [disabled]="busy">Remove</button></td></tr>}
   @empty{<tr><td colspan="5">Add the first product part.</td></tr>}
  </tbody></table></div>
  <button type="button" (click)="addPart()" [disabled]="busy||!components.length">Add part</button>
  <div class="estimate-grid"><label>CNC (min)<input type="number" min="0" [ngModel]="estimates['CNC']" (ngModelChange)="setEstimate('CNC',$event)" [disabled]="busy"></label>@for(op of paint;track op){<label>{{paintLabel(op,paint)}} (min)<input type="number" min="0" [ngModel]="estimates['Painting:'+op]" (ngModelChange)="setEstimate('Painting:'+op,$event)" [disabled]="busy"></label>}</div>
  <button class="primary" type="button" (click)="save()" [disabled]="busy||product.saved_only">{{busy?'Saving…':'Save parts template'}}</button>
 }
 @if(error){<p class="error" role="alert">{{error}}</p>}@if(done){<p class="success" role="status">Parts template saved.</p>}
 `,styles:[`
 :host{display:block}.mut{color:var(--wc-muted);font-size:.875rem}.template-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.template-tabs button.active{border-color:var(--p-primary-color);color:var(--p-primary-color)}label{display:flex;flex-direction:column;gap:5px;margin:10px 0}.table-wrap{overflow:auto;margin:12px 0}table{width:100%;border-collapse:collapse}th,td{text-align:left;border-bottom:1px solid var(--wc-border);padding:8px;min-width:125px}th:first-child,td:first-child{min-width:180px}input,select{width:100%;box-sizing:border-box}.estimate-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:14px 0}.primary{background:var(--p-primary-color);color:#fff}.error{color:var(--p-red-600)}.success{color:var(--p-green-700)}
 `]})
export class ProductPartsComponent implements OnChanges{
 @Input() product:any;@Input() sizes:string[]=[];
 folding:Folding|''='';sizeKey='';folds:Folding[]=['foldable','nonfoldable'];foldingLabel=foldingLabel;sizeLabel=sizeKeyLabel;
 private drafts=new Map<string,any>();
 get hasFolding(){return /backdrop/i.test(this.product?.product_name||'');}
 isAssignedEditing=(t:ShopTemplate)=>t.id===this.editingId&&!!t.folding;
 unassigned(){return this.templates.filter(t=>!t.folding||!t.size_key);}
 sizeKeys(){return [...new Set([...this.sizes.map(backdropSizeKey),...this.templates.map(t=>t.size_key||'')].filter(Boolean))];}
 chooseSize(size:string){if(!this.folding){this.sizeKey=size;return;}this.chooseVariant(this.folding,size);}
 chooseVariant(fold:Folding|'',size=this.sizeKey){
  if(this.folding&&this.sizeKey)this.drafts.set(this.sizeKey+':'+this.folding,{id:this.editingId,version:this.version,name:this.templateName,parts:structuredClone(this.parts),estimates:{...this.estimates}});
  const draft=this.drafts.get(size+':'+fold),saved=this.templates.find(t=>t.size_key===size&&t.folding===fold);
  if(draft){this.editingId=draft.id;this.version=draft.version;this.templateName=draft.name;this.parts=structuredClone(draft.parts);this.estimates={...draft.estimates};}
  else if(saved)this.editTemplate(saved);else this.newTemplate();
  this.sizeKey=size;this.folding=fold;this.error='';this.done=false;
 }
 templates:ShopTemplate[]=[];components:ProductComponent[]=[];parts:AssignedPart[]=[];estimates:Record<string,number>={};
 templateName='';editingId='';version=0;loading=false;busy=false;error='';done=false;paintLabel=paintLabel;private loadToken=0;
 get paint(){return paintOperations(this.product?.product_name||'');}
 loadFailed=false;private loadedProductId='';
 constructor(private db:SupabaseService,@Optional() private cdr?:ChangeDetectorRef){}
 ngOnChanges(changes:SimpleChanges){const change=changes['product'];if(change&&(change.firstChange||change.previousValue?.id!==change.currentValue?.id||change.previousValue?.saved_only!==change.currentValue?.saved_only))void this.load();}
 async load(){const id=this.product?.id,token=++this.loadToken;this.error='';this.done=false;this.loadFailed=false;
  if(this.loadedProductId!==id){this.templates=[];this.components=[];this.drafts.clear();this.newTemplate();this.loadedProductId=id;}
  if(!id||this.product.saved_only){this.loading=false;return;}this.loading=true;
  try{
   const [templates,components]=await Promise.all([
    this.db.client.from('wc_shop_templates').select('*').eq('product_id',id).order('name'),
    this.db.client.rpc('wc_shop_product_components',{p_product:id})
   ]);
   if(token!==this.loadToken)return;
   if(templates.error||components.error||!Array.isArray(templates.data)||!Array.isArray(components.data))throw Error('Could not load product parts.');
   this.templates=templates.data as ShopTemplate[];this.components=components.data as ProductComponent[];
   const selected=this.templates.find(t=>t.id===this.editingId)||this.templates[0];selected?this.editTemplate(selected):this.newTemplate();
  }catch{if(token===this.loadToken){this.loadFailed=true;this.error='Could not load product parts. Your current entries are retained. Retry loading before saving.';}}
  finally{if(token===this.loadToken){this.loading=false;this.cdr?.markForCheck();}}
 }
 newTemplate(){this.editingId='';this.version=0;this.templateName=this.product?.short_name||this.product?.product_name||'';this.parts=[];this.estimates={};this.folding='';this.sizeKey=this.sizeKeys().length===1?this.sizeKeys()[0]:'';this.done=false;}
 editTemplate(t:ShopTemplate){this.editingId=t.id;this.version=t.version;this.templateName=t.name;this.parts=structuredClone(t.parts) as AssignedPart[];this.estimates={...t.estimates};this.folding=t.folding||'';this.sizeKey=t.size_key||(this.sizeKeys().length===1?this.sizeKeys()[0]:'');delete this.estimates['Painting:Repaint'];this.done=false;this.error='';}
 addPart(){this.parts=[...this.parts,{id:crypto.randomUUID(),name:'',component_product_id:this.product.id}];}
 removePart(id:string){this.parts=this.parts.filter(p=>p.id!==id);for(const stage of ['Assembly','Sanding'])delete this.estimates[stage+':'+id];}
 setEstimate(key:string,value:string|number|null){if(value===''||value===null)delete this.estimates[key];else this.estimates[key]=Number(value);}
 async save(){if(this.busy||this.loading||this.loadFailed||!this.product?.id||this.product.saved_only)return;this.error='';this.done=false;
  if(!this.templateName.trim()||!this.parts.length||this.parts.some(p=>!p.name.trim()||!p.component_product_id)){this.error='Enter a template name, at least one part, and choose its product component.';return;}
  if(this.hasFolding&&(!this.sizeKey||!this.folding)){this.error='Choose product size and Foldable or Non-foldable before saving.';return;}
  this.busy=true;const productId=this.product.id,token=this.loadToken;
  try{
   const {data,error}=await this.db.client.rpc(this.hasFolding?'wc_shop_save_variant_template':'wc_shop_save_product_template',{p_id:this.editingId||null,p_product:productId,p_name:this.templateName.trim(),p_parts:this.parts.map(p=>({...p,name:p.name.trim()})),p_estimates:{...this.estimates},p_version:this.version||null,...(this.hasFolding?{p_size:this.sizeKey,p_folding:this.folding}:{})});
   if(this.product.id!==productId||token!==this.loadToken)return;
   if(error)throw error;
   if(!data?.id||typeof data.name!=='string'||data.product_id!==productId||!Array.isArray(data.parts)||!data.parts.length||!data.estimates||typeof data.estimates!=='object'||!Number.isInteger(data.version)||data.version<1)throw Error('The server did not confirm the saved template.');
   if(this.hasFolding&&(data.size_key!==this.sizeKey||data.folding!==this.folding))throw Error('The server did not confirm the saved variant.');
   this.drafts.delete(this.sizeKey+':'+this.folding);
   this.templates=[...this.templates.filter(t=>t.id!==data.id),data].sort((a,b)=>a.name.localeCompare(b.name));this.editTemplate(data);this.done=true;
  }catch(e:any){if(this.product.id===productId&&token===this.loadToken)this.error=(e?.message||'Could not save product parts.')+' Your entries are retained. Reopen the product to check the saved template before retrying.';}
  finally{this.busy=false;this.cdr?.markForCheck();}
 }
}
