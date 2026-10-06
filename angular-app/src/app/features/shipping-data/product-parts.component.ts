import {Component,Input,OnChanges,SimpleChanges,ChangeDetectorRef,Optional} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {SupabaseService} from '../../core/services/supabase.service';
import {ShopPart,ShopTemplate} from '../shop-floor/shop-floor.models';
import {manualBackdropSizeKey,sizeKeyLabel} from './product-sizes';
import {Folding,foldingLabel} from '../costing/production-cost';
import {isCartProduct} from './cart-size';
import {partMatchesOrder} from '../shop-floor/estimated-composition';

type ProductComponent={id:string;product_name:string;component_role:string};
type AssignedPart=ShopPart&{component_product_id:string};
type PackingRule={id:string;rule_type:string;match_name:string;match_value?:string;active?:boolean};
type PartScope={key:string;label:string;componentId:string;optionName?:string;optionValue?:string};

@Component({selector:'app-product-parts',standalone:true,imports:[FormsModule],template:`
 <h3>Parts & estimated minutes</h3>
  <p class="mut">@if(hasFolding){Save one structural template for Foldable and one for Non-foldable. Every size reuses it.}@else if(isSizedCart){Save Main work once for this Cart size, then add the work for each Add-on below. Add-on choices come from Packing.}@else{Save Main work once for each size, then add work for each Add-on below.} Painting is entered once below and is added only to Painted orders.</p>
 @if(product?.saved_only){<p class="error" role="alert">Link this imported profile to a catalogue product before adding production parts.</p>}
 @else if(loading){<p>Loading parts…</p>}
 @else if(loadFailed){<button type="button" (click)="load()">Retry loading parts</button>}
 @else {
  @if(hasFolding){
   @if(!selectedFolding){<nav class="template-tabs" aria-label="Estimated time folding option">@for(fold of folds;track fold){<button type="button" [class.active]="folding===fold" [attr.aria-pressed]="folding===fold" (click)="chooseVariant(fold)" [disabled]="busy">{{foldingLabel(fold)}}</button>}</nav>}
   @else{<p class="mut">Showing {{foldingLabel(selectedFolding)}} for the variant selected above.</p>}
   @if(!orderVariant&&unassigned().length){<p class="mut">Previously saved estimates need a folding option. Open a saved template to assign it; its parts and minutes are retained.</p><div class="template-tabs">@for(t of unassigned();track t.id){<button type="button" [disabled]="busy" (click)="editTemplate(t)">Unassigned · {{t.name}}</button>}</div>}
   @if(editingId&&!templates.find(isAssignedEditing)&&!selectedFolding){<label>Assign saved estimates to<select aria-label="Assign saved folding option" [(ngModel)]="folding" [disabled]="busy"><option value="">Choose folding option</option>@for(fold of folds;track fold){<option [value]="fold">{{foldingLabel(fold)}}</option>}</select></label>}
  }@else{
   @if(!isSizedCart){<div class="template-tabs"><button class="icon-action" type="button" title="New template" aria-label="New template" (click)="newTemplate()" [disabled]="busy||orderVariant&&!!selectedSize">+</button>@for(t of templates;track t.id){<button type="button" [class.active]="editingId===t.id" [attr.aria-pressed]="editingId===t.id" [disabled]="busy" (click)="editTemplate(t)">{{t.name}}</button>}</div>}
  }
  <label>Template name<input [(ngModel)]="templateName" maxlength="150" placeholder="Product / size / version" [disabled]="busy"></label>
  @for(scope of partScopes();track scope.key){<section class="part-scope"><div class="scope-heading"><div><h4>{{scope.label}}</h4>@if(scope.key!=='main'){<small>Main minutes are reused; enter only the additional work here.</small>}</div><button class="icon-action" type="button" [title]="'Add part to '+scope.label" [attr.aria-label]="'Add part to '+scope.label" (click)="addPart(scope)" [disabled]="busy">+</button></div>
   <div class="table-wrap"><table><thead><tr><th>Part</th><th>Extra CNC (min)</th><th>Assembly (min)</th><th>Sanding (min)</th><th></th></tr></thead><tbody>
    @for(part of partsFor(scope);track part.id){<tr><td><input [(ngModel)]="part.name" [attr.aria-label]="'Part name for '+scope.label" [disabled]="busy"></td><td><input type="number" min="0" [ngModel]="estimates['CNC:'+part.id]" (ngModelChange)="setEstimate('CNC:'+part.id,$event)" [attr.aria-label]="'Extra CNC minutes for '+part.name" [disabled]="busy"></td><td><input type="number" min="0" [ngModel]="estimates['Assembly:'+part.id]" (ngModelChange)="setEstimate('Assembly:'+part.id,$event)" [attr.aria-label]="'Assembly minutes for '+part.name" [disabled]="busy"></td><td><input type="number" min="0" [ngModel]="estimates['Sanding:'+part.id]" (ngModelChange)="setEstimate('Sanding:'+part.id,$event)" [attr.aria-label]="'Sanding minutes for '+part.name" [disabled]="busy"></td><td><button type="button" (click)="removePart(part.id)" [disabled]="busy">Remove</button></td></tr>}
    @empty{<tr><td colspan="5">{{scope.key==='main'?'Add the first Main part.':'No parts for this Add-on yet.'}}</td></tr>}
   </tbody></table></div>
   @if(scope.key==='main'){<div class="estimate-grid"><label>Main CNC (min)<input type="number" min="0" [ngModel]="estimates['CNC']" (ngModelChange)="setEstimate('CNC',$event)" [disabled]="busy"></label></div>}
  </section>}
  <button class="primary icon-action" type="button" title="Save parts template" aria-label="Save parts template" (click)="save()" [disabled]="busy||product.saved_only"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3h13l3 3v15H4zM7 3v6h10V3M7 21v-8h10v8"/></svg></button>@if(busy){<span role="status">Saving parts template…</span>}
 }
 @if(error){<p class="error" role="alert">{{error}}</p>}@if(done){<p class="success" role="status">Parts template saved.</p>}
 `,styles:[`
 :host{display:block}.mut{color:var(--wc-muted);font-size:.875rem}.template-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.template-tabs button.active{border-color:var(--p-primary-color);color:var(--p-primary-color)}label{display:flex;flex-direction:column;gap:5px;margin:10px 0}.part-scope{border:1px solid var(--wc-border);border-radius:12px;padding:12px;margin:12px 0;background:var(--wc-surface)}.scope-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.scope-heading h4{margin:0}.scope-heading small{display:block;color:var(--wc-muted);margin-top:3px}.table-wrap{overflow:auto;margin:8px 0 0}table{width:100%;border-collapse:collapse}th,td{text-align:left;border-bottom:1px solid var(--wc-border);padding:8px;min-width:110px}th:first-child,td:first-child{min-width:180px}input,select{width:100%;box-sizing:border-box}.estimate-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:14px 0}.primary{background:var(--p-primary-color);color:#fff}.icon-action{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;border:1px solid var(--wc-border);border-radius:7px;vertical-align:middle;font:inherit}.icon-action svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.error{color:var(--p-red-600)}.success{color:var(--p-green-700)}
 `]})
