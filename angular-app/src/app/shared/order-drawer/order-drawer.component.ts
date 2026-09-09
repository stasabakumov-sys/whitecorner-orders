import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { DrawerModule } from 'primeng/drawer';
import {DialogModule} from 'primeng/dialog';
import { TagModule } from 'primeng/tag';
import { OrderItemRow, OrderRow } from '../../core/models/order.models';
import { orderItemOptionLabels } from '../../core/utils/order-item-display';
import { OrderActivityComponent } from '../order-activity/order-activity.component';
import {OrderPrintComponent} from './order-print.component';

@Component({
  selector:'app-order-drawer',
  standalone:true,
  imports:[CurrencyPipe,DatePipe,DrawerModule,DialogModule,TagModule,OrderActivityComponent,OrderPrintComponent],
  template:`
    <p-drawer [visible]="true" position="right" [modal]="true" [dismissible]="true" [style]="{width:'min(1160px,90vw)'}" (onHide)="closed.emit()">
      <ng-template pTemplate="header">
        <div class="order-header">
          <nav class="order-breadcrumb" aria-label="Breadcrumb">
            <button type="button" (click)="closed.emit()">Orders</button><span aria-hidden="true">›</span>
            @if(editing){<button type="button" (click)="editing=false">Order #{{order.order_number}}</button><span aria-hidden="true">›</span><span aria-current="page">Edit Order</span>}
            @else{<span aria-current="page">Order #{{order.order_number}}</span>}
          </nav>
          <div class="order-title-row">
            <h2>{{editing ? 'Edit Order' : 'Order'}} #{{order.order_number}}</h2>
            <p-tag [value]="paymentLabel()" [severity]="paymentSeverity()"></p-tag>
            <p-tag [value]="fulfilmentLabel()" [severity]="fulfilmentSeverity()"></p-tag>
          </div>
          <div class="placed">Placed on {{order.wix_created_at|date:'dd MMM yyyy, h:mm a'}}</div>
        </div>
        <div class="header-actions">
          @if(editing){
            <button type="button" (click)="editing=false">Cancel</button>
            <button type="button" disabled title="Order editing is not enabled yet">Update Order</button>
          }@else{
            <details class="more-actions"><summary>More Actions <span aria-hidden="true">⌄</span></summary>
              <div><button type="button" (click)="editing=true">Edit order</button><button type="button" (click)="printing=true">Print order</button><button type="button" (click)="refundMode='cancel'">Cancel &amp; refund</button><button type="button" (click)="refundMode='refund'">Refund</button><button type="button" (click)="invoicePreview=true">Create invoice</button><button type="button" (click)="receiptPreview=true">View receipt</button></div>
            </details>
          }
        </div>
      </ng-template>

      @if(editing){
        <p class="edit-notice" role="status">View only. Order editing is not enabled yet. No changes are saved or sent to Wix.</p>
        <div class="page-grid edit-grid">
          <main class="main-column">
            <section class="wix-section">
              <div class="wix-section-head"><b>Items ({{allItems().length}})</b><button type="button" disabled>+ Add Item</button></div>
              @for(item of allItems();track item.id){
                <div class="line-item edit-line">
                  <div class="media">@if(mediaUrl(item)){<img [src]="mediaUrl(item)" alt="">}@else{<div class="placeholder"></div>}</div>
                  <div class="item-main"><b>{{item.product_name}}</b><div>{{item.unit_price||0|currency:(order.currency||'AUD')}}</div>
                    <div class="options">@for(option of optionLabels(item);track option){<span>{{option}}</span>}</div>
                  </div>
                  <input type="number" [value]="item.quantity??1" disabled [attr.aria-label]="'Quantity for '+item.product_name">
                  <div class="line-total">{{itemTotal(item)|currency:(order.currency||'AUD')}}</div>
                  <button type="button" disabled aria-label="Edit item">⋯</button>
                </div>
              }
            </section>
            <section class="wix-section">
              <div class="wix-section-head"><b>Customer info</b><button type="button" disabled aria-label="Edit customer">✎</button></div>
              <div class="edit-body"><b>{{order.customer_name||'—'}}</b><p>{{order.buyer_email||'—'}} · {{order.phone||'—'}}</p>
                <b>Delivery address:</b><p>{{deliveryAddress()||'—'}}</p>
                <b>Billing address:</b><p>{{billingAddress()||'Not available'}}</p>
              </div>
            </section>
            <section class="wix-section">
              <div class="wix-section-head"><b>Reason for editing</b></div>
              <div class="edit-body"><input class="edit-reason" disabled aria-label="Reason for editing" placeholder="e.g., Customer called to add an item"><small>Editing will be available when order updates are enabled.</small></div>
            </section>
          </main>
          <aside class="side-column"><section class="wix-section">
            <div class="wix-section-head"><b>Order summary</b></div>
            <div class="payment-list">
              <div><span>Items · incl. GST</span><span>{{order.subtotal??itemsAmount()|currency:(order.currency||'AUD')}}</span></div>
              <div><span>{{order.delivery_title||order.delivery_type||'Delivery'}}</span><span>{{deliveryAmount()|currency:(order.currency||'AUD')}}</span></div>
              <button type="button" disabled>Edit Delivery Method</button>
              <div><span>Fees</span><span>{{order.additional_fees||0|currency:(order.currency||'AUD')}}</span></div><button type="button" disabled>Add Fee</button>
              <div><span>Discount</span><span>{{order.discount||0|currency:(order.currency||'AUD')}}</span></div><button type="button" disabled>Add Discount</button>
              <div><span>Included tax</span><span>{{order.tax??0|currency:(order.currency||'AUD')}}</span></div>
              <div class="payment-total"><b>Total</b><b>{{order.total||0|currency:(order.currency||'AUD')}}</b></div>
              <div><span>Amount paid</span><span>{{paymentLabel()==='PAID'?(order.total||0|currency:(order.currency||'AUD')):'—'}}</span></div>
              <div><span>Amount due</span><span>{{paymentLabel()==='PAID'?(0|currency:(order.currency||'AUD')):'—'}}</span></div>
            </div>
          </section></aside>
        </div>
      }@else{
      <div class="page-grid">
        <main class="main-column">
          <section class="wix-section items-section">
            <div class="wix-section-head"><b>Items ({{physicalItemCount()}})</b></div>
            <div class="items-group-label">Products</div>

            @for(item of mainItems();track item.id){
              <div class="line-item">
                <div class="media">@if(mediaUrl(item)){<img [src]="mediaUrl(item)" alt="">}@else{<div class="placeholder"></div>}</div>
                <div class="item-main">
                  <b>{{item.product_name}}</b>
                  <div class="options">
                    @for(option of optionLabels(item);track option){<span>{{option}}</span>}
                  </div>
                </div>
                <div class="unit-price">{{item.unit_price||0|currency:(order.currency||'AUD')}}</div>
                <div class="qty">× {{item.quantity||1}}</div>
                <div class="line-total">{{itemTotal(item)|currency:(order.currency||'AUD')}}</div>
              </div>
            }

            @if(addonItems().length){
              <div class="items-group-label addons-label">Add-ons</div>
              @for(item of addonItems();track item.id){
                <div class="line-item">
                  <div class="media">@if(mediaUrl(item)){<img [src]="mediaUrl(item)" alt="">}@else{<div class="placeholder"></div>}</div>
                  <div class="item-main">
                    <div class="item-name-row"><b>{{item.product_name}}</b><p-tag value="Add-on" severity="secondary"></p-tag></div>
                    <div class="options">
                      @for(option of optionLabels(item);track option){<span>{{option}}</span>}
                    </div>
                  </div>
                  <div class="unit-price">{{item.unit_price||0|currency:(order.currency||'AUD')}}</div>
                  <div class="qty">× {{item.quantity||1}}</div>
                  <div class="line-total">{{itemTotal(item)|currency:(order.currency||'AUD')}}</div>
                </div>
              }
            }
          </section>

          <section class="wix-section payment-section">
            <div class="wix-section-head"><b>Payment info</b><p-tag [value]="paymentLabel()" [severity]="paymentSeverity()"></p-tag></div>
            <div class="payment-list">
              @if(order.subtotal!=null){<div><span>Items</span><span>{{order.subtotal|currency:(order.currency||'AUD')}}</span></div>}
              @if(deliveryAmount()>0){<div><span>Shipping</span><span>{{deliveryAmount()|currency:(order.currency||'AUD')}}</span></div>}
              @if((order.discount||0)!==0){<div><span>Discount</span><span>− {{abs(order.discount||0)|currency:(order.currency||'AUD')}}</span></div>}
              @if((order.additional_fees||0)!==0){<div><span>Additional fees</span><span>{{order.additional_fees||0|currency:(order.currency||'AUD')}}</span></div>}
              @if((order.tax||0)!==0){<div><span>Tax</span><span>{{order.tax||0|currency:(order.currency||'AUD')}}</span></div>}
              <div class="payment-total"><b>Total</b><b>{{order.total||0|currency:(order.currency||'AUD')}}</b></div>
            </div>
          </section>

          <app-order-activity [order]="order" />
        </main>

        <aside class="side-column">
          <section class="wix-section order-info">
            <div class="wix-section-head"><b>Order info</b></div>

            <div class="info-block">
              <div class="info-label">Contact info</div>
              <div class="contact-name">{{order.customer_name||'—'}}</div>
              @if(order.company){<div class="muted">{{order.company}}</div>}
              <div class="info-text">{{order.buyer_email||'—'}}</div>
              <div class="info-text">{{order.phone||'—'}}</div>
            </div>

            <div class="info-block">
              <div class="info-label">Delivery method</div>
              <div class="info-text strong">{{order.delivery_title||order.delivery_type||'Shipping'}}</div>
            </div>

            @if(deliveryAddress()){
              <div class="info-block">
                <div class="info-label">Shipping address</div>
                <div class="info-text address">{{deliveryAddress()}}</div>
              </div>
            }

            @if(order.buyer_note){
              <div class="info-block">
                <div class="info-label">Buyer note</div>
                <div class="info-text address">{{order.buyer_note}}</div>
              </div>
            }
          </section>
        </aside>
      </div>
      }
    </p-drawer>
    @if(printing){<app-order-print [order]="order" (closed)="printing=false"/>}
    <p-dialog [visible]="receiptPreview" (visibleChange)="receiptPreview=$event" [modal]="true" [style]="{width:'900px',maxWidth:'95vw'}" [header]="'Receipt · Order #'+order.order_number">
      <div class="receipt-toolbar" aria-label="Receipt actions">
        <button type="button" disabled title="Available when the Wix receipt is loaded">Download PDF</button>
        <button type="button" disabled title="Available when the Wix receipt is loaded">Print</button>
        <button type="button" disabled title="Not available yet">View All Receipts</button>
        <button type="button" disabled title="Not available yet">Send via Email</button>
      </div>
      <p class="edit-notice" role="status">The Wix receipt has not been loaded yet. Its number, issue date and payment details will come from Wix.</p>
      <ng-template pTemplate="footer"><button type="button" class="refund-close" (click)="receiptPreview=false">Close</button></ng-template>
    </p-dialog>
    <p-dialog [visible]="invoicePreview" (visibleChange)="invoicePreview=$event" [modal]="true" [style]="{width:'470px',maxWidth:'95vw'}" [header]="'Create an invoice for order #'+order.order_number+'?'">
      <p>Do you want to create an invoice for this order?</p><p class="edit-notice" role="status">Preview only. Invoice creation is not enabled yet.</p>
      <ng-template pTemplate="footer"><button type="button" class="refund-close" (click)="invoicePreview=false">Cancel</button><button type="button" class="refund-continue" disabled>Create Invoice</button></ng-template>
    </p-dialog>
    <p-dialog [visible]="refundMode!==null" (visibleChange)="!$event && (refundMode=null)" [modal]="true" [style]="{width:'540px',maxWidth:'95vw'}" [header]="refundMode==='cancel'?'Cancel this order':'Refund this order'">
      <p class="edit-notice" role="status">Preview only. Refunds are unavailable until Stripe integration is enabled. No order, inventory or email changes will be made.</p>
      <div class="refund-preview">
        <label>Refund amount<input type="number" disabled [value]="order.total??0"></label>
        <small>Order total: {{order.total||0|currency:(order.currency||'AUD')}}. Refundable balance has not been verified.</small>
        @if(refundMode==='cancel'){<label class="check"><input type="checkbox" disabled>Update inventory</label>}
        <label class="check"><input type="checkbox" disabled>Send a confirmation email to customer</label>
        <label>Add a personal note in the email (optional)<textarea disabled maxlength="200" placeholder="Personal note"></textarea></label>
      </div>
      <ng-template pTemplate="footer"><button type="button" class="refund-close" (click)="refundMode=null">Cancel</button><button type="button" class="refund-continue" disabled title="Available after Stripe integration">Continue</button></ng-template>
    </p-dialog>
  `,
  styles: [`@layer hub-layout {
    .receipt-toolbar{display:flex;flex-wrap:wrap;gap:12px;padding:16px;background:#080d29;border-radius:8px}.receipt-toolbar button{border:1px solid #cbd5e1;border-radius:22px;background:#eef4ff;color:#64748b;padding:8px 18px;font:inherit;cursor:not-allowed}
    .refund-preview{display:grid;gap:14px}.refund-preview label{display:grid;gap:7px}.refund-preview input[type=number],.refund-preview textarea{padding:10px;border:1px solid #dce5ef;border-radius:7px;background:#f8fafc;color:#667085}.refund-preview textarea{min-height:90px}.refund-preview small{color:#758198}.refund-preview .check{display:flex;gap:8px;align-items:center;border-top:1px solid #e4e7ec;padding-top:14px}.refund-close,.refund-continue{padding:8px 18px;border:1px solid #dce5ef;border-radius:20px;background:#fff;color:#1670ff}.refund-continue:disabled{background:#edf1f7;color:#8492a6;cursor:not-allowed}
    .order-breadcrumb{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px;font-size:13px;color:#27364a}.order-breadcrumb button{border:0;border-radius:18px;background:#f5f7fa;padding:5px 10px;color:inherit;font:inherit;cursor:pointer}.order-breadcrumb button:hover{background:#eaf1fa}.order-breadcrumb>span[aria-hidden]{color:#98a2b3;font-size:20px}
    .order-header{flex:1}.header-actions{display:flex;gap:10px;align-items:center;margin-left:auto}.header-actions button,.more-actions summary,.edit-grid button{border:1px solid #dce5ef;border-radius:18px;background:#fff;padding:7px 14px;font:inherit;font-size:13px;color:#1670ff;cursor:pointer}.more-actions{position:relative}.more-actions summary{list-style:none;white-space:nowrap}.more-actions>div{position:absolute;right:0;top:100%;z-index:2;min-width:170px;padding:6px;background:#fff;border:1px solid #e4e7ec;border-radius:10px;box-shadow:0 4px 12px #17203322}.more-actions>div button{width:100%;border:0;text-align:left;border-radius:6px}.edit-notice{background:#edf5ff;border:1px solid #cfdef5;padding:12px 16px;border-radius:9px;color:#34516f}.edit-body{padding:20px}.edit-body p{margin:4px 0 15px;color:#758198}.edit-body small{display:block;margin-top:7px;color:#758198}.edit-grid input{border:1px solid #dde5ef;border-radius:6px;padding:8px;color:#475467;background:#fafbfc;min-width:0;width:65px}.edit-grid .edit-reason{width:100%}.edit-grid button:disabled,.header-actions button:disabled{cursor:not-allowed;color:#8694a7;background:#f7f9fc}.edit-line{grid-template-columns:50px minmax(0,1fr) 65px auto 36px}.edit-grid .payment-list>div{gap:12px}.edit-grid .payment-list>div>span:last-child{white-space:nowrap}@media(max-width:760px){.header-actions{margin-left:0}.edit-line{grid-template-columns:40px minmax(0,1fr) 65px}.edit-line .line-total{grid-column:2}.edit-grid .page-grid{grid-template-columns:1fr}}

    :host ::ng-deep .p-drawer-content{background:#f3f5f8}.order-header{min-width:0}.order-title-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.order-title-row h2{margin:0;font-size:28px;font-weight:600;line-height:1.1;letter-spacing:-.02em;color:#101828}.placed{margin-top:6px;font-size:14px;color:#475467}
    .page-grid{display:grid;grid-template-columns:minmax(0,1fr) 310px;gap:18px;padding:14px 4px 24px}.main-column,.side-column{min-width:0}.wix-section{background:#fff;border:1px solid #e4e7ec;border-radius:12px;overflow:hidden;margin-bottom:18px}.wix-section-head{min-height:56px;padding:0 22px;display:flex;align-items:center;gap:10px;border-bottom:1px solid #e4e7ec;font-size:17px;color:#101828}.items-group-label{padding:10px 22px;background:#edf4ff;border-bottom:1px solid #d7e5ff;font-weight:500;color:#344054}.addons-label{border-top:1px solid #e4e7ec;background:#f8fafc}
    .line-item{display:grid;grid-template-columns:64px minmax(0,1fr) 84px 48px 96px;gap:12px;align-items:start;padding:14px 22px;border-bottom:1px solid #edf0f3}.line-item:last-child{border-bottom:0}.media img,.placeholder{width:56px;height:56px;border-radius:7px;border:1px solid #e4e7ec;object-fit:cover;background:#f6f8fa}.item-main>b,.item-name-row>b{font-weight:600;color:#26364d}.item-name-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.options{display:flex;flex-direction:column;gap:2px;margin-top:6px;color:#526078;font-size:13px;line-height:1.35}.unit-price,.qty,.line-total{text-align:right;white-space:nowrap;color:#344054}.line-total{font-weight:600}
    .payment-list{padding:18px 22px 20px}.payment-list>div{display:flex;justify-content:space-between;gap:20px;padding:6px 0;color:#25364d}.payment-total{margin-top:8px;padding-top:14px!important;border-top:1px solid #e4e7ec;font-size:16px}
    .side-column{align-self:start}.order-info{position:sticky;top:0;margin-bottom:0}.order-info .wix-section-head{padding:0 22px}.info-block{padding:20px 22px;border-bottom:1px solid #e4e7ec}.info-block:last-child{border-bottom:0}.info-label{font-size:14px;text-decoration:underline;text-underline-offset:2px;color:#25364d;margin-bottom:10px}.contact-name{font-size:15px;font-weight:600;color:#26364d;margin-bottom:8px}.muted{font-size:13px;color:#758198;margin-top:-4px;margin-bottom:8px}.info-text{font-size:14px;color:#101828;line-height:1.45;margin-top:3px;overflow-wrap:anywhere}.info-text.strong{font-weight:500}.address{white-space:pre-wrap}
    :host ::ng-deep app-order-activity .activity-section{margin-top:0}:host ::ng-deep app-order-activity .section-title{margin-left:2px}
    @media(max-width:980px){.page-grid{grid-template-columns:1fr}.side-column{order:-1}.order-info{position:static}.line-item{grid-template-columns:58px minmax(0,1fr) 80px 48px 90px;padding-left:18px;padding-right:18px}.wix-section-head,.items-group-label,.payment-list{padding-left:18px;padding-right:18px}}
    @media(max-width:720px){.order-title-row h2{font-size:24px}.line-item{grid-template-columns:58px 1fr}.unit-price,.qty,.line-total{grid-column:2;text-align:left}.page-grid{padding-left:0;padding-right:0}.side-column{order:0}}

}`]
})
export class OrderDrawerComponent{
  editing=false;
  printing=false;
  invoicePreview=false;
  receiptPreview=false;
  refundMode:'cancel'|'refund'|null=null;
  @Input({required:true}) order!:OrderRow;
  @Output() closed=new EventEmitter<void>();
  private readonly addonTerms=['additional tabletop','custom cutout','custom cutouts','side shelves','integrated ice storage shelf','umbrella hole','support panel','customisation','customization','back panel with','benchtop upgrade'];
  allItems(){return(this.order.wc_order_items??[]).filter(i=>!/^delivery$/i.test(i.product_name??''));}
  mainItems(){return this.allItems().filter(i=>!this.isAddon(i));}
  addonItems(){return this.allItems().filter(i=>this.isAddon(i));}
  isAddon(item:OrderItemRow){const name=String(item.product_name??'').toLowerCase();return this.addonTerms.some(term=>name.includes(term));}
  itemTotal(item:OrderItemRow){return Number(item.unit_price??0)*Number(item.quantity??1);}
  physicalItemCount(){return this.mainItems().reduce((sum,item)=>sum+Math.max(1,Number(item.quantity??1)),0);}
  paymentLabel(){return String(this.order.payment_status||'—').toUpperCase();}
  fulfilmentLabel(){return String(this.order.fulfillment_status||'UNFULFILLED').replaceAll('_',' ').toUpperCase();}
  paymentSeverity():'success'|'warn'|'danger'|'secondary'{const v=this.paymentLabel();if(v==='PAID')return'success';if(v.includes('PARTIAL')||v.includes('PENDING'))return'warn';if(v.includes('REFUND')||v.includes('FAILED'))return'danger';return'secondary';}
  fulfilmentSeverity():'success'|'warn'|'danger'|'secondary'{const v=this.fulfilmentLabel();if(v.includes('FULFILLED')&&!v.includes('UNFULFILLED'))return'success';if(v.includes('UNFULFILLED')||v.includes('NOT FULFILLED'))return'danger';if(v.includes('PARTIAL'))return'warn';return'secondary';}
  deliveryAddress(){const a=this.order.delivery_address;if(!a||typeof a!=='object')return'';const keys=['addressLine','addressLine1','streetAddress','city','suburb','subdivision','state','postalCode','postcode','country'];const values:string[]=[];for(const key of keys){const value=a[key];if(typeof value==='string'&&value.trim()&&!values.includes(value.trim()))values.push(value.trim());}return values.join(', ');}
  deliveryAmount(){const direct=Number(this.order.shipping??0);if(direct>0)return direct;if((this.order.delivery_type||'Shipping')!=='Shipping')return 0;const productSum=this.allItems().reduce((sum,item)=>sum+this.itemTotal(item),0);const residual=Number(this.order.total??0)-productSum-Number(this.order.additional_fees??0)+Math.abs(Number(this.order.discount??0));return residual>0.005?residual:0;}
  mediaUrl(item:OrderItemRow){const image=item.image??{};const raw=item.raw_item??{};const candidates=[image['url'],image['imageUrl'],(image['imageInfo'] as Record<string,unknown>|undefined)?.['url'],(raw['media'] as Record<string,unknown>|undefined)?.['url'],(raw['image'] as Record<string,unknown>|undefined)?.['url'],((raw['image'] as Record<string,unknown>|undefined)?.['imageInfo'] as Record<string,unknown>|undefined)?.['url']];return String(candidates.find(v=>typeof v==='string'&&v)??'');}
  optionLabels(item:OrderItemRow){return orderItemOptionLabels(item,12);}
  abs(value:number){return Math.abs(value);}
  itemsAmount(){return this.allItems().reduce((sum,item)=>sum+this.itemTotal(item),0);}
  billingAddress(){const raw=this.order.raw_order as any;const a=raw?.billingInfo?.address;if(!a)return '';return [a.addressLine,a.addressLine1,a.streetAddress?.formattedAddress,a.city,a.subdivision,a.postalCode,a.country].filter(v=>typeof v==='string'&&v).join(', ');}
}
