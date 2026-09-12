import {ProductLinkComponent} from '../../shared/product-link/product-link.component';
import { Component, computed, OnInit, signal, Optional } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DeliveryReviewService } from '../../core/services/delivery-review.service';
import { isNonPackagingComponent, cents, deliveryCents, orderItemOptionLabels, reviewItems, packagingError, PackageComponent, ReviewPackage } from '../../../../../supabase/functions/_shared/delivery-review-domain';
import {orderProducts} from '../../core/utils/order-products';

@Component({
 selector:'app-delivery-review',standalone:true,imports:[ProductLinkComponent,CommonModule,FormsModule],
 template:`
 <header><div><h1>Delivery Cost Review</h1><p>Saved estimates per order, with explicit recalculation after packaging corrections. Target: delivery including insurance ≤ 90% of the invoice delivery charge. Amounts include GST.</p></div>
 <button (click)="reload()" [disabled]="s.loading()||s.busy()">Refresh saved data</button></header>
 <div class="notice">All courier quotes are saved. Only Aramex, Couriers Please and FedEx count toward the target. Opening this report never requests a new quote.</div>
 @if(s.error()){<p class="error" role="alert">{{s.error()}}</p>}
 <div class="toolbar"><label>Show <select [(ngModel)]="filter"><option value="all">All orders</option><option value="attention">Needs attention</option><option value="within_target">Within target</option><option value="approved_exception">Approved exceptions</option><option value="approved_without_quote">Approved without quote</option><option value="packaging_required">Packaging required</option></select></label>
 <span>{{visible().length}} orders</span></div>
 <div class="table-wrap"><table class="order-table"><thead><tr><th>Order / Customer</th><th aria-label="Order total incl. GST">Order total <small>incl. GST</small></th><th aria-label="Invoice delivery incl. GST">Invoice delivery <small>incl. GST</small></th><th>Best + insurance</th><th>Carrier / Service</th><th>Required increase</th><th>Margin</th><th>Status</th><th>Saved</th><th></th></tr></thead><tbody>
 @for(row of visible();track row.order_id){@let result=s.outcome(row);<tr>
 <td><b class="order-no">#{{row.wc_orders?.order_number}}</b><small>{{row.wc_orders?.customer_name}}</small></td>
 <td>{{money(orderTotal(row))}}</td><td>{{money(invoice(row))}}</td><td>{{money(result.best?.total_cents)}}</td>
 <td>{{result.best?.quote?.courierName||'—'}}<small>{{result.best?.quote?.name}}</small></td>
 <td>{{money(increase(row))}}</td><td class="margin-cell"><span class="margin-badge" [attr.data-tone]="marginTone(row)">{{margin(row)}}</span></td><td><span class="badge" [attr.data-status]="result.status">{{label(result.status)}}</span></td>
 <td>@if(row.quoted_at){<span class="saved-date">{{row.quoted_at|date:'dd MMM yyyy'}}</span><span class="saved-time">{{row.quoted_at|date:'HH:mm'}}</span>}@else{—}</td><td><button (click)="open(row)">View / Packaging</button></td>
 </tr>}@empty{<tr><td colspan="10">{{s.loading()?'Loading…':'No new delivery orders to review.'}}</td></tr>}
 </tbody></table></div>
 @if(selected();as row){@let result=s.outcome(row);
 <div class="overlay"><section class="drawer" role="dialog" aria-modal="true" aria-labelledby="review-title">
 <header><div><h2 id="review-title">Delivery estimate · #{{row.wc_orders?.order_number}}</h2><span class="badge" [attr.data-status]="result.status">{{label(result.status)}}</span></div><button (click)="selectedId.set(null)" [disabled]="s.busy()">Close</button></header>
 @if(row.error){<p class="error">{{row.error}}</p>}
 @if(s.error()){<p class="error" role="alert">{{s.error()}}</p>}
 @if(result.status==='data_changed'){<p class="error">Order inputs changed after the saved estimate. Correct the packaging and explicitly request a new estimate when needed.</p>}
 @if(result.status==='address_required'){<p>Complete the delivery address in Wix and synchronize Orders. The estimate has not been requested yet.</p>}
 @if(result.status==='approved_without_quote'){
 <p class="notice">Production approved without a quote. Actual packaging and a valid insured quote are still required before booking.</p>
 }@else if(canApproveWithoutQuote(row)){
 <section class="notice">
 <h3>Approve without quote</h3>
 <p>For a first-time product with unknown packaging, accept the unknown delivery cost to release production. This does not request a quote or create a booking.</p>
 <label>Reason<textarea [(ngModel)]="reason" maxlength="2000" placeholder="First production run; packaging will be measured after manufacture"></textarea></label>
 <label class="check"><input type="checkbox" [(ngModel)]="acceptUnknownCost" />I accept the risk of unknown delivery cost for this order.</label>
 <button (click)="approveWithoutQuote(row)" [disabled]="s.busy()||!acceptUnknownCost||reason.trim().length<3">{{s.busy()?'Saving…':'Approve without quote'}}</button>
 </section>
 }
 @if(row.approval_history?.length){<h3>Approval history</h3>@for(a of row.approval_history;track $index){<p>{{a.at|date:'dd MMM yyyy, HH:mm'}} · {{a.kind==='without_quote'?'Approved without quote':'Price exception'}} · {{a.reason}}<small>Approved by {{a.actor}}</small></p>}}
 <div class="address"><b>Delivery address:</b> {{address(row.wc_orders?.delivery_address)}}</div>
 <h3>Order composition &amp; packaging</h3>
 @if(canRequote(row)&&!revising){<button (click)="startRevision(row)" [disabled]="s.busy()">Edit packaging and recalculate</button>}
 @if(revising){<p class="notice">Correct the boxes below. Saving requests one new estimate and archives the previous result. It does not book a shipment.</p><button (click)="cancelRevision(row)" [disabled]="s.busy()">Cancel changes</button>}
 <p>Assign packaging under each product. All {{packages(row).length}} boxes are sent together in one delivery quote for this order.</p>
 @for(item of composition(row).unresolved;track item.id){<p role="alert">Composition review required: cannot assign {{item.product_name}} to a product. Its packaging components remain available below.</p>}
 @for(group of productGroups(row);track group.id){
 <section class="product-group" [attr.data-product-id]="group.id">
 <div class="product-card">
 @if(group.item;as item){
 @if(image(item)){<img [src]="image(item)" [alt]="item.product_name||'Product'" loading="lazy" />}
 <div class="product-description"><b><app-product-link [item]="item" /></b><div class="chips"><span>qty: {{item.quantity||1}}</span>@for(option of options(item);track option){<span>{{option}}</span>}</div></div>
 <span class="product-price">{{money(productTotal(item))}}</span>
 }@else{<b>Unassigned packaging — select its contents</b>}
 </div>
 <div class="product-packages"><h4>{{group.boxes.length}} package(s)</h4>
 @for(source of group.sources;track source.id){
 @if(group.sources.length>1){<p><b><app-product-link [item]="source" /></b> · qty: {{source.quantity}}</p>}
 @if(editable(row)){<button [disabled]="s.busy()||variantLoading" (click)="configureVariant(source)">Configure packaging variant</button> <button [disabled]="s.busy()||variantLoading" (click)="loadVariant(source)">Load saved variant</button>
 @if(variantNotices()[source.id]){<p role="status">{{variantNotices()[source.id]}}</p>}}}
 @for(p of group.boxes;track p){
 <fieldset class="package-card" [disabled]="s.busy()"><legend>Package {{packageNumber(row,p)}}</legend>
 @if(editable(row)){
 <div class="package-fields"><label>Name<input [(ngModel)]="p.package_name" (ngModelChange)="confirmed=false" /></label>
 <label>L mm<input type="number" min="1" [(ngModel)]="p.length_mm" (ngModelChange)="confirmed=false" /></label><label>W mm<input type="number" min="1" [(ngModel)]="p.width_mm" (ngModelChange)="confirmed=false" /></label><label>H mm<input type="number" min="1" [(ngModel)]="p.height_mm" (ngModelChange)="confirmed=false" /></label><label>kg<input type="number" min="0.001" step="0.1" [(ngModel)]="p.weight_kg" (ngModelChange)="confirmed=false" /></label></div>
 }@else{<p><b>{{p.package_name}}</b> · {{p.length_mm}} × {{p.width_mm}} × {{p.height_mm}} mm · {{p.weight_kg}} kg</p>}
 <b>Assigned components:</b><ul>@for(c of p.contents;track c.id){<li>{{c.component_name}} · Unit {{c.unit_index}}</li>}@empty{<li>No components assigned</li>}</ul>
 @if(sharedBox(p)){<small>Shared box containing components from multiple products. Counted once in the order quote.</small>}
 @if(editable(row)){
 <details class="contents"><summary>Contents ({{p.contents.length}})</summary><div class="components">
 @for(c of s.components(row);track c.id){<label><input type="checkbox" [checked]="assigned(p,c)" (change)="toggle(p,c,$event)" />{{c.component_name}} · Unit {{c.unit_index}}<small>{{componentProduct(row,c)}}</small></label>}
 </div></details>
 <button (click)="removeBox(p)" [disabled]="s.busy()">Remove box</button>
 }
 </fieldset>
 }@empty{<p class="empty-packages">No packaging assigned to this product yet.</p>}
 @if(editable(row)&&group.item){<button (click)="addBox(group.sources[0].id)" [disabled]="s.busy()">Add box</button>}
 @for(p of linkedBoxes(row,group.id);track p){<p class="shared-link">Also in shared package {{packageNumber(row,p)}}: {{p.package_name}} (shown under another product; counted once).</p>}
 </div></section>
 }
 @if(editable(row)){
 @if(packagingIssue(row)){<p class="error">{{packagingIssue(row)}}</p>}
 <label class="check"><input type="checkbox" [(ngModel)]="saveProfile" />Save packaging for the next identical order</label>
 <label class="check"><input type="checkbox" [(ngModel)]="confirmed" />I confirm all {{draft.length}} boxes and component assignments for this order's {{revising?'new':'initial'}} estimate.</label>
 <button class="primary" (click)="save(row)" [disabled]="s.busy()||!!packagingIssue(row)||!confirmed">{{s.busy()?'Saving and calculating…':(revising?'Save packaging and recalculate':'Save packaging and calculate once')}}</button>
 }
 @if(row.quote_attempted_at){
 <div class="summary"><div>Invoice delivery incl. GST<b>{{money(invoice(row))}}</b></div><div>Lowest eligible total<b>{{money(result.best?.total_cents)}}</b></div><div>Minimum invoice delivery incl. GST<b>{{money(result.minimum_invoice_cents)}}</b></div><div>Margin<b>{{margin(row)}}</b></div></div>
 <p>Requested {{row.quote_attempted_at|date:'dd MMM yyyy, HH:mm'}}. This snapshot is kept for reference. Only an explicit packaging correction can request another estimate. Actual booking prices must be checked in Fulfilment.</p>
 <h3>Current courier quotes</h3>
 <div class="table-wrap"><table><thead><tr><th>Carrier / Service</th><th>Quote incl. GST</th><th>Insurance</th><th>Total</th><th>Assessment</th></tr></thead><tbody>
 @for(q of row.evaluated_quotes;track $index){<tr><td>{{q.quote.courierName||'Unknown'}}<small>{{q.quote.name}}</small></td><td>{{money(q.price_cents)}}</td><td>{{money(q.insurance_fee_cents)}}</td><td>{{money(q.total_cents)}}</td><td>{{q.eligible?'Eligible':q.reason}}@if(q.quote.notice?.body){<details><summary>Carrier conditions</summary><p>{{q.quote.notice.body}}</p></details>}</td></tr>}
 @empty{<tr><td colspan="5">No quotes were returned or the response could not be saved. No automatic retry.</td></tr>}
 </tbody></table></div>
 <details><summary>Saved request, full response and insurance options</summary><pre>{{ {request:row.request,response:row.response,insurance:row.insurance_response,assumptions:row.snapshot?.assumptions}|json }}</pre></details>
 @if(result.status==='price_review_required'&&!revising){
 <div class="notice">Increase delivery in Wix by at least {{money(increase(row))}}, or approve an exception below. A Wix price update reuses this saved quote.</div>
 <label>Reason for accepting the current price<textarea [(ngModel)]="reason" maxlength="2000"></textarea></label>
 <button (click)="approve(row)" [disabled]="s.busy()||reason.trim().length<3">{{s.busy()?'Saving…':'Approve current delivery price'}}</button>
 }
 }
 @if(row.attempt_history?.length){<h3>Previous estimates</h3>@for(attempt of row.attempt_history;track $index){<details><summary>Attempt {{$index+1}} · {{attempt.quote_attempted_at||attempt.updated_at|date:'dd MMM yyyy, HH:mm'}} · {{label(attempt.state)}}</summary><p>Superseded {{attempt.superseded_at|date:'dd MMM yyyy, HH:mm'}}</p><pre>{{{packages:attempt.packages,request:attempt.request,response:attempt.response,error:attempt.error}|json}}</pre></details>}}
 </section></div>}
 `,
 styleUrl:'./delivery-review.component.css',
})
export class DeliveryReviewComponent implements OnInit {
 variantLoading=false;
 variantNotices=signal<Record<string,string>>({});
 async configureVariant(item:any){
  if(this.variantLoading||this.s.busy())return;
  this.variantLoading=true;const selected=this.selectedId();
  this.variantNotices.update(messages=>({...messages,[item.id]:''}));
  try{const target=await this.s.variantTarget(item,this.selected()?.wc_orders);if(this.selectedId()===selected)await this.router?.navigate(['/shipping-data'],{queryParams:target.productId?{productId:target.productId,variant:target.signature}:{product:target.productName,savedProfile:target.signature}});}
  catch(e:any){this.variantNotices.update(messages=>({...messages,[item.id]:e.message}));}
  finally{this.variantLoading=false;}
 }
 async loadVariant(item:any){
  if(this.variantLoading||this.s.busy())return;
  if(this.draft.some(p=>p.contents.some(c=>c.order_item_id===item.id)&&new Set(p.contents.map(c=>c.order_item_id)).size>1)){this.s.error.set('A box is shared with another product. Adjust its contents manually before loading a variant.');return;}
  this.variantLoading=true;this.s.error.set('');
  try{const boxes=await this.s.variantPackages(item);this.draft=[...this.draft.filter(p=>this.owner(p)!==item.id),...boxes];for(const p of boxes)this.boxOwners.set(p,item.id);this.confirmed=false;}
  catch(e:any){this.s.error.set(e.message);}finally{this.variantLoading=false;}
 }

