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
    <p-drawer [visible]="true" position="right" [modal]="true" [dismissible]="true" [style]="{width:'min(1040px,96vw)'}" (onHide)="closed.emit()">
      <ng-template pTemplate="header">
        <div class="order-header">
          <div class="order-title-row">
            <h2>Order #{{order.order_number}}</h2>
            <p-tag [value]="paymentLabel()" [severity]="paymentSeverity()"></p-tag>
            <p-tag [value]="fulfilmentLabel()" [severity]="fulfilmentSeverity()"></p-tag>
          </div>
          <div class="placed">Placed on {{order.wix_created_at|date:'dd MMM yyyy, h:mm a'}}</div>
          <div class="customer-name">{{order.customer_name||'—'}} @if(order.company){<span>· {{order.company}}</span>}</div>
        </div>
      </ng-template>

      <div class="body">
        <section class="wix-section">
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

        <section class="wix-section">
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

        <section class="wix-section">
          <div class="wix-section-head"><b>Customer & delivery</b></div>
          <div class="customer-list">
            <div><span>Email</span><b>{{order.buyer_email||'—'}}</b></div>
            <div><span>Phone</span><b>{{order.phone||'—'}}</b></div>
            @if(deliveryAddress()){<div class="full"><span>Delivery address</span><b>{{deliveryAddress()}}</b></div>}
            @if(order.buyer_note){<div class="full"><span>Buyer note</span><b>{{order.buyer_note}}</b></div>}
          </div>
        </section>

        <app-order-activity [order]="order" />
      </div>
    </p-drawer>
  `,
  styles:[`
    .order-header{min-width:0}.order-title-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.order-title-row h2{margin:0;font-size:28px;font-weight:600;line-height:1.1;letter-spacing:-.02em;color:#101828}.placed{margin-top:6px;font-size:14px;color:#475467}.customer-name{margin-top:7px;font-size:15px;color:#344054}.customer-name span{color:#758198}.body{padding:10px 2px 4px;background:#f3f5f8}.wix-section{background:#fff;border:1px solid #e4e7ec;border-radius:10px;overflow:hidden;margin-bottom:18px}.wix-section-head{min-height:54px;padding:0 20px;display:flex;align-items:center;gap:10px;border-bottom:1px solid #e4e7ec;font-size:17px}.items-group-label{padding:11px 20px;background:#f4f7fb;border-bottom:1px solid #e4e7ec;font-weight:600;color:#344054}.addons-label{border-top:1px solid #e4e7ec}.line-item{display:grid;grid-template-columns:68px minmax(0,1fr) 90px 60px 100px;gap:12px;align-items:start;padding:14px 20px;border-bottom:1px solid #edf0f3}.line-item:last-child{border-bottom:0}.media img,.placeholder{width:58px;height:58px;border-radius:7px;border:1px solid #e4e7ec;object-fit:cover;background:#f6f8fa}.item-main>b,.item-name-row>b{font-weight:600}.item-name-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.options{display:flex;flex-direction:column;gap:2px;margin-top:5px;color:#475467;font-size:13px}.unit-price,.qty,.line-total{text-align:right;white-space:nowrap}.line-total{font-weight:600}.payment-list{padding:18px 20px}.payment-list>div{display:flex;justify-content:space-between;gap:20px;padding:5px 0}.payment-total{margin-top:8px;padding-top:12px!important;border-top:1px solid #e4e7ec}.customer-list{display:grid;grid-template-columns:1fr 1fr;gap:0}.customer-list>div{padding:14px 20px;border-bottom:1px solid #edf0f3;display:flex;flex-direction:column;gap:4px}.customer-list>div:nth-child(odd){border-right:1px solid #edf0f3}.customer-list .full{grid-column:1/-1;border-right:0!important}.customer-list span{font-size:11px;text-transform:uppercase;color:#758198;font-weight:700}.customer-list b{font-weight:600;color:#344054}@media(max-width:800px){.order-title-row h2{font-size:24px}.line-item{grid-template-columns:58px 1fr}.unit-price,.qty,.line-total{grid-column:2;text-align:left}.customer-list{grid-template-columns:1fr}.customer-list>div{border-right:0!important}.customer-list .full{grid-column:auto}}
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
  deliveryAddress(){const a=this.order.delivery_address;if(!a||typeof a!=='object')return'';const keys=['addressLine','addressLine1','streetAddress','city','suburb','subdivision','state','postalCode','postcode'];const values:string[]=[];for(const key of keys){const value=a[key];if(typeof value==='string'&&value.trim()&&!values.includes(value.trim()))values.push(value.trim());}return values.join(', ');}
  deliveryAmount(){const direct=Number(this.order.shipping??0);if(direct>0)return direct;if((this.order.delivery_type||'Shipping')!=='Shipping')return 0;const productSum=this.allItems().reduce((sum,item)=>sum+this.itemTotal(item),0);const residual=Number(this.order.total??0)-productSum-Number(this.order.additional_fees??0)+Math.abs(Number(this.order.discount??0));return residual>0.005?residual:0;}
  mediaUrl(item:OrderItemRow){const image=item.image??{};const raw=item.raw_item??{};const candidates=[image['url'],image['imageUrl'],(image['imageInfo'] as Record<string,unknown>|undefined)?.['url'],(raw['media'] as Record<string,unknown>|undefined)?.['url'],(raw['image'] as Record<string,unknown>|undefined)?.['url'],((raw['image'] as Record<string,unknown>|undefined)?.['imageInfo'] as Record<string,unknown>|undefined)?.['url']];return String(candidates.find(v=>typeof v==='string'&&v)??'');}
  optionLabels(item:OrderItemRow){return orderItemOptionLabels(item,12);}
  abs(value:number){return Math.abs(value);}
}
