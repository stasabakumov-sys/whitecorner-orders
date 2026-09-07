import { Component, computed, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DeliveryReviewService } from '../../core/services/delivery-review.service';
import { deliveryCents, packagingError, PackageComponent, ReviewPackage } from '../../../../../supabase/functions/_shared/delivery-review-domain';

@Component({
 selector:'app-delivery-review',standalone:true,imports:[CommonModule,FormsModule],
 template:`
 <header><div><h1>Delivery Cost Review</h1><p>One saved estimate per order. Target: delivery including insurance ≤ 90% of the invoice delivery charge.</p></div>
 <button (click)="reload()" [disabled]="s.loading()||s.busy()">Refresh saved data</button></header>
 <div class="notice">All courier quotes are saved. Only Aramex, Couriers Please and FedEx count toward the target. Opening this report never requests a new quote.</div>
 @if(s.error()){<p class="error" role="alert">{{s.error()}}</p>}
 <div class="toolbar"><label>Show <select [(ngModel)]="filter"><option value="all">All orders</option><option value="attention">Needs attention</option><option value="within_target">Within target</option><option value="approved_exception">Approved exceptions</option><option value="packaging_required">Packaging required</option></select></label>
 <span>{{visible().length}} orders</span></div>
 <div class="table-wrap"><table><thead><tr><th>Order / Customer</th><th>Invoice delivery</th><th>Best + insurance</th><th>Carrier / Service</th><th>Required increase</th><th>Status</th><th>Saved</th><th></th></tr></thead><tbody>
 @for(row of visible();track row.order_id){@let result=s.outcome(row);<tr>
 <td><b>#{{row.wc_orders?.order_number}}</b><small>{{row.wc_orders?.customer_name}}</small></td>
 <td>{{money(invoice(row))}}</td><td>{{money(result.best?.total_cents)}}</td>
 <td>{{result.best?.quote?.courierName||'—'}}<small>{{result.best?.quote?.name}}</small></td>
 <td>{{money(increase(row))}}</td><td><span class="badge" [attr.data-status]="result.status">{{label(result.status)}}</span></td>
 <td>{{row.quoted_at?(row.quoted_at|date:'dd MMM yyyy, HH:mm'):'—'}}</td><td><button (click)="open(row)">View / Packaging</button></td>
 </tr>}@empty{<tr><td colspan="8">{{s.loading()?'Loading…':'No new delivery orders to review.'}}</td></tr>}
 </tbody></table></div>
 @if(selected();as row){@let result=s.outcome(row);
 <div class="overlay"><section class="drawer" role="dialog" aria-modal="true" aria-labelledby="review-title">
 <header><div><h2 id="review-title">Delivery estimate · #{{row.wc_orders?.order_number}}</h2><span class="badge" [attr.data-status]="result.status">{{label(result.status)}}</span></div><button (click)="selectedId.set(null)" [disabled]="s.busy()">Close</button></header>
 @if(row.error){<p class="error">{{row.error}}</p>}
 @if(s.error()){<p class="error" role="alert">{{s.error()}}</p>}
 @if(result.status==='data_changed'){<p class="error">Order inputs changed after the saved estimate. Review manually; a second quote will not be requested by this report.</p>}
 @if(result.status==='address_required'){<p>Complete the delivery address in Wix and synchronize Orders. The estimate has not been requested yet.</p>}
 @if(row.quote_attempted_at){
 <div class="summary"><div>Invoice delivery<b>{{money(invoice(row))}}</b></div><div>Lowest eligible total<b>{{money(result.best?.total_cents)}}</b></div><div>Minimum invoice delivery<b>{{money(result.minimum_invoice_cents)}}</b></div><div>Margin<b>{{margin(row)}}</b></div></div>
 <p>Requested {{row.quote_attempted_at|date:'dd MMM yyyy, HH:mm'}}. This snapshot is kept for reference and never triggers another request. Actual booking prices must be checked in Fulfilment.</p>
 <h3>All saved courier quotes</h3>
 <div class="table-wrap"><table><thead><tr><th>Carrier / Service</th><th>Quote incl. GST</th><th>Insurance</th><th>Total</th><th>Assessment</th></tr></thead><tbody>
 @for(q of row.evaluated_quotes;track $index){<tr><td>{{q.quote.courierName||'Unknown'}}<small>{{q.quote.name}}</small></td><td>{{money(q.price_cents)}}</td><td>{{money(q.insurance_fee_cents)}}</td><td>{{money(q.total_cents)}}</td><td>{{q.eligible?'Eligible':q.reason}}@if(q.quote.notice?.body){<details><summary>Carrier conditions</summary><p>{{q.quote.notice.body}}</p></details>}</td></tr>}
 @empty{<tr><td colspan="5">No quotes were returned or the response could not be saved. No automatic retry.</td></tr>}
 </tbody></table></div>
 <details><summary>Saved request, full response and insurance options</summary><pre>{{ {request:row.request,response:row.response,insurance:row.insurance_response,assumptions:row.snapshot?.assumptions}|json }}</pre></details>
 @if(result.status==='price_review_required'){
 <div class="notice">Increase delivery in Wix by at least {{money(increase(row))}}, or approve an exception below. A Wix price update reuses this saved quote.</div>
 <label>Reason for accepting the current price<textarea [(ngModel)]="reason" maxlength="2000"></textarea></label>
 <button (click)="approve(row)" [disabled]="s.busy()||reason.trim().length<3">{{s.busy()?'Saving…':'Approve current delivery price'}}</button>
 }
 @if(row.approval_history?.length){<h3>Approval history</h3>@for(a of row.approval_history;track $index){<p>{{a.at|date:'dd MMM yyyy, HH:mm'}} · {{a.reason}} · {{money(a.invoice_cents)}}<small>Approved by {{a.actor}}</small></p>}}
 }
 <h3>Packaging</h3>
 @if(!row.quote_attempted_at&&['pending','packaging_required','legacy_packaging_required','address_required'].includes(row.state)){
 <p>Assign every required component. A component can be present in more than one box. Dimensions are in millimetres; weight is in kilograms.</p>
 @for(p of draft;track $index;let i=$index){<fieldset><legend>Package {{i+1}}</legend><div class="package-fields">
 <label>Name<input [(ngModel)]="p.package_name" [name]="'name'+i" /></label>
 <label>Length mm<input type="number" min="1" [(ngModel)]="p.length_mm" /></label><label>Width mm<input type="number" min="1" [(ngModel)]="p.width_mm" /></label><label>Height mm<input type="number" min="1" [(ngModel)]="p.height_mm" /></label><label>Weight kg<input type="number" min="0.001" step="0.1" [(ngModel)]="p.weight_kg" /></label></div>
 <div class="components">@for(c of s.components(row);track c.id){<label><input type="checkbox" [checked]="assigned(p,c)" (change)="toggle(p,c,$event)" />{{c.component_name}} · Unit {{c.unit_index}}</label>}</div>
 <button (click)="draft.splice(i,1)" [disabled]="s.busy()">Remove box</button></fieldset>}
 <button (click)="addBox()" [disabled]="s.busy()">Add box</button>
 @if(packagingIssue(row)){<p class="error">{{packagingIssue(row)}}</p>}
 <label class="check"><input type="checkbox" [(ngModel)]="saveProfile" />Save packaging for the next identical order</label>
 <label class="check"><input type="checkbox" [(ngModel)]="confirmed" />I confirm these boxes and component assignments for the one-time estimate.</label>
 <button class="primary" (click)="save(row)" [disabled]="s.busy()||!!packagingIssue(row)||!confirmed">{{s.busy()?'Saving and calculating…':'Save packaging and calculate once'}}</button>
 }@else{
 @for(p of row.packages;track $index){<p><b>{{p.package_name}}</b> · {{p.length_mm}} × {{p.width_mm}} × {{p.height_mm}} mm · {{p.weight_kg}} kg</p><ul>@for(c of p.contents;track $index){<li>{{c.component_name}} · Unit {{c.unit_index}}</li>}</ul>}
 }
 </section></div>}
 `,
 styleUrl:'./delivery-review.component.css',
})
export class DeliveryReviewComponent implements OnInit {
 filter='all';selectedId=signal<string|null>(null);reason='';draft:ReviewPackage[]=[];saveProfile=true;confirmed=false;
 selected=computed(()=>this.s.rows().find(r=>r.order_id===this.selectedId())||null);
 constructor(public s:DeliveryReviewService){}
 ngOnInit(){void this.s.load();}
 visible(){
  const resolved=(r:any)=>['within_target','approved_exception'].includes(this.s.outcome(r).status);
  return this.s.rows().filter(r=>{
   const status=this.s.outcome(r).status;
   if(this.filter==='all')return true;
   if(this.filter==='attention')return !resolved(r);
   if(this.filter==='packaging_required')return ['packaging_required','legacy_packaging_required'].includes(status);
   return status===this.filter;
  }).sort((a,b)=>Number(resolved(a))-Number(resolved(b)));
 }
 async reload(){this.s.error.set('');await this.s.load();}
 open(row:any){this.selectedId.set(row.order_id);this.draft=structuredClone(row.packages||[]);this.reason='';this.confirmed=false;this.s.error.set('');}
 addBox(){this.draft.push({package_name:`Package ${this.draft.length+1}`,length_mm:0,width_mm:0,height_mm:0,weight_kg:0,contents:[]});this.confirmed=false;}
 assigned(p:ReviewPackage,c:PackageComponent){return p.contents.some(x=>x.id===c.id);}
 toggle(p:ReviewPackage,c:PackageComponent,event:Event){if((event.target as HTMLInputElement).checked){if(!this.assigned(p,c))p.contents.push(c);}else p.contents=p.contents.filter(x=>x.id!==c.id);this.confirmed=false;}
 packagingIssue(row:any){return packagingError(this.draft,this.s.components(row));}
 invoice(row:any){return deliveryCents(row.wc_orders);}
 increase(row:any){const min=this.s.outcome(row).minimum_invoice_cents,invoice=this.invoice(row);return min==null||invoice==null?null:Math.max(0,min-invoice);}
 margin(row:any){const invoice=this.invoice(row),best=this.s.outcome(row).best;return invoice&&best?`${((invoice-best.total_cents)/invoice*100).toFixed(1)}% (${this.money(invoice-best.total_cents)})`:'—';}
 money(value:number|null|undefined){return value==null?'—':new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(value/100);}
 label(status:string){return ({importing:'Awaiting import',pending:'Awaiting calculation',packaging_required:'Packaging required',legacy_packaging_required:'Packaging required',address_required:'Address required',calculating:'Calculating',within_target:'Within target',price_review_required:'Price review required',approved_exception:'Approved exception',no_eligible_quotes:'No eligible quotes',failed:'Calculation failed',uncertain:'Response uncertain',data_changed:'Inputs changed — manual review',invoice_required:'Invoice delivery required'} as Record<string,string>)[status]||status;}
 async save(row:any){if(!this.confirmed||this.packagingIssue(row))return;await this.s.savePackages(row.order_id,this.draft,this.saveProfile);}
 async approve(row:any){await this.s.approve(row.order_id,this.reason);}
}
