import {Component,Input,OnChanges,SimpleChanges} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {SupabaseService} from '../../core/services/supabase.service';
import {PAINT_OPERATIONS,ShopPart,ShopTemplate} from '../shop-floor/shop-floor.models';

type ProductComponent={id:string;product_name:string;component_role:string};
type AssignedPart=ShopPart&{component_product_id:string};

@Component({selector:'app-product-parts',standalone:true,imports:[FormsModule],template:`
 <h3>Parts & estimated minutes</h3>
 <p class="mut">Save one template for each size or composition. Add-on parts are included only when that add-on is present in the order. Blank minutes do not block production.</p>
 @if(product?.saved_only){<p class="error" role="alert">Link this imported profile to a catalogue product before adding production parts.</p>}
 @else if(loading){<p>Loading parts…</p>}
 @else {
  <div class="template-tabs"><button type="button" (click)="newTemplate()">New template</button>@for(t of templates;track t.id){<button type="button" [class.active]="editingId===t.id" (click)="editTemplate(t)">{{t.name}}</button>}</div>
  <label>Template name<input [(ngModel)]="templateName" maxlength="150" placeholder="Product / size / version" [disabled]="busy"></label>
  <div class="table-wrap"><table><thead><tr><th>Part</th><th>Belongs to</th><th>Assembly (min)</th><th>Sanding (min)</th><th></th></tr></thead><tbody>
   @for(part of parts;track part.id){<tr><td><input [(ngModel)]="part.name" aria-label="Part name" [disabled]="busy"></td><td><select [(ngModel)]="part.component_product_id" aria-label="Part component" [disabled]="busy">@for(c of components;track c.id){<option [value]="c.id">{{c.component_role}} · {{c.product_name}}</option>}</select></td><td><input type="number" min="0" [ngModel]="estimates['Assembly:'+part.id]" (ngModelChange)="setEstimate('Assembly:'+part.id,$event)" aria-label="Assembly minutes" [disabled]="busy"></td><td><input type="number" min="0" [ngModel]="estimates['Sanding:'+part.id]" (ngModelChange)="setEstimate('Sanding:'+part.id,$event)" aria-label="Sanding minutes" [disabled]="busy"></td><td><button type="button" (click)="removePart(part.id)" [disabled]="busy">Remove</button></td></tr>}
   @empty{<tr><td colspan="5">Add the first product part.</td></tr>}
  </tbody></table></div>
  <button type="button" (click)="addPart()" [disabled]="busy||!components.length">Add part</button>
  <div class="estimate-grid"><label>CNC (min)<input type="number" min="0" [ngModel]="estimates['CNC']" (ngModelChange)="setEstimate('CNC',$event)" [disabled]="busy"></label>@for(op of paint.concat(['Repaint']);track op){<label>{{op}} (min)<input type="number" min="0" [ngModel]="estimates['Painting:'+op]" (ngModelChange)="setEstimate('Painting:'+op,$event)" [disabled]="busy"></label>}</div>
  <button class="primary" type="button" (click)="save()" [disabled]="busy||product.saved_only">{{busy?'Saving…':'Save parts template'}}</button>
 }
 @if(error){<p class="error" role="alert">{{error}}</p>}@if(done){<p class="success" role="status">Parts template saved.</p>}
 `,styles:[`
 :host{display:block}.mut{color:var(--wc-muted);font-size:.875rem}.template-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.template-tabs button.active{border-color:var(--p-primary-color);color:var(--p-primary-color)}label{display:flex;flex-direction:column;gap:5px;margin:10px 0}.table-wrap{overflow:auto;margin:12px 0}table{width:100%;border-collapse:collapse}th,td{text-align:left;border-bottom:1px solid var(--wc-border);padding:8px;min-width:125px}th:first-child,td:first-child{min-width:180px}input,select{width:100%;box-sizing:border-box}.estimate-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:14px 0}.primary{background:var(--p-primary-color);color:#fff}.error{color:var(--p-red-600)}.success{color:var(--p-green-700)}
 `]})
export class ProductPartsComponent implements OnChanges{
 @Input() product:any;
 templates:ShopTemplate[]=[];components:ProductComponent[]=[];parts:AssignedPart[]=[];estimates:Record<string,number>={};
 templateName='';editingId='';version=0;loading=false;busy=false;error='';done=false;paint=PAINT_OPERATIONS;private loadToken=0;
 constructor(private db:SupabaseService){}
 ngOnChanges(changes:SimpleChanges){if(changes['product'])void this.load();}
 async load(){const id=this.product?.id,token=++this.loadToken;this.templates=[];this.components=[];this.parts=[];this.estimates={};this.error='';this.done=false;
  if(!id||this.product.saved_only){this.loading=false;return;}this.loading=true;
  const [templates,components]=await Promise.all([
   this.db.client.from('wc_shop_templates').select('*').eq('product_id',id).order('name'),
   this.db.client.rpc('wc_shop_product_components',{p_product:id})
  ]);
  if(token!==this.loadToken)return;this.loading=false;
  if(templates.error||components.error){this.error='Could not load product parts. Refresh and retry.';return;}
  this.templates=(templates.data||[]) as ShopTemplate[];this.components=(components.data||[]) as ProductComponent[];
  const selected=this.templates.find(t=>t.id===this.editingId);selected?this.editTemplate(selected):this.newTemplate();
 }
 newTemplate(){this.editingId='';this.version=0;this.templateName=this.product?.short_name||this.product?.product_name||'';this.parts=[];this.estimates={};this.done=false;}
 editTemplate(t:ShopTemplate){this.editingId=t.id;this.version=t.version;this.templateName=t.name;this.parts=structuredClone(t.parts) as AssignedPart[];this.estimates={...t.estimates};this.done=false;this.error='';}
 addPart(){this.parts=[...this.parts,{id:crypto.randomUUID(),name:'',component_product_id:this.product.id}];}
 removePart(id:string){this.parts=this.parts.filter(p=>p.id!==id);for(const stage of ['Assembly','Sanding'])delete this.estimates[stage+':'+id];}
 setEstimate(key:string,value:string|number|null){if(value===''||value===null)delete this.estimates[key];else this.estimates[key]=Number(value);}
 async save(){if(this.busy)return;this.error='';this.done=false;
  if(!this.templateName.trim()||!this.parts.length||this.parts.some(p=>!p.name.trim()||!p.component_product_id)){this.error='Enter a template name, at least one part, and choose its product component.';return;}
  this.busy=true;const productId=this.product.id;
  const {data,error}=await this.db.client.rpc('wc_shop_save_product_template',{p_id:this.editingId||null,p_product:productId,p_name:this.templateName.trim(),p_parts:this.parts.map(p=>({...p,name:p.name.trim()})),p_estimates:this.estimates,p_version:this.version||null});
  this.busy=false;if(this.product.id!==productId)return;
  if(error){this.error=error.message||'Could not save product parts. Retry.';return;}
  await this.load();const saved=this.templates.find(t=>t.id===data?.id);if(saved)this.editTemplate(saved);this.done=true;
 }
}