export class ProductPartsComponent implements OnChanges{
 @Input() product:any;@Input() sizes:string[]=[];@Input() selectedSize='';@Input() selectedFolding:Folding|''='';@Input() orderVariant=false;@Input() orderComponentIds:string[]|null=null;@Input() orderOptions:Record<string,unknown>={};@Input() packingRules:PackingRule[]=[];
 folding:Folding|''='';sizeKey='';folds:Folding[]=['foldable','nonfoldable'];foldingLabel=foldingLabel;sizeLabel=sizeKeyLabel;
 private drafts=new Map<string,any>();
 get hasFolding(){return String(this.product?.product_type||'').toLowerCase()==='backdrop'||/backdrop/i.test(this.product?.product_name||'');}
 get isSizedCart(){return isCartProduct(this.product)&&!!this.selectedSize;}
 isAssignedEditing=(t:ShopTemplate)=>t.id===this.editingId&&!!t.folding;
 unassigned(){return this.templates.filter(t=>!t.folding||(!this.hasFolding&&!t.size_key));}
 sizeKeys(){return [...new Set([...this.sizes.map(manualBackdropSizeKey),...this.templates.map(t=>t.size_key||'')].filter(Boolean))];}
 chooseSize(size:string){if(!this.folding){this.sizeKey=size;return;}this.chooseVariant(this.folding,size);}
 chooseVariant(fold:Folding|'',size=this.sizeKey){
  const draftKey=this.hasFolding?String(this.folding):this.sizeKey+':'+this.folding;if(this.folding&&(this.hasFolding||this.sizeKey))this.drafts.set(draftKey,{id:this.editingId,version:this.version,name:this.templateName,parts:structuredClone(this.parts),estimates:{...this.estimates}});
  const key=this.hasFolding?String(fold):size+':'+fold,shared=this.templates.find(t=>!t.size_key&&t.folding===fold),legacy=this.templates.filter(t=>!!t.size_key&&t.folding===fold),saved=this.hasFolding?(shared||(legacy.length===1?legacy[0]:undefined)):this.templates.find(t=>t.size_key===size&&t.folding===fold),draft=this.drafts.get(key);
  if(draft){this.editingId=draft.id;this.version=draft.version;this.templateName=draft.name;this.parts=structuredClone(draft.parts);this.estimates={...draft.estimates};}
  else if(saved)this.editTemplate(saved);else this.newTemplate();
  this.sizeKey=this.hasFolding?'':size;this.folding=fold;this.error=this.hasFolding&&!shared&&legacy.length>1?'Existing size-specific estimates differ. Enter and save one shared template for this construction.':'';this.done=false;
 }
 templates:ShopTemplate[]=[];components:ProductComponent[]=[];parts:AssignedPart[]=[];estimates:Record<string,number>={};private hiddenParts:AssignedPart[]=[];private hiddenEstimates:Record<string,number>={};
 visibleComponents(){return this.orderVariant&&this.orderComponentIds?this.components.filter(c=>this.orderComponentIds!.includes(c.id)):this.components;}
 private scopeKey(part:ShopPart):string{if(part.option_name&&part.option_value)return 'option:'+this.normal(part.option_name)+':'+this.normal(part.option_value);return part.component_product_id&&part.component_product_id!==this.product?.id?'component:'+part.component_product_id:'main';}
 private normal(value:string){return value.trim().toLocaleLowerCase();}
 partScopes():PartScope[]{
  const scopes:PartScope[]=[{key:'main',label:'Main',componentId:this.product?.id||''}];
  for(const rule of this.packingRules){if(rule.active===false||this.normal(rule.rule_type)!=='option'||!rule.match_name?.trim()||!rule.match_value?.trim())continue;
   const scope:PartScope={key:'option:'+this.normal(rule.match_name)+':'+this.normal(rule.match_value),label:`Main + ${rule.match_name}`,componentId:this.product.id,optionName:rule.match_name,optionValue:rule.match_value};
   if(this.orderVariant&&this.orderComponentIds&&!partMatchesOrder({id:'',name:'',component_product_id:this.product.id,option_name:scope.optionName,option_value:scope.optionValue},this.orderComponentIds,this.orderOptions,this.product.id))continue;
   if(!scopes.some(item=>item.key===scope.key))scopes.push(scope);
  }
  for(const component of this.visibleComponents().filter(item=>item.id!==this.product?.id))scopes.push({key:'component:'+component.id,label:'Main + '+component.product_name,componentId:component.id});
  for(const part of this.parts){const key=this.scopeKey(part);if(scopes.some(scope=>scope.key===key))continue;
   scopes.push({key,label:part.option_name?`Main + ${part.option_name}`:'Main + '+(this.components.find(c=>c.id===part.component_product_id)?.product_name||'Unknown Add-on'),componentId:part.component_product_id||this.product.id,optionName:part.option_name,optionValue:part.option_value});
  }
  return scopes;
 }
 partsFor(scope:PartScope){return this.parts.filter(part=>this.scopeKey(part)===scope.key);}
 templateName='';editingId='';version=0;loading=false;busy=false;error='';done=false;private loadToken=0;
 loadFailed=false;private loadedProductId='';
 constructor(private db:SupabaseService,@Optional() private cdr?:ChangeDetectorRef){}
 ngOnChanges(changes:SimpleChanges){const change=changes['product'];if((change&&(change.firstChange||change.previousValue?.id!==change.currentValue?.id||change.previousValue?.saved_only!==change.currentValue?.saved_only))||changes['selectedSize'])void this.load();else if(changes['selectedFolding']&&this.hasFolding&&this.selectedFolding&&this.templates.length&&this.folding!==this.selectedFolding)this.chooseVariant(this.selectedFolding);}
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
   this.templates=(templates.data as ShopTemplate[]).filter(t=>this.orderVariant?(this.hasFolding?t.folding===this.selectedFolding&&(!t.size_key||t.size_key===this.selectedSize):this.selectedSize?t.size_key===this.selectedSize:!t.size_key):!this.isSizedCart||t.size_key===this.selectedSize);this.components=components.data as ProductComponent[];
   const fold=this.selectedFolding||'foldable',selected=this.templates.find(t=>t.id===this.editingId&&(!this.hasFolding||!this.selectedFolding||t.folding===this.selectedFolding))||(this.hasFolding
    ?this.templates.find(t=>t.folding===fold&&!t.size_key)||this.templates.find(t=>t.folding===fold)||this.templates.find(t=>!t.folding)
    :this.templates[0]);selected?this.editTemplate(selected):this.newTemplate();
  }catch{if(token===this.loadToken){this.loadFailed=true;this.error='Could not load product parts. Your current entries are retained. Retry loading before saving.';}}
  finally{if(token===this.loadToken){this.loading=false;this.cdr?.markForCheck();}}
 }
 newTemplate(){this.editingId='';this.version=0;this.templateName=this.product?.short_name||this.product?.product_name||'';this.parts=[];this.hiddenParts=[];this.estimates={};this.hiddenEstimates={};this.folding=this.hasFolding?this.selectedFolding||'foldable':'';this.sizeKey=this.hasFolding?'':this.isSizedCart?this.selectedSize:(this.sizeKeys().length===1?this.sizeKeys()[0]:'');this.done=false;}
 editTemplate(t:ShopTemplate){const selectedFolding=this.folding;this.editingId=t.id;this.version=t.version;this.templateName=t.name;const allParts=structuredClone(t.parts) as AssignedPart[],visible=(part:AssignedPart)=>!this.orderVariant||!this.orderComponentIds||partMatchesOrder(part,this.orderComponentIds,this.orderOptions,this.product.id);this.parts=allParts.filter(visible);this.hiddenParts=allParts.filter(part=>!visible(part));const hiddenIds=new Set(this.hiddenParts.map(part=>part.id));const entries=Object.entries(t.estimates||{}).filter(([key])=>!key.startsWith('Painting:'));this.estimates=Object.fromEntries(entries.filter(([key])=>!hiddenIds.has(key.split(':')[1])));this.hiddenEstimates=Object.fromEntries(entries.filter(([key])=>hiddenIds.has(key.split(':')[1])));this.folding=t.folding||(this.hasFolding?selectedFolding:'');this.sizeKey=this.hasFolding?'':t.size_key||(this.sizeKeys().length===1?this.sizeKeys()[0]:'');this.done=false;this.error='';}
 addPart(scope:PartScope={key:'main',label:'Main',componentId:this.product.id}){this.parts=[...this.parts,{id:crypto.randomUUID(),name:'',component_product_id:scope.componentId,...(scope.optionName&&scope.optionValue?{option_name:scope.optionName,option_value:scope.optionValue}:{})}];}
 removePart(id:string){this.parts=this.parts.filter(p=>p.id!==id);for(const stage of ['CNC','Assembly','Sanding'])delete this.estimates[stage+':'+id];}
 setEstimate(key:string,value:string|number|null){if(value===''||value===null)delete this.estimates[key];else this.estimates[key]=Number(value);}
 async save(){if(this.busy||this.loading||this.loadFailed||!this.product?.id||this.product.saved_only)return;this.error='';this.done=false;
  if(!this.templateName.trim()||!(this.parts.length+this.hiddenParts.length)||this.parts.some(p=>!p.name.trim()||!p.component_product_id)){this.error='Enter a template name, at least one part, and choose its product component.';return;}
  if(this.parts.some(p=>!!p.option_name?.trim()!==!!p.option_value?.trim())){this.error='Enter both the option name and value, or leave both blank for a base part.';return;}
  if(this.hasFolding&&!this.folding){this.error='Choose Foldable or Non-foldable before saving.';return;}
  this.busy=true;const productId=this.product.id,token=this.loadToken;
  try{
   const rpc=this.hasFolding?'wc_shop_save_backdrop_template':this.isSizedCart?'wc_shop_save_sized_product_template':'wc_shop_save_product_template';
   const {data,error}=await this.db.client.rpc(rpc,{p_id:this.editingId||null,p_product:productId,p_name:this.templateName.trim(),p_parts:[...this.parts.map(p=>{const {option_name,option_value,...base}=p;return {...base,name:p.name.trim(),...(option_name?.trim()?{option_name:option_name.trim(),option_value:option_value?.trim()||''}:{})};}),...this.hiddenParts],p_estimates:{...this.estimates,...this.hiddenEstimates},p_version:this.version||null,...(this.hasFolding?{p_folding:this.folding}:this.isSizedCart?{p_size:this.sizeKey}:{})});
   if(this.product.id!==productId||token!==this.loadToken)return;
   if(error)throw error;
   if(!data?.id||typeof data.name!=='string'||data.product_id!==productId||!Array.isArray(data.parts)||!data.parts.length||!data.estimates||typeof data.estimates!=='object'||!Number.isInteger(data.version)||data.version<1)throw Error('The server did not confirm the saved template.');
   if((this.hasFolding&&(data.size_key!==null||data.folding!==this.folding))||(this.isSizedCart&&data.size_key!==this.sizeKey))throw Error('The server did not confirm the saved variant.');
   this.drafts.delete(this.hasFolding?String(this.folding):this.sizeKey+':'+this.folding);
   this.templates=[...this.templates.filter(t=>t.id!==data.id),data].sort((a,b)=>a.name.localeCompare(b.name));this.editTemplate(data);this.done=true;
  }catch(e:any){if(this.product.id===productId&&token===this.loadToken)this.error=(e?.message||'Could not save product parts.')+' Your entries are retained. Reopen the product to check the saved template before retrying.';}
  finally{this.busy=false;this.cdr?.markForCheck();}
 }
}