 acceptUnknownCost=false;
 private boxOwners=new WeakMap<ReviewPackage,string>();
 filter='all';selectedId=signal<string|null>(null);reason='';draft:ReviewPackage[]=[];saveProfile=true;confirmed=false;
 selected=computed(()=>this.s.rows().find(r=>r.order_id===this.selectedId())||null);
 constructor(public s:DeliveryReviewService, @Optional() private route?:ActivatedRoute,@Optional() private router?:Router){}
 ngOnInit(){void this.s.load().then(()=>{const number=this.route?.snapshot.queryParamMap.get('order');if(number){const row=this.s.rows().find(r=>String(r.wc_orders?.order_number)===number);if(row)this.open(row);}});}
 visible(){
  const resolved=(r:any)=>['within_target','approved_exception','approved_without_quote'].includes(this.s.outcome(r).status);
  return this.s.rows().filter(r=>{
   const status=this.s.outcome(r).status;
   if(this.filter==='all')return true;
   if(this.filter==='attention')return !resolved(r);
   if(this.filter==='packaging_required')return ['packaging_required','legacy_packaging_required'].includes(status);
   return status===this.filter;
  }).sort((a,b)=>String(b.wc_orders?.order_number||'').localeCompare(String(a.wc_orders?.order_number||''),'en',{numeric:true})||String(a.order_id).localeCompare(String(b.order_id)));
 }
 async reload(){this.s.error.set('');await this.s.load();}
 revising=false;revisionVersion='';
 canRequote(row:any){return !row.token&&['failed','quoted','uncertain'].includes(row.state);}
 startRevision(row:any){if(!this.canRequote(row)||this.s.busy())return;this.open(row);this.revising=true;this.revisionVersion=row.updated_at;}
 cancelRevision(row:any){this.open(row);}
 open(row:any){this.revising=false;this.revisionVersion='';this.acceptUnknownCost=false;this.selectedId.set(row.order_id);this.draft=structuredClone(row.packages||[]).map((p:ReviewPackage)=>({...p,contents:p.contents.filter(c=>!isNonPackagingComponent(c))}));this.boxOwners=new WeakMap();for(const p of this.draft)this.boxOwners.set(p,p.contents[0]?.order_item_id||'');this.reason='';this.confirmed=false;this.s.error.set('');}
 editable(row:any){return (this.revising&&this.canRequote(row))||!row.quote_attempted_at&&['pending','packaging_required','legacy_packaging_required','address_required','approved_without_quote'].includes(row.state);}
 canApproveWithoutQuote(row:any){return !this.revising&&!row.quote_attempted_at&&!row.token&&['pending','packaging_required','legacy_packaging_required','address_required','failed','approved_without_quote'].includes(row.state);}
 async approveWithoutQuote(row:any){if(this.canApproveWithoutQuote(row)&&this.acceptUnknownCost&&this.reason.trim().length>=3&&!this.s.busy())await this.s.approveWithoutQuote(row.order_id,this.reason);}
 packageNumbers=new WeakMap<ReviewPackage,number>();
 packages(row:any):ReviewPackage[]{const boxes=this.editable(row)?this.draft:(row.packages||[]).map((p:ReviewPackage)=>({...p,contents:(p.contents||[]).filter(c=>!isNonPackagingComponent(c))}));boxes.forEach((p:ReviewPackage,i:number)=>this.packageNumbers.set(p,i+1));return boxes;}
 owner(p:ReviewPackage){return this.boxOwners.get(p)||p.contents[0]?.order_item_id||'';}
 composition(row:any){return orderProducts(row.wc_orders?.wc_order_items||[]);}
 productGroups(row:any){
  const items=reviewItems(row.wc_orders,this.s.rules()),boxes=this.packages(row);
  const composition=this.composition(row);
  const roots=[...composition.products,...composition.unresolved.map(item=>({item,components:[item]}))];
  const groups=roots.map(root=>{const sources=root.components.filter(c=>items.some(i=>i.id===c.id));return {id:root.item.id,item:root.item as any,sources,boxes:boxes.filter(p=>sources.some(s=>s.id===this.owner(p)))};}).filter(g=>g.sources.length);
  const unassigned=boxes.filter(p=>!groups.some(g=>g.boxes.includes(p)));
  if(unassigned.length)groups.push({id:'unassigned',item:null,sources:[],boxes:unassigned});
  return groups;
 }
 linkedBoxes(row:any,id:string){const group=this.productGroups(row).find(g=>g.id===id);return group?this.packages(row).filter(p=>!group.sources.some(s=>s.id===this.owner(p))&&p.contents.some(c=>group.sources.some(s=>s.id===c.order_item_id))):[];}
 sharedBox(p:ReviewPackage){return new Set(p.contents.map(c=>c.order_item_id)).size>1;}
 packageNumber(row:any,p:ReviewPackage){return this.packageNumbers.get(p)||(this.draft.indexOf(p)+1);}
 componentProduct(row:any,c:PackageComponent){return row.wc_orders?.wc_order_items?.find((i:any)=>i.id===c.order_item_id)?.product_name||'';}
 options(item:any){return orderItemOptionLabels(item);}
 image(item:any){const x=item.image||{},r=item.raw_item||{};return x.url||x.imageUrl||x.imageInfo?.url||r.media?.url||r.image?.url||r.image?.imageInfo?.url||'';}
 productTotal(item:any){return cents(item.raw_item?.totalPriceAfterTax?.amount)??(cents(item.unit_price)===null?null:cents(item.unit_price)!*Math.max(1,Number(item.quantity)||1));}
 address(a:any){if(!a)return 'Not provided';const part=(v:any)=>typeof v==='object'?v?.name||v?.code||'':v;return [a.addressLine||a.addressLine1,a.city||a.suburb||a.locality,part(a.subdivision||a.state||a.region),a.postalCode||a.postcode||a.zipCode,part(a.country)].filter(Boolean).join(', ');}
 addBox(productId?:string){const p:ReviewPackage={package_name:'Package '+(this.draft.length+1),length_mm:0,width_mm:0,height_mm:0,weight_kg:0,contents:[]};this.boxOwners.set(p,productId||'');this.draft.push(p);this.confirmed=false;}
 removeBox(p:ReviewPackage){this.draft=this.draft.filter(box=>box!==p);this.confirmed=false;}
 assigned(p:ReviewPackage,c:PackageComponent){return p.contents.some(x=>x.id===c.id);}
 toggle(p:ReviewPackage,c:PackageComponent,event:Event){if((event.target as HTMLInputElement).checked){if(!this.assigned(p,c))p.contents.push(c);}else p.contents=p.contents.filter(x=>x.id!==c.id);this.confirmed=false;}
 packagingIssue(row:any){return packagingError(this.draft,this.s.components(row));}
 orderTotal(row:any){return cents(row.wc_orders?.total);}
 invoice(row:any){return deliveryCents(row.wc_orders);}
 increase(row:any){const min=this.s.outcome(row).minimum_invoice_cents,invoice=this.invoice(row);return min==null||invoice==null?null:Math.max(0,min-invoice);}
 marginTone(row:any){const invoice=this.invoice(row),best=this.s.outcome(row).best;if(!invoice||!best)return 'red';const difference=invoice-best.total_cents;return difference*100>=invoice*20?'green':difference*100>=invoice*10?'yellow':'red';}
 margin(row:any){const invoice=this.invoice(row),best=this.s.outcome(row).best;return invoice&&best?`${((invoice-best.total_cents)/invoice*100).toFixed(1)}% (${this.money(invoice-best.total_cents)})`:'—';}
 money(value:number|null|undefined){return value==null?'—':new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(value/100);}
 label(status:string){return ({importing:'Awaiting import',pending:'Awaiting calculation',packaging_required:'Packaging required',legacy_packaging_required:'Packaging required',address_required:'Address required',calculating:'Calculating',within_target:'Within target',price_review_required:'Price review required',approved_exception:'Approved exception',approved_without_quote:'Approved without quote',no_eligible_quotes:'No eligible quotes',failed:'Calculation failed',uncertain:'Response uncertain',data_changed:'Inputs changed — manual review',invoice_required:'Invoice delivery required'} as Record<string,string>)[status]||status;}
 async save(row:any){if(!this.confirmed||this.packagingIssue(row))return;if(this.s.busy())return;const ok=this.revising?await this.s.requotePackages({...row,updated_at:this.revisionVersion},this.draft,this.saveProfile):await this.s.savePackages(row.order_id,this.draft,this.saveProfile);if(ok)this.revising=false;}
 async approve(row:any){await this.s.approve(row.order_id,this.reason);}
}
