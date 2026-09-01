import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { DrawerModule } from 'primeng/drawer';
import { TagModule } from 'primeng/tag';
import { OrderItemRow, OrderRow } from '../../core/models/order.models';
import { orderItemOptionLabels } from '../../core/utils/order-item-display';
import { OrderActivityComponent } from '../order-activity/order-activity.component';

@Component({
  selector:'app-order-drawer',
  standalone:true,
  imports:[CurrencyPipe,DatePipe,ButtonModule,DrawerModule,TagModule,OrderActivityComponent],
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
        <section>
          <div class="section-title">Order overview</div>
          <div class="overview compact-overview">
            <div><b>Items</b><span>{{physicalItemCount()}}</span></div>
            <div><b>Production status</b><span>{{productionStatus()}}</span></div>
            <div><b>Fulfilment method</b><span>{{order.delivery_type||'Shipping'}}</span></div>
          </div>
        </section>

        <section>
          <div class="section-title">Customer & delivery</div>
          <div class="customer-grid">
            <div><small>Email</small><b>{{order.buyer_email||'—'}}</b></div>
            <div><small>Phone</small><b>{{order.phone||'—'}}</b></div>
            <div><small>Method</small><b>{{order.delivery_title||order.delivery_type||'Shipping'}}</b></div>
          </div>
          @if(deliveryAddress()){<div class="detail"><b>Delivery address:</b> {{deliveryAddress()}}</div>}
          @if(order.buyer_note){<div class="detail"><b>Buyer note:</b> {{order.buyer_note}}</div>}
        </section>

        @if(mainItems().length){
          <section><div class="section-title">Items</div>
            @for(item of mainItems();track item.id){
              <div class="item">
                <div class="media">@if(mediaUrl(item)){<img [src]="mediaUrl(item)" alt="">}@else{<div class="placeholder"></div>}</div>
                <div class="item-main"><b>{{item.product_name}}</b><div><span class="pill">qty: {{item.quantity||1}}</span>@for(option of optionLabels(item);track option){<span class="pill">{{option}}</span>}</div></div>
                <div class="money"><span>{{item.unit_price||0|currency:(order.currency||'AUD')}} each</span><small>qty {{item.quantity||1}}</small><b>{{itemTotal(item)|currency:(order.currency||'AUD')}}</b></div>
              </div>
            }
          </section>
        }

        @if(addonItems().length){
          <section><div class="section-title">Add-ons</div>
            @for(item of addonItems();track item.id){
              <div class="item">
                <div class="media">@if(mediaUrl(item)){<img [src]="mediaUrl(item)" alt="">}@else{<div class="placeholder"></div>}</div>
                <div class="item-main"><b>{{item.product_name}}</b><p-tag value="Add-on" severity="secondary"></p-tag><div><span class="pill">qty: {{item.quantity||1}}</span>@for(option of optionLabels(item);track option){<span class="pill">{{option}}</span>}</div></div>
                <div class="money"><span>{{item.unit_price||0|currency:(order.currency||'AUD')}} each</span><small>qty {{item.quantity||1}}</small><b>{{itemTotal(item)|currency:(order.currency||'AUD')}}</b></div>
              </div>
            }
          </section>
        }

        <section class="totals-wrap"><div class="totals">
          @if(order.subtotal!=null){<div><span>Subtotal</span><span>{{order.subtotal|currency:(order.currency||'AUD')}}</span></div>}
          @if(deliveryAmount()>0){<div><span>Delivery</span><span>{{deliveryAmount()|currency:(order.currency||'AUD')}}</span></div>}
          @if((order.discount||0)!==0){<div><span>Discount</span><span>− {{abs(order.discount||0)|currency:(order.currency||'AUD')}}</span></div>}
          @if((order.additional_fees||0)!==0){<div><span>Additional fees</span><span>{{order.additional_fees||0|currency:(order.currency||'AUD')}}</span></div>}
          @if((order.tax||0)!==0){<div><span>Tax</span><span>{{order.tax||0|currency:(order.currency||'AUD')}}</span></div>}
          <div class="final"><span>Total</span><span>{{order.total||0|currency:(order.currency||'AUD')}}</span></div>
        </div></section>
        <app-order-activity [order]="order" />
      </div>
    </p-drawer>
  `,
  styles:[`
    .order-header{min-width:0}.order-title-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.order-title-row h2{margin:0;font-size:28px;line-height:1.1;letter-spacing:-.02em;color:#101828}.placed{margin-top:6px;font-size:14px;color:#475467}.customer-name{margin-top:7px;font-size:15px;color:#344054}.customer-name span{color:#758198}.body{padding:8px 2px 4px}.body section{margin-bottom:22px}.section-title{font-size:11px;text-transform:uppercase;color:#758198;font-weight:700;margin-bottom:8px}.overview,.customer-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.overview>div,.customer-grid>div{border:1px solid #e4e7ec;border-radius:8px;padding:10px;background:#fbfcfd;display:flex;flex-direction:column;gap:5px}.customer-grid small{font-size:10px;text-transform:uppercase;color:#758198;font-weight:700}.detail{margin-top:10px;color:#758198;font-size:12px}.item{display:grid;grid-template-columns:76px 1fr auto;gap:12px;align-items:start;border:1px solid #e4e7ec;border-radius:9px;padding:10px;margin-bottom:9px}.media img,.placeholder{width:76px;height:76px;border-radius:7px;border:1px solid #e4e7ec;object-fit:cover;background:#f6f8fa}.item-main p-tag{margin-left:7px}.pill{display:inline-block;background:#f1f4f7;border-radius:5px;padding:4px 6px;font-size:11px;margin:5px 5px 0 0}.money{text-align:right;display:flex;flex-direction:column;gap:3px}.money small{color:#758198}.totals-wrap{display:flex;justify-content:flex-end}.totals{width:min(420px,100%);border-top:1px solid #e4e7ec;padding-top:8px}.totals>div{display:flex;justify-content:space-between;padding:5px 0}.totals .final{font-weight:800;font-size:16px;border-top:1px solid #e4e7ec;margin-top:5px;padding-top:10px}@media(max-width:800px){.order-title-row h2{font-size:24px}.overview,.customer-grid{grid-template-columns:1fr 1fr}.item{grid-template-columns:60px 1fr}.media img,.placeholder{width:60px;height:60px}.money{grid-column:2;text-align:left}}
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
  productionStatus(){const counts=new Map<string,number>();for(const item of this.mainItems())for(const unit of item.wc_production_units??[]){const status=unit.production_status||'New';counts.set(status,(counts.get(status)??0)+1);}return[...counts.entries()].map(([status,count])=>`${count} ${status}`).join(' · ')||'—';}
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
