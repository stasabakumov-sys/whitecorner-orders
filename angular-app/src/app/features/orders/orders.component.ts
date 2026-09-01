import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, OnInit, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { OrderRow } from '../../core/models/order.models';
import { OrdersService } from '../../core/services/orders.service';
import { OrderDrawerComponent } from '../../shared/order-drawer/order-drawer.component';

@Component({
  selector:'app-orders',
  standalone:true,
  imports:[CurrencyPipe,DatePipe,ButtonModule,InputTextModule,TableModule,OrderDrawerComponent],
  template:`
    <section class="panel">
      <div class="head">
        <div><h2>Orders</h2><small>{{orders.orders().length}} orders</small></div>
        <div class="actions">
          @if(orders.lastSync()){<small>Wix synced {{orders.lastSync()|date:'dd/MM/yyyy, h:mm:ss a'}}</small>}
          <button pButton type="button" label="Sync Wix" [loading]="syncing()" (click)="sync()"></button>
          <input pInputText placeholder="Search orders" (input)="search.set($any($event.target).value)">
        </div>
      </div>
      @if(orders.error()){<div class="error">{{orders.error()}}</div>}
      <p-table [value]="filtered()" [rowHover]="true" [tableStyle]="{'min-width':'850px'}">
        <ng-template pTemplate="header"><tr><th>Order</th><th>Date created</th><th>Customer</th><th>Payment</th><th>Fulfilment</th><th>Total</th></tr></ng-template>
        <ng-template pTemplate="body" let-order><tr class="row" (click)="selected.set(order)"><td><b>#{{order.order_number}}</b></td><td>{{order.wix_created_at|date:'dd MMM yyyy'}}</td><td>{{order.customer_name||'—'}}<small>{{order.company}}</small></td><td>{{order.payment_status||'—'}}</td><td>{{order.delivery_type||'Shipping'}}</td><td><b>{{order.total||0|currency:(order.currency||'AUD')}}</b></td></tr></ng-template>
        <ng-template pTemplate="emptymessage"><tr><td colspan="6" class="empty">No orders found.</td></tr></ng-template>
      </p-table>
    </section>
    @if(selected();as order){<app-order-drawer [order]="order" (closed)="selected.set(null)"/>}
  `,
  styles:[`
    .panel{background:#fff;border:1px solid #e4e7ec;border-radius:12px;overflow:hidden}.head{padding:16px 18px;border-bottom:1px solid #e4e7ec;display:flex;align-items:center;gap:18px;flex-wrap:wrap}.head h2{margin:0 0 3px}.head small,td small{color:#758198;font-size:12px}.actions{margin-left:auto;display:flex;gap:10px;align-items:center;flex-wrap:wrap}.actions input{width:220px}.row{cursor:pointer}.row td small{display:block;margin-top:3px}.empty{text-align:center!important;color:#758198;padding:28px!important}.error{margin:12px 18px;background:#fff1f1;color:#8c2f2f;padding:10px;border-radius:8px}:host ::ng-deep .p-datatable-thead>tr>th{font-size:11px;text-transform:uppercase;color:#758198;background:#fafbfc}@media(max-width:760px){.actions{margin-left:0;width:100%}.actions input{width:100%}}
  `]
})
export class OrdersComponent implements OnInit{
  search=signal('');selected=signal<OrderRow|null>(null);syncing=signal(false);
  filtered=computed(()=>{const q=this.search().toLowerCase();return this.orders.orders().filter(o=>!q||JSON.stringify(o).toLowerCase().includes(q));});
  constructor(readonly orders:OrdersService){}
  ngOnInit(){if(!this.orders.orders().length)void this.orders.load();}
  async sync(){this.syncing.set(true);try{await this.orders.syncWix();}catch(e){this.orders.error.set('Wix sync failed: '+String((e as Error)?.message??e));}finally{this.syncing.set(false);}}
}
