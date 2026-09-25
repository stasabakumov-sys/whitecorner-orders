import {CommonModule} from '@angular/common';
import {Component,Input,OnChanges,SimpleChanges,ChangeDetectorRef,Optional} from '@angular/core';
import {SupabaseService} from '../../core/services/supabase.service';
import {paintOperations,ShopTemplate} from '../shop-floor/shop-floor.models';
import {PlannedWorkRow,WorkRate,plannedTotal,plannedWorkRows} from './planned-work-cost';
import {backdropFinishModes,productionCostRows,foldingLabel,templateVariantLabel,Folding} from './production-cost';
import {isCartProduct} from '../shipping-data/cart-size';

@Component({selector:'app-product-work-cost',standalone:true,imports:[CommonModule],template:`
 <h3>{{hasFolding?'Production cost':'Planned work cost'}} · incl. GST</h3><p class="mut">Calculated from @if(hasFolding){saved materials, }Estimated min and shared hourly rates. Raw excludes painting. Repaint is unplanned and excluded.</p>
 @if(loading){<p>Loading planned work cost…</p>}@else if(error){<p class="error" role="alert">{{error}}</p>}@else{
  @if(hasFolding){
   <p class="mut">One product-wide cost per construction. Sizes reuse it. Painting materials and minutes are shared by Foldable and Non-foldable.</p>
   <div class="comparison table-wrap"><table aria-label="Production cost comparison"><thead><tr><th>Construction</th><th>Finish</th><th>Materials</th><th>Work</th><th>Total</th><th>Status</th></tr></thead><tbody>
    @for(row of visibleComparison();track row.folding+row.painted){<tr><td>{{foldingLabel(row.folding)}}</td><td>{{row.painted?'Painted':'Raw'}}</td><td>{{row.materials==null?'—':(row.materials|currency:'AUD')}}</td><td>{{row.work==null?'—':(row.work|currency:'AUD')}}</td><td><b>{{row.total==null?'Incomplete':(row.total|currency:'AUD')}}</b></td><td>{{row.issues.join('; ')||'Ready'}}</td></tr>}
    @empty{<tr><td colspan="6">Production cost is not configured.</td></tr>}
   </tbody></table></div>
  }
  @for(template of displayTemplates();track template.id){<details class="template" [open]="!hasFolding"><summary>{{template.name}}@if(hasFolding){ · {{foldingLabel(template.folding)}}}</summary><div class="table-wrap"><table><thead><tr><th>Stage / operation</th><th>Minutes</th><th>Rate / hour</th><th>Cost</th></tr></thead><tbody>
   @for(row of rows(template,false);track row.key){<tr><td>{{row.label}}</td><td>{{row.minutes==null?'Not set':row.minutes}}</td><td>{{row.rate==null?'Rate required':(row.rate|currency:'AUD')}}</td><td>{{row.cost==null?'—':(row.cost|currency:'AUD')}}</td></tr>}
  </tbody></table></div><div class="totals">@if(hasFolding){<span>Structural work <b>{{total(template,false)==null?'Incomplete':(total(template,false)|currency:'AUD')}}</b></span>}@else{@if(!orderVariant||finishModes().includes(false)){<span>Raw work <b>{{total(template,false)==null?'Incomplete':(total(template,false)|currency:'AUD')}}</b></span>}@if(finishModes().includes(true)){<span>Painted work <b>{{total(template,true)==null?'Incomplete':(total(template,true)|currency:'AUD')}}</b></span>}}</div></details>}
  @empty{<p>No parts template yet. Add it in Estimated min.</p>}
 }
 `,styles:[`:host{display:block}.mut{color:var(--wc-muted);font-size:.875rem}.template{border-top:1px solid var(--wc-border);margin-top:14px;padding-top:10px}.table-wrap{overflow:auto}.comparison{background:white;border:1px solid var(--wc-border);border-radius:12px;margin-top:14px}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px;border-bottom:1px solid var(--wc-border)}.totals{display:flex;gap:18px;flex-wrap:wrap;padding:12px 0}.error{color:var(--p-red-600)}`]})
