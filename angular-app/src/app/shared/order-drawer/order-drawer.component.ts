import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { DrawerModule } from 'primeng/drawer';
import { TagModule } from 'primeng/tag';
import { OrderItemRow, OrderRow } from '../../core/models/order.models';
import { orderItemOptionLabels } from '../../core/utils/order-item-display';
import { OrderActivityComponent } from '../order-activity/order-activity.component';

@Component({
  selector:'app-order-drawer',
  standalone:true,
  imports:[CurrencyPipe,DatePipe,DrawerModule,TagModule,OrderActivityComponent],
  template:`
    <p-drawer [visible]="true" position="right" [modal]="true" [dismissible]="true" [style]="{width:'min(1260px,98vw)'}" (onHide)="closed.emit()">
      <ng-template pTemplate="header">
        <div class="order-header">
          <div class="order-title-row">
            <h2>Order #{{order.order_number}}</h2>
            <p-tag [value]="paymentLabel()" [severity]="paymentSeverity()"></p-tag>
            <p-tag [value]="fulfilmentLabel()" [severity]="fulfilmentSeverity()"></p-tag>
          </div>
          <div class="placed">Placed on {{order.wix_created_at|date:'dd MMM yyyy, h:mm a'}}</div>
        </div>
      </ng-template>

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
    </p-drawer>
  `,
  styles:[`
    :host ::ng-deep .p-drawer-content{background:#f3f5f8}.order-header{min-width:0}.order-title-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.order-title-row h2{margin:0;font-size:28px;font-weight:600;line-height:1.1;letter-spacing:-.02em;color:#101828}.placed{margin-top:6px;font-size:14px;color:#475467}
    .page-grid{display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:22px;padding:14px 6px 24px}.main-column,.side-column{min-width:0}.wix-section{background:#fff;border:1px solid #e4e7ec;border-radius:12px;overflow:hidden;margin-bottom:18px}.wix-section-head{min-height:58px;padding:0 26px;display:flex;align-items:center;gap:10px;border-bottom:1px solid #e4e7ec;font-size:18px;color:#101828}.items-group-label{padding:11px 26px;background:#edf4ff;border-bottom:1px solid #d7e5ff;font-weight:500;color:#344054}.addons-label{border-top:1px solid #e4e7ec;background:#f8fafc}
    .line-item{display:grid;grid-template-columns:68px minmax(0,1fr) 90px 56px 105px;gap:14px;align-items:start;padding:16px 26px;border-bottom:1px solid #edf0f3}.line-item:last-child{border-bottom:0}.media img,.placeholder{width:58px;height:58px;border-radius:7px;border:1px solid #e4e7ec;object-fit:cover;background:#f6f8fa}.item-main>b,.item-name-row>b{font-weight:600;color:#26364d}.item-name-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.options{display:flex;flex-direction:column;gap:2px;margin-top:6px;color:#526078;font-size:13px;line-height:1.35}.unit-price,.qty,.line-total{text-align:right;white-space:nowrap;color:#344054}.line-total{font-weight:600}
    .payment-list{padding:20px 26px 22px}.payment-list>div{display:flex;justify-content:space-between;gap:20px;padding:6px 0;color:#25364d}.payment-total{margin-top:8px;padding-top:14px!important;border-top:1px solid #e4e7ec;font-size:16px}
    .side-column{align-self:start}.order-info{position:sticky;top:0;margin-bottom:0}.order-info .wix-section-head{padding:0 24px}.info-block{padding:22px 24px;border-bottom:1px solid #e4e7ec}.info-block:last-child{border-bottom:0}.info-label{font-size:14px;text-decoration:underline;text-underline-offset:2px;color:#25364d;margin-bottom:10px}.contact-name{font-size:15px;font-weight:600;color:#26364d;margin-bottom:8px}.muted{font-size:13px;color:#758198;margin-top:-4px;margin-bottom:8px}.info-text{font-size:14px;color:#101828;line-height:1.45;margin-top:3px;overflow-wrap:anywhere}.info-text.strong{font-weight:500}.address{white-space:pre-wrap}
    :host ::ng-deep app-order-activity .activity-section{margin-top:0}:host ::ng-deep app-order-activity .section-title{margin-left:2px}
    @media(max-width:980px){.page-grid{grid-template-columns:1fr}.side-column{order:-1}.order-info{position:static}.line-item{grid-template-columns:58px minmax(0,1fr) 80px 48px 90px;padding-left:18px;padding-right:18px}.wix-section-head,.items-group-label,.payment-list{padding-left:18px;padding-right:18px}}
    @media(max-width:720px){.order-title-row h2{font-size:24px}.line-item{grid-template-columns:58px 1fr}.unit-price,.qty,.line-total{grid-column:2;text-align:left}.page-grid{padding-left:0;padding-right:0}.side-column{order:0}}
  `]
})
export class OrderDrawerComponent{
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
}
