import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { OrderRow } from '../../core/models/order.models';
import { OrdersService } from '../../core/services/orders.service';
import { OrderDrawerComponent } from '../../shared/order-drawer/order-drawer.component';

@Component({
  selector:'app-orders',
  standalone:true,
  imports:[CurrencyPipe,DatePipe,ButtonModule,InputTextModule,TableModule,TagModule,OrderDrawerComponent],
  template:`
    <section class="panel">
      <div class="head">
        <div class="title-block"><h2>Orders</h2><small>{{orders.orders().length}} orders</small></div>
        <div class="actions">
          @if(orders.lastSync()){<small class="sync-note">Wix synced {{orders.lastSync()|date:'dd/MM/yyyy, h:mm a'}}</small>}
          <button pButton type="button" label="Sync Wix" icon="pi pi-refresh" [loading]="syncing()" (click)="sync()"></button>
          <div class="search-box"><i class="pi pi-search"></i><input pInputText placeholder="Search orders" (input)="search.set($any($event.target).value)"></div>
        </div>
      </div>
      @if(orders.error()){<div class="error">{{orders.error()}}</div>}
      <p-table [value]="filtered()" [rowHover]="true" [tableStyle]="{'min-width':'900px'}">
        <ng-template pTemplate="header"><tr><th>Order</th><th>Date</th><th>Customer</th><th>Payment</th><th>Fulfilment</th><th class="total-head">Total</th></tr></ng-template>
        <ng-template pTemplate="body" let-order>
          <tr class="row" (click)="selected.set(order)">
            <td><span class="order-no">#{{order.order_number}}</span></td>
            <td><span class="date">{{order.wix_created_at|date:'dd MMM yyyy'}}</span></td>
            <td><div class="customer-cell"><b>{{order.customer_name||'—'}}</b>@if(order.company){<small>{{order.company}}</small>}</div></td>
            <td><p-tag [value]="paymentLabel(order)" [severity]="paymentSeverity(order)" /></td>
            <td><div class="fulfilment-cell"><span class="method" [class.pickup]="isPickup(order)"><i [class]="isPickup(order)?'pi pi-map-marker':'pi pi-truck'"></i>{{isPickup(order)?'Pickup':'Delivery'}}</span><p-tag [value]="fulfilmentLabel(order)" [severity]="fulfilmentSeverity(order)" /></div></td>
            <td class="total"><b>{{order.total||0|currency:(order.currency||'AUD')}}</b></td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage"><tr><td colspan="6" class="empty">No orders found.</td></tr></ng-template>
      </p-table>
    </section>
    @if(selected();as order){<app-order-drawer [order]="order" (closed)="selected.set(null)"/>}
  `,
  styles:[`
    .panel{background:#fff;border:1px solid #e4e7ec;border-radius:12px;overflow:hidden}.head{padding:15px 18px;border-bottom:1px solid #e4e7ec;display:flex;align-items:center;gap:18px;flex-wrap:wrap}.title-block h2{margin:0;font-size:23px;font-weight:600;color:#101828}.title-block small{display:block;margin-top:3px;color:#98a2b3;font-size:11px}.actions{margin-left:auto;display:flex;gap:9px;align-items:center;flex-wrap:wrap}.sync-note{color:#98a2b3;font-size:10px;white-space:nowrap}.search-box{position:relative}.search-box i{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:#98a2b3;font-size:11px}.search-box input{width:235px;height:38px;padding-left:30px}.row{cursor:pointer}.order-no{font-weight:700;color:#172033}.date{color:#667085;font-size:12px}.customer-cell{display:flex;flex-direction:column;gap:2px}.customer-cell b{font-weight:600;color:#27364a}.customer-cell small{color:#8a95a8;font-size:11px}.fulfilment-cell{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.method{display:inline-flex;align-items:center;gap:5px;background:#f4f6f8;color:#475467;border-radius:999px;padding:5px 8px;font-size:10px;font-weight:600}.method.pickup{background:#fff7ed;color:#9a5b13}.method i{font-size:10px}.total,.total-head{text-align:right!important}.total b{font-weight:700;color:#172033}.empty{text-align:center!important;color:#758198;padding:28px!important}.error{margin:12px 18px;background:#fff1f1;color:#8c2f2f;padding:10px;border-radius:8px}:host ::ng-deep .p-datatable-thead>tr>th{font-size:10px;text-transform:uppercase;letter-spacing:.03em;color:#8b95a7;background:#fafbfc;padding:11px 16px;border-color:#e8ebef}:host ::ng-deep .p-datatable-tbody>tr>td{padding:13px 16px;border-color:#edf0f3}:host ::ng-deep .p-datatable-tbody>tr:hover{background:#f8fafc!important}:host ::ng-deep .p-tag{font-size:10px;font-weight:700;padding:.25rem .5rem}@media(max-width:760px){.actions{margin-left:0;width:100%}.search-box,.search-box input{width:100%}}
  `]
})
export class OrdersComponent implements OnInit{
  search=signal('');selected=signal<OrderRow|null>(null);syncing=signal(false);
  filtered=computed(()=>{const q=this.search().toLowerCase();return this.orders.orders().filter(o=>!q||JSON.stringify(o).toLowerCase().includes(q));});
  constructor(readonly orders:OrdersService,private readonly route:ActivatedRoute){}
  async ngOnInit(){
    if(!this.orders.orders().length) await this.orders.load();
    const requested=this.route.snapshot.queryParamMap.get('order');
    if(requested){
      const order=this.orders.orders().find(o=>String(o.order_number)===String(requested));
      if(order)this.selected.set(order);
    }
  }
  paymentLabel(order:OrderRow){return String(order.payment_status||'—').toUpperCase();}
  paymentSeverity(order:OrderRow):'success'|'warn'|'danger'|'secondary'{const value=this.paymentLabel(order);if(value==='PAID')return'success';if(value.includes('PARTIAL')||value.includes('PENDING'))return'warn';if(value.includes('FAILED')||value.includes('REFUND'))return'danger';return'secondary';}
  fulfilmentLabel(order:OrderRow){const value=String(order.fulfillment_status||'UNFULFILLED').replaceAll('_',' ').toUpperCase();return value==='NOT FULFILLED'?'UNFULFILLED':value;}
  fulfilmentSeverity(order:OrderRow):'success'|'warn'|'danger'|'secondary'{const value=this.fulfilmentLabel(order);if(value==='FULFILLED')return'success';if(value.includes('PARTIAL'))return'warn';if(value.includes('UNFULFILLED'))return'danger';return'secondary';}
  isPickup(order:OrderRow){const value=String(order.delivery_type||order.delivery_title||'').toLowerCase();return value.includes('pickup')||value.includes('pick-up')||value.includes('pick up');}
  async sync(){this.syncing.set(true);try{await this.orders.syncWix();}catch(e){this.orders.error.set('Wix sync failed: '+String((e as Error)?.message??e));}finally{this.syncing.set(false);}}
}
