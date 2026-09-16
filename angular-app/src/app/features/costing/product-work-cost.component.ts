import {CommonModule} from '@angular/common';
import {Component,Input,OnChanges,SimpleChanges,ChangeDetectorRef,Optional} from '@angular/core';
import {SupabaseService} from '../../core/services/supabase.service';
import {BACKDROP_PAINT_OPERATIONS,ShopTemplate} from '../shop-floor/shop-floor.models';
import {PlannedWorkRow,WorkRate,plannedTotal,plannedWorkRows} from './planned-work-cost';
import {backdropFinishModes,productionCostRows,foldingLabel,templateVariantLabel} from './production-cost';

@Component({selector:'app-product-work-cost',standalone:true,imports:[CommonModule],template:`
 <h3>{{hasFolding?'Production cost':'Planned work cost'}} · incl. GST</h3><p class="mut">Calculated from @if(hasFolding){saved materials, }Estimated min and shared hourly rates. Raw excludes painting. Repaint is unplanned and excluded.</p>
 @if(loading){<p>Loading planned work cost…</p>}@else if(error){<p class="error" role="alert">{{error}}</p>}@else{
  @if(hasFolding){
   <p class="mut">One product-wide cost per construction. Sizes reuse it. Painting materials and minutes are shared by Foldable and Non-foldable.</p>
   <div class="comparison table-wrap"><table aria-label="Production cost comparison"><thead><tr><th>Construction</th><th>Finish</th><th>Materials</th><th>Work</th><th>Total</th><th>Status</th></tr></thead><tbody>
    @for(row of comparison();track row.folding+row.painted){<tr><td>{{foldingLabel(row.folding)}}</td><td>{{row.painted?'Painted':'Raw'}}</td><td>{{row.materials==null?'—':(row.materials|currency:'AUD')}}</td><td>{{row.work==null?'—':(row.work|currency:'AUD')}}</td><td><b>{{row.total==null?'Incomplete':(row.total|currency:'AUD')}}</b></td><td>{{row.issues.join('; ')||'Ready'}}</td></tr>}
    @empty{<tr><td colspan="6">Production cost is not configured.</td></tr>}
   </tbody></table></div>
  }
  @for(template of displayTemplates();track template.id){<details class="template" [open]="!hasFolding"><summary>{{template.name}}@if(hasFolding){ · {{foldingLabel(template.folding)}}}</summary><div class="table-wrap"><table><thead><tr><th>Stage / operation</th><th>Minutes</th><th>Rate / hour</th><th>Cost</th></tr></thead><tbody>
   @for(row of rows(template);track row.key){<tr><td>{{row.label}}</td><td>{{row.minutes==null?'Not set':row.minutes}}</td><td>{{row.rate==null?'Rate required':(row.rate|currency:'AUD')}}</td><td>{{row.cost==null?'—':(row.cost|currency:'AUD')}}</td></tr>}
  </tbody></table></div><div class="totals">@if(hasFolding){<span>Structural work <b>{{total(template,false)==null?'Incomplete':(total(template,false)|currency:'AUD')}}</b></span>}@else{<span>Raw work <b>{{total(template,false)==null?'Incomplete':(total(template,false)|currency:'AUD')}}</b></span><span>Painted work <b>{{total(template,true)==null?'Incomplete':(total(template,true)|currency:'AUD')}}</b></span>}</div></details>}
  @empty{<p>No parts template yet. Add it in Estimated min.</p>}
 }
 `,styles:[`:host{display:block}.mut{color:var(--wc-muted);font-size:.875rem}.template{border-top:1px solid var(--wc-border);margin-top:14px;padding-top:10px}.table-wrap{overflow:auto}.comparison{background:white;border:1px solid var(--wc-border);border-radius:12px;margin-top:14px}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px;border-bottom:1px solid var(--wc-border)}.totals{display:flex;gap:18px;flex-wrap:wrap;padding:12px 0}.error{color:var(--p-red-600)}`]})
export class ProductWorkCostComponent implements OnChanges{
 @Input() product:any;@Input() sizes:string[]=[];@Input() selectedSize='';@Input() manualSizes=false;@Input() materialProfiles:any[]=[];@Input() materials:any[]=[];templates:ShopTemplate[]=[];rates:WorkRate[]=[];loading=false;error='';private token=0;
 foldingLabel=foldingLabel;variantLabel=templateVariantLabel;
 get hasFolding(){return String(this.product?.product_type||'').toLowerCase()==='backdrop'||/backdrop/i.test(this.product?.product_name||'');}
 get isSizedCart(){return String(this.product?.product_type||'').trim().toLowerCase()==='cart'&&!!this.selectedSize;}
 finishModes(){return backdropFinishModes(this.product,this.materialProfiles.map(profile=>profile.options));}
 displayTemplates(){return this.hasFolding?(['foldable','nonfoldable'] as const).flatMap(fold=>{const shared=this.templates.find(t=>!t.size_key&&t.folding===fold);if(shared)return[shared];const legacy=this.templates.filter(t=>t.folding===fold);return legacy.length===1?[legacy[0]]:[];}):this.templates;}
 comparison(){return productionCostRows(this.templates,this.materialProfiles,this.product?.backdrop_paint_profile,this.materials,this.rates,this.product.product_name,this.product.id,this.finishModes());}
 constructor(private db:SupabaseService,@Optional() private cdr?:ChangeDetectorRef){}
 ngOnChanges(changes:SimpleChanges){const p=changes['product'];if((p&&(p.firstChange||p.previousValue?.id!==p.currentValue?.id||p.previousValue?.saved_only!==p.currentValue?.saved_only))||changes['selectedSize'])void this.load();}
 async load(){const id=this.product?.id,token=++this.token;this.templates=[];this.rates=[];this.error='';this.loading=false;if(!id||this.product.saved_only)return;this.loading=true;
  try{const [templates,rates]=await Promise.all([this.db.client.from('wc_shop_templates').select('*').eq('product_id',id).order('name'),this.db.client.from('wc_work_rates').select('*').order('sort_order')]);
   if(token!==this.token)return;if(templates.error||rates.error)throw Error('Could not calculate planned work cost.');this.templates=((templates.data||[]) as ShopTemplate[]).filter(t=>!this.isSizedCart||t.size_key===this.selectedSize);this.rates=(rates.data||[]) as WorkRate[];
  }catch{if(token===this.token)this.error='Could not calculate planned work cost. Refresh and retry.';}
  finally{if(token===this.token){this.loading=false;this.cdr?.markForCheck();}}
 }
 rows(template:ShopTemplate):PlannedWorkRow[]{const rows=plannedWorkRows(template,this.rates,this.product?.product_name||'');return this.hasFolding?rows.filter(row=>!BACKDROP_PAINT_OPERATIONS.includes(row.key)):rows;}total(template:ShopTemplate,painted:boolean){return plannedTotal(this.rows(template),painted);}
}
