import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { OrderRow } from '../../core/models/order.models';
import { OrdersService } from '../../core/services/orders.service';
import { isDeliveryLine } from '../../core/utils/order-products';
import {OrderHistoryService,mergeOrderHistory} from './order-history.service';
import {orderMetrics,MetricsPeriod} from './order-metrics';
import { OrderDrawerComponent } from '../../shared/order-drawer/order-drawer.component';

@Component({
  selector:'app-orders',
  standalone:true,
  imports:[CurrencyPipe,DatePipe,ButtonModule,InputTextModule,TableModule,TagModule,OrderDrawerComponent],
  template:`
    <section class="panel">
      <div class="sales-summary" aria-label="Order summary" title="Based on orders available in HUB. AUD order totals including GST and delivery; cancelled orders excluded. Compared with the preceding equal period.">
        @for(metric of metrics();track metric.label){
          <div class="metric"><span>{{metric.label}}</span><b>{{metric.money ? (metric.value|currency:'AUD':'symbol-narrow':'1.0-0') : metric.value}}</b>
            @if(metric.change!==null){<small [class.positive]="metric.change>0" [class.negative]="metric.change<0">{{metric.change>0?'↗':metric.change<0?'↘':'–'}} {{abs(metric.change)}}%</small>}
            @else{<small title="No non-zero value in the previous period">—</small>}
          </div>
        }
        <select aria-label="Summary period" [value]="period()" (change)="period.set($any($event.target).value)">
          <option value="today">Today</option><option value="yesterday">Yesterday</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="week">This week</option><option value="month">This month</option>
        </select>
      </div>
      <div class="head">
        <div class="title-block"><h1>Orders</h1><small>{{allOrders().length}} orders</small></div>
        <div class="actions">
          @if(orders.lastSync()){<small class="sync-note">Wix synced {{orders.lastSync()|date:'dd/MM/yyyy, h:mm a'}}</small>}
          <button pButton type="button" label="Sync Wix" icon="pi pi-refresh" [loading]="syncing()" (click)="sync()"></button>
          <button pButton type="button" label="Load all Wix orders" [loading]="history.importing()" (click)="history.sync()"></button>
          <div class="search-box"><i class="pi pi-search"></i><input pInputText placeholder="Search orders" (input)="search.set($any($event.target).value)"></div>
        </div>
      </div>
      @if(orders.error()){<div class="error">{{orders.error()}}</div>}
      @if(history.error()){<div class="error">{{history.error()}}</div>}
      @if(history.importing()){<p role="status">Loading Wix history… {{history.progress()}} orders</p>}
      @if(history.message()){<p role="status">{{history.message()}}</p>}
      <div class="list-table"><p-table [value]="filtered()" [rowHover]="true" [paginator]="true" [rows]="50" [tableStyle]="{'min-width':'900px'}">
        <ng-template pTemplate="header"><tr><th>Order</th><th>Date</th><th>Customer</th><th class="items-count">Items</th><th>Payment</th><th>Fulfilment</th><th class="total-head">Total</th></tr></ng-template>
        <ng-template pTemplate="body" let-order>
          <tr class="row" (click)="selected.set(order)">
            <td><span class="order-no">#{{order.order_number}}</span></td>
            <td><span class="date">{{order.wix_created_at|date:'dd MMM yyyy'}}</span></td>
            <td><div class="customer-cell"><b>{{order.customer_name||'—'}}</b>@if(order.company){<small>{{order.company}}</small>}</div></td>
            <td class="items-count" title="Total quantity of order items, excluding delivery">{{itemCount(order)}}</td>
            <td><p-tag [value]="paymentLabel(order)" [severity]="paymentSeverity(order)" /></td>
            <td><div class="fulfilment-cell"><span class="method" [class.pickup]="isPickup(order)"><i [class]="isPickup(order)?'pi pi-map-marker':'pi pi-truck'"></i>{{isPickup(order)?'Pickup':'Delivery'}}</span><p-tag [value]="fulfilmentLabel(order)" [severity]="fulfilmentSeverity(order)" /></div></td>
            <td class="total">{{order.total||0|currency:(order.currency||'AUD')}}</td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage"><tr><td colspan="7" class="empty">No orders found.</td></tr></ng-template>
      </p-table></div>
    </section>
    @if(selected();as order){<app-order-drawer [order]="order" (closed)="selected.set(null)"/>}
  `,
  styles: [`@layer hub-layout {
    .items-count{text-align:center!important;width:70px;font-variant-numeric:tabular-nums}
    .sales-summary{display:flex;align-items:center;flex-wrap:wrap;gap:16px 30px;padding:14px 20px;margin-bottom:18px;background:var(--wc-surface);border:1px solid var(--wc-border);border-radius:12px}.metric{display:flex;align-items:center;gap:6px;font-size:13px;white-space:nowrap}.metric b{font-weight:600;color:#172033}.metric small{font-size:10px;color:#758198}.metric .positive{color:#12885e}.metric .negative{color:#dc362e}.sales-summary select{margin-left:auto;border:0;background:transparent;color:#3478f6;padding:5px;font:inherit;font-size:13px}

    .panel{min-width:0}.list-table{background:var(--wc-surface);border:1px solid var(--wc-border);border-radius:12px;overflow:hidden}.head{padding:0 0 14px;display:flex;align-items:center;gap:18px;flex-wrap:wrap}.title-block h1{margin:0}.title-block small{display:block;margin-top:8px;color:var(--wc-muted)}.actions{margin-left:auto;display:flex;gap:9px;align-items:center;flex-wrap:wrap}.sync-note{color:#98a2b3;font-size:10px;white-space:nowrap}.search-box{position:relative}.search-box i{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:#98a2b3;font-size:11px}.search-box input{width:235px;height:38px;padding-left:30px}.row{cursor:pointer}.order-no{font-weight:700;color:#172033}.date{color:#667085;font-size:12px}.customer-cell{display:flex;flex-direction:column;gap:2px}.customer-cell b{font-weight:600;color:#27364a}.customer-cell small{color:#8a95a8;font-size:11px}.fulfilment-cell{display:grid;grid-template-columns:80px max-content;align-items:center;gap:7px}.method{display:inline-flex;align-items:center;justify-content:center;white-space:nowrap;gap:5px;background:#f4f6f8;color:#475467;border-radius:999px;padding:5px 8px;font-size:10px;font-weight:600}.method.pickup{background:#fff7ed;color:#9a5b13}.method i{font-size:10px}.total,.total-head{text-align:right!important}.total{font-weight:400;color:#172033}.empty{text-align:center!important;color:#758198;padding:28px!important}.error{margin:12px 18px;background:#fff1f1;color:#8c2f2f;padding:10px;border-radius:8px}:host ::ng-deep .p-datatable-thead>tr>th{font-size:10px;text-transform:uppercase;letter-spacing:.03em;color:#8b95a7;background:#fafbfc;padding:11px 16px;border-color:#e8ebef}:host ::ng-deep .p-datatable-tbody>tr>td{padding:13px 16px;border-color:#edf0f3}:host ::ng-deep .p-datatable-tbody>tr:hover{background:#f8fafc!important}:host ::ng-deep .p-tag{font-size:10px;font-weight:700;padding:.25rem .5rem}@media(max-width:760px){.actions{margin-left:0;width:100%}.search-box,.search-box input{width:100%}}

}`]
})
export class OrdersComponent implements OnInit{
  search=signal('');selected=signal<OrderRow|null>(null);syncing=signal(false);
  period=signal<MetricsPeriod>('30');
  allOrders=computed(()=>mergeOrderHistory(this.orders.orders(),this.history.orders()));
  metrics=computed(()=>orderMetrics(this.allOrders(),this.period()));
  abs=Math.abs;
  filtered=computed(()=>{const q=this.search().toLowerCase();return this.allOrders().filter(o=>!q||JSON.stringify(o).toLowerCase().includes(q));});
  constructor(readonly orders:OrdersService,readonly history:OrderHistoryService,private readonly route:ActivatedRoute){}
  async ngOnInit(){
    if(!this.orders.orders().length) await this.orders.load();
    await this.history.load();
    const requested=this.route.snapshot.queryParamMap.get('order');
    if(requested){
      const order=this.allOrders().find(o=>String(o.order_number)===String(requested));
      if(order)this.selected.set(order);
    }
  }
  paymentLabel(order:OrderRow){return String(order.payment_status||'—').toUpperCase();}
  itemCount(order:OrderRow){return (order.wc_order_items??[]).filter(item=>!isDeliveryLine(item)).reduce((total,item)=>{const quantity=Number(item.quantity??0);return total+(Number.isFinite(quantity)&&quantity>0?quantity:0);},0);}
  paymentSeverity(order:OrderRow):'success'|'warn'|'danger'|'secondary'{const value=this.paymentLabel(order);if(value==='PAID')return'success';if(value.includes('PARTIAL')||value.includes('PENDING'))return'warn';if(value.includes('FAILED')||value.includes('REFUND'))return'danger';return'secondary';}
  fulfilmentLabel(order:OrderRow){const value=String(order.fulfillment_status||'UNFULFILLED').replaceAll('_',' ').toUpperCase();return value==='NOT FULFILLED'?'UNFULFILLED':value;}
  fulfilmentSeverity(order:OrderRow):'success'|'warn'|'danger'|'secondary'{const value=this.fulfilmentLabel(order);if(value==='FULFILLED')return'success';if(value.includes('PARTIAL'))return'warn';if(value.includes('UNFULFILLED'))return'danger';return'secondary';}
  isPickup(order:OrderRow){const value=String(order.delivery_type||order.delivery_title||'').toLowerCase();return value.includes('pickup')||value.includes('pick-up')||value.includes('pick up');}
  async sync(){this.syncing.set(true);try{await this.orders.syncWix();}catch(e){this.orders.error.set('Wix sync failed: '+String((e as Error)?.message??e));}finally{this.syncing.set(false);}}
}
