import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PartnerPansService } from '../../core/services/partner-pans.service';

@Component({
 selector:'app-partner-pans',standalone:true,imports:[CommonModule,FormsModule],
 template:`
 <header><div><h1>Partner Pans</h1><p>Pans are ordered from partners and sent directly to the customer. They do not need Hub packaging.</p></div>
 <button (click)="s.load()" [disabled]="s.loading()||s.busy()">Refresh</button></header>
 @if(s.error()){<p role="alert">{{s.error()}}</p>}
 <div class="toolbar"><label>Show <select [(ngModel)]="filter"><option value="pending">To arrange</option><option value="ordered_and_sent">Ordered and sent</option><option value="all">All</option></select></label>
 <input aria-label="Search Pans orders" [(ngModel)]="search" placeholder="Order or customer"></div>
 @if(s.loading()){<p role="status">Loading…</p>}
 <div class="table-wrap"><table><thead><tr><th>Order / Customer</th><th>Product</th><th>Pans selection</th><th>Product qty</th><th>Status</th><th>Updated</th><th></th></tr></thead><tbody>
 @for(row of visible();track row.item.id){<tr><td><b>#{{row.order.order_number}}</b><small>{{row.order.customer_name}}</small></td>
 <td>{{row.item.product_name}}</td><td>@for(choice of row.pans.choices;track choice){<div>{{choice}}</div>}</td><td>{{row.pans.quantity}}</td>
 <td><span class="badge" [class.done]="row.status==='ordered_and_sent'">{{row.status==='ordered_and_sent'?'Ordered and sent':'To arrange'}}</span>
 @if(row.changed){<small>Selection or quantity changed; check again.</small>}</td>
 <td>{{row.record?.updated_at?(row.record.updated_at|date:'dd MMM yyyy, HH:mm'):'—'}}</td>
 <td><button [disabled]="s.busy()||s.loading()" (click)="s.setStatus(row,row.status==='ordered_and_sent'?'pending':'ordered_and_sent')">{{s.busy()?'Saving…':row.status==='ordered_and_sent'?'Mark to arrange':'Mark ordered and sent'}}</button></td></tr>}
 @empty{<tr><td colspan="7">{{s.loading()?'Loading…':'No matching Pans orders.'}}</td></tr>}
 </tbody></table></div>
 <p>“Mark ordered and sent” records your confirmation only. It does not place an order, book delivery or contact the customer.</p>
 `,
 styles:[`:host{display:block}header,.toolbar{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:1rem}h1{margin:0}p,small{color:#64748b}small{display:block;margin-top:.3rem}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:.75rem 1rem;border-bottom:1px solid #e2e8f0;vertical-align:top}th{background:#f8fafc}.badge{display:inline-block;background:#fff3d6;color:#92400e;border-radius:6px;padding:.3rem .6rem;white-space:nowrap}.badge.done{background:#dcfce7;color:#166534}[role=alert]{color:#b91c1c}button,input,select{font:inherit}button{cursor:pointer}button:disabled{cursor:wait}`],
})
export class PartnerPansComponent implements OnInit {
 filter='pending';search='';
 constructor(public s:PartnerPansService){}
 ngOnInit(){void this.s.load();}
 visible(){const query=this.search.trim().toLowerCase().replace(/^#/,'');return this.s.rows().filter(r=>(this.filter==='all'||r.status===this.filter)&&(!query||`${r.order.order_number} ${r.order.customer_name}`.toLowerCase().includes(query)));}
}
