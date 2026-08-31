import { Component, OnInit, computed } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FulfilmentService } from '../../core/services/fulfilment.service';

@Component({
  selector:'app-fulfilment',
  standalone:true,
  imports:[DatePipe],
  template:`
  <section class="panel">
    <div class="head"><div><h2>Fulfilment</h2><p>Orders move here after every production unit is Ready.</p></div><div class="counts"><span>Pickup <b>{{pickup().length}}</b></span><span>Shipping <b>{{shipping().length}}</b></span></div></div>
    @if(f.error()){<div class="error">{{f.error()}}</div>}
    <div class="grid">
      <div>
        <div class="section-title">Pickup</div>
        @for(row of pickup();track row.id){
          @if(f.orderFor(row);as o){
            <article class="card">
              <div class="topline"><b>#{{o.order_number}}</b><span class="badge pickup">{{row.status}}</span></div>
              <h3>{{o.customer_name||'—'}}</h3><div class="mut">{{o.company}}</div>
              <div class="details"><span>Ready {{row.ready_at|date:'dd MMM yyyy, h:mm a'}}</span><span>{{o.buyer_email||'No email'}}</span></div>
              <div class="notice">Ready-for-pickup email: <b>{{row.pickup_email_status}}</b></div>
              @if(row.status==='Awaiting Pickup'){
                <button class="primary" (click)="f.markCollected(row)">Mark as collected</button>
              } @else {
                <div class="done">Fulfilled ✓</div>
              }
            </article>
          }
        } @empty {<div class="empty">No pickup orders waiting.</div>}
      </div>
      <div>
        <div class="section-title">Shipping</div>
        @for(row of shipping();track row.id){
          @if(f.orderFor(row);as o){
            <article class="card">
              <div class="topline"><b>#{{o.order_number}}</b><span class="badge shipping">{{row.status}}</span></div>
              <h3>{{o.customer_name||'—'}}</h3><div class="mut">{{o.company}}</div>
              <div class="details"><span>Ready {{row.ready_at|date:'dd MMM yyyy, h:mm a'}}</span><span>{{o.delivery_title||'Delivery'}}</span></div>
              @if(row.status==='Shipping Preparation'){
                <div class="notice">Check package count, dimensions and weight before booking delivery.</div>
                <button class="primary" (click)="f.markShippingBooked(row)">Mark shipping booked</button>
              } @else if(row.status==='Shipping Booked'){
                <div class="done">Shipping booked ✓</div><div class="mut future">Tracking / In transit / Delivered will be added with courier integration.</div>
              } @else {<div class="done">Fulfilled ✓</div>}
            </article>
          }
        } @empty {<div class="empty">No shipping orders waiting.</div>}
      </div>
    </div>
  </section>`,
  styles:[`
    .panel{background:#fff;border:1px solid #e4e7ec;border-radius:12px;overflow:hidden}.head{padding:18px 20px;border-bottom:1px solid #e4e7ec;display:flex;align-items:flex-start;gap:20px}.head h2{margin:0 0 4px}.head p{margin:0;color:#758198;font-size:12px}.counts{margin-left:auto;display:flex;gap:18px;color:#758198}.counts b{color:#172033;margin-left:4px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;padding:18px}.section-title{font-size:11px;text-transform:uppercase;color:#758198;font-weight:800;margin:0 0 8px}.card{border:1px solid #e4e7ec;border-radius:10px;padding:14px;margin-bottom:10px;background:#fff}.topline{display:flex;align-items:center;gap:10px}.badge{margin-left:auto;border-radius:999px;padding:4px 8px;font-size:11px;font-weight:700}.pickup{background:#e5f0ff;color:#2d62a8}.shipping{background:#ece9ff;color:#514a9e}.card h3{margin:10px 0 2px}.mut{color:#758198;font-size:12px}.details{display:flex;gap:14px;flex-wrap:wrap;margin-top:11px;font-size:12px}.notice{margin-top:12px;padding:10px 11px;background:#f7f9fc;border-radius:8px;font-size:12px}.primary{margin-top:12px;background:#116dff;color:#fff;border:0;border-radius:8px;padding:8px 11px;cursor:pointer}.done{margin-top:12px;color:#17643d;font-weight:700}.future{margin-top:5px}.empty{border:1px dashed #d8dde6;border-radius:10px;padding:18px;color:#758198}.error{margin:14px 18px 0;background:#fff1f1;color:#8c2f2f;padding:10px;border-radius:8px}@media(max-width:900px){.grid{grid-template-columns:1fr}}
  `]
})
export class FulfilmentComponent implements OnInit{
  pickup=computed(()=>this.f.rows().filter(r=>r.route==='Pickup'&&r.status!=='Fulfilled'));
  shipping=computed(()=>this.f.rows().filter(r=>r.route==='Shipping'&&r.status!=='Fulfilled'));
  constructor(readonly f:FulfilmentService){}
  ngOnInit(){void this.f.load();}
}