export class ProductWorkCostComponent implements OnChanges{
 @Input() availableFinishes:boolean[]|null=null;
 @Input() product:any;@Input() sizes:string[]=[];@Input() selectedSize='';@Input() selectedFolding:Folding|''='';@Input() orderVariant=false;@Input() orderComponentIds:string[]|null=null;@Input() manualSizes=false;@Input() materialProfiles:any[]=[];@Input() materials:any[]=[];templates:ShopTemplate[]=[];rates:WorkRate[]=[];loading=false;error='';private token=0;
 foldingLabel=foldingLabel;variantLabel=templateVariantLabel;
 get hasFolding(){return String(this.product?.product_type||'').toLowerCase()==='backdrop'||/backdrop/i.test(this.product?.product_name||'');}
 get isSizedCart(){return isCartProduct(this.product)&&!!this.selectedSize;}
 finishModes(){return this.availableFinishes?.length?this.availableFinishes:backdropFinishModes(this.product,this.materialProfiles.map(profile=>profile.options));}
 private scopedTemplate(template:ShopTemplate):ShopTemplate{if(!this.orderVariant||!this.orderComponentIds)return template;const allowed=new Set(this.orderComponentIds),parts=template.parts.filter(part=>allowed.has(part.component_product_id||this.product.id)),ids=new Set(parts.map(part=>part.id));return {...template,parts,estimates:Object.fromEntries(Object.entries(template.estimates||{}).filter(([key])=>!key.startsWith('Assembly:')&&!key.startsWith('Sanding:')||ids.has(key.split(':')[1])))};}
 displayTemplates(){const templates=this.hasFolding?(this.selectedFolding?[this.selectedFolding]:this.orderVariant?[]:['foldable','nonfoldable'] as Folding[]).flatMap(fold=>{const shared=this.templates.find(t=>!t.size_key&&t.folding===fold);if(shared)return[shared];const legacy=this.templates.filter(t=>t.folding===fold&&(!this.orderVariant||t.size_key===this.selectedSize));return legacy.length===1?[legacy[0]]:[]}):this.orderVariant?this.templates.filter(t=>this.selectedSize?t.size_key===this.selectedSize:!t.size_key):this.templates;return templates.map(template=>this.scopedTemplate(template));}
 comparison(){const templates=this.orderVariant&&this.hasFolding?this.templates.filter(t=>t.folding===this.selectedFolding&&(!t.size_key||t.size_key===this.selectedSize)):this.templates;return productionCostRows(templates.map(template=>this.scopedTemplate(template)),this.materialProfiles,this.product?.backdrop_paint_profile,this.materials,this.rates,this.product.product_name,this.product.id,this.finishModes());}
 visibleComparison(){const rows=this.comparison();return this.selectedFolding?rows.filter(row=>row.folding===this.selectedFolding):rows;}
 constructor(private db:SupabaseService,@Optional() private cdr?:ChangeDetectorRef){}
 ngOnChanges(changes:SimpleChanges){const p=changes['product'];if((p&&(p.firstChange||p.previousValue?.id!==p.currentValue?.id||p.previousValue?.saved_only!==p.currentValue?.saved_only))||changes['selectedSize'])void this.load();}
 async load(){const id=this.product?.id,token=++this.token;this.templates=[];this.rates=[];this.error='';this.loading=false;if(!id||this.product.saved_only)return;this.loading=true;
  try{const [templates,rates]=await Promise.all([this.db.client.from('wc_shop_templates').select('*').eq('product_id',id).order('name'),this.db.client.from('wc_work_rates').select('*').order('sort_order')]);
   if(token!==this.token)return;if(templates.error||rates.error)throw Error('Could not calculate planned work cost.');this.templates=((templates.data||[]) as ShopTemplate[]).filter(t=>!this.isSizedCart||t.size_key===this.selectedSize);this.rates=(rates.data||[]) as WorkRate[];
  }catch{if(token===this.token)this.error='Could not calculate planned work cost. Refresh and retry.';}
  finally{if(token===this.token){this.loading=false;this.cdr?.markForCheck();}}
 }
 rows(template:ShopTemplate,painted=false):PlannedWorkRow[]{const productName=this.product?.product_name||'',structural=Object.fromEntries(Object.entries(template.estimates||{}).filter(([key])=>!key.startsWith('Painting:'))),estimates={...structural,...(painted?this.product?.backdrop_paint_profile?.estimates||{}:{})},rows=plannedWorkRows({...template,estimates},this.rates,productName);return painted?rows:rows.filter(row=>!paintOperations(productName).includes(row.key));}total(template:ShopTemplate,painted:boolean){return plannedTotal(this.rows(template,painted),painted);}
}
