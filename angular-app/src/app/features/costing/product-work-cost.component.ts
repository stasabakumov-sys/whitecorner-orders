import {CommonModule} from '@angular/common';
import {Component,Input,OnChanges,ChangeDetectorRef,Optional} from '@angular/core';
import {SupabaseService} from '../../core/services/supabase.service';
import {ShopTemplate} from '../shop-floor/shop-floor.models';
import {PlannedWorkRow,WorkRate,plannedTotal,plannedWorkRows} from './planned-work-cost';

@Component({selector:'app-product-work-cost',standalone:true,imports:[CommonModule],template:`
 <h3>Planned work cost · incl. GST</h3><p class="mut">Calculated from Estimated min and the shared hourly rates. Repaint is an unplanned actual operation and is excluded.</p>
 @if(loading){<p>Loading planned work cost…</p>}@else if(error){<p class="error" role="alert">{{error}}</p>}@else{
  @for(template of templates;track template.id){<section class="template"><h4>{{template.name}}</h4><div class="table-wrap"><table><thead><tr><th>Stage / operation</th><th>Minutes</th><th>Rate / hour</th><th>Cost</th></tr></thead><tbody>
   @for(row of rows(template);track row.key){<tr><td>{{row.label}}</td><td>{{row.minutes==null?'Not set':row.minutes}}</td><td>{{row.rate==null?'Rate required':(row.rate|currency:'AUD')}}</td><td>{{row.cost==null?'—':(row.cost|currency:'AUD')}}</td></tr>}
  </tbody></table></div><div class="totals"><span>Raw work <b>{{total(template,false)==null?'Incomplete':(total(template,false)|currency:'AUD')}}</b></span><span>Painted work <b>{{total(template,true)==null?'Incomplete':(total(template,true)|currency:'AUD')}}</b></span></div></section>}
  @empty{<p>No parts template yet. Add it in Estimated min.</p>}
 }
 `,styles:[`:host{display:block}.mut{color:var(--wc-muted);font-size:.875rem}.template{border-top:1px solid var(--wc-border);margin-top:14px;padding-top:10px}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px;border-bottom:1px solid var(--wc-border)}.totals{display:flex;gap:18px;flex-wrap:wrap;padding:12px 0}.error{color:var(--p-red-600)}`]})
export class ProductWorkCostComponent implements OnChanges{
 @Input() product:any;templates:ShopTemplate[]=[];rates:WorkRate[]=[];loading=false;error='';private token=0;
 constructor(private db:SupabaseService,@Optional() private cdr?:ChangeDetectorRef){}
 ngOnChanges(){void this.load();}
 async load(){const id=this.product?.id,token=++this.token;this.templates=[];this.rates=[];this.error='';this.loading=false;if(!id||this.product.saved_only)return;this.loading=true;
  try{const [templates,rates]=await Promise.all([this.db.client.from('wc_shop_templates').select('*').eq('product_id',id).order('name'),this.db.client.from('wc_work_rates').select('*').order('sort_order')]);
   if(token!==this.token)return;if(templates.error||rates.error)throw Error('Could not calculate planned work cost.');this.templates=(templates.data||[]) as ShopTemplate[];this.rates=(rates.data||[]) as WorkRate[];
  }catch{if(token===this.token)this.error='Could not calculate planned work cost. Refresh and retry.';}
  finally{if(token===this.token){this.loading=false;this.cdr?.markForCheck();}}
 }
 rows(template:ShopTemplate):PlannedWorkRow[]{return plannedWorkRows(template,this.rates,this.product?.product_name||'');}total(template:ShopTemplate,painted:boolean){return plannedTotal(this.rows(template),painted);}
}
