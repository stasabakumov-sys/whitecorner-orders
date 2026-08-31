import { Component, OnInit, computed } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FulfilmentService, ShipmentPackageRow } from '../../core/services/fulfilment.service';

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
            <article class="card shipcard">
              <div class="topline"><b>#{{o.order_number}}</b><span class="badge shipping">{{row.status}}</span></div>
              <h3>{{o.customer_name||'—'}}</h3><div class="mut">{{o.company}}</div>
              <div class="details"><span>Ready {{row.ready_at|date:'dd MMM yyyy, h:mm a'}}</span><span>{{o.delivery_title||'Delivery'}}</span></div>

              @if(f.shipmentFor(row);as shipment){
                <div class="shipment-head">
                  <div><b>Packages</b><div class="mut">{{f.packagesFor(shipment.id).length}} package(s)</div></div>
                  <span class="status" [class.good]="f.shipmentComplete(shipment.id)">{{shipment.status}}</span>
                </div>
                <div class="packages">
                  @for(pkg of f.packagesFor(shipment.id);track pkg.id){
                    <div class="pkg">
                      <div class="pkgno">{{pkg.package_no}}</div>
                      <div class="fields">
                        <input #pn [value]="pkg.package_name||''" placeholder="Package name">
                        <input #pl type="number" [value]="pkg.length_mm??''" placeholder="L mm">
                        <input #pw type="number" [value]="pkg.width_mm??''" placeholder="W mm">
                        <input #ph type="number" [value]="pkg.height_mm??''" placeholder="H mm">
                        <input #pk type="number" step="0.1" [value]="pkg.weight_kg??''" placeholder="kg">
                      </div>
                      <div class="pkgactions">
                        <button class="smallbtn" (click)="savePkg(pkg,pn.value,pl.value,pw.value,ph.value,pk.value)">Save</button>
                        <button class="smallbtn danger" (click)="f.removePackage(pkg)">Remove</button>
                      </div>
                    </div>
                  } @empty {
                    <div class="notice warn">No packaging profile matched automatically. Add the actual boxes below.</div>
                  }
                </div>
                @if(row.status==='Shipping Preparation'){
                  <div class="shipactions">
                    <button class="secondary" (click)="f.addPackage(shipment)">+ Add package</button>
                    <button class="primary" [disabled]="!f.shipmentComplete(shipment.id)" (click)="f.markShippingBooked(row)">Mark shipping booked</button>
                  </div>
                  @if(!f.shipmentComplete(shipment.id)){<div class="mut hint">Complete L × W × H and weight for every package before booking.</div>}
                } @else if(row.status==='Shipping Booked'){
                  <div class="done">Shipping booked ✓</div><div class="mut future">Tracking / In transit / Delivered will be added with courier integration.</div>
                }
              } @else {
                <div class="notice warn">Shipment record is being prepared.</div>
              }
            </article>
          }
        } @empty {<div class="empty">No shipping orders waiting.</div>}
      </div>
    </div>
  </section>`,
  styles:[`
    .panel{background:#fff;border:1px solid #e4e7ec;border-radius:12px;overflow:hidden}.head{padding:18px 20px;border-bottom:1px solid #e4e7ec;display:flex;align-items:flex-start;gap:20px}.head h2{margin:0 0 4px}.head p{margin:0;color:#758198;font-size:12px}.counts{margin-left:auto;display:flex;gap:18px;color:#758198}.counts b{color:#172033;margin-left:4px}.grid{display:grid;grid-template-columns:minmax(330px,.8fr) minmax(620px,1.2fr);gap:18px;padding:18px}.section-title{font-size:11px;text-transform:uppercase;color:#758198;font-weight:800;margin:0 0 8px}.card{border:1px solid #e4e7ec;border-radius:10px;padding:14px;margin-bottom:10px;background:#fff}.topline{display:flex;align-items:center;gap:10px}.badge{margin-left:auto;border-radius:999px;padding:4px 8px;font-size:11px;font-weight:700}.pickup{background:#e5f0ff;color:#2d62a8}.shipping{background:#ece9ff;color:#514a9e}.card h3{margin:10px 0 2px}.mut{color:#758198;font-size:12px}.details{display:flex;gap:14px;flex-wrap:wrap;margin-top:11px;font-size:12px}.notice{margin-top:12px;padding:10px 11px;background:#f7f9fc;border-radius:8px;font-size:12px}.warn{background:#fff8ed;color:#8a4b08}.primary,.secondary,.smallbtn{border-radius:8px;padding:8px 11px;cursor:pointer}.primary{background:#116dff;color:#fff;border:0}.primary:disabled{background:#a9b8cf;cursor:not-allowed}.secondary,.smallbtn{background:#fff;color:#116dff;border:1px solid #d4d9e2}.done{margin-top:12px;color:#17643d;font-weight:700}.future{margin-top:5px}.empty{border:1px dashed #d8dde6;border-radius:10px;padding:18px;color:#758198}.error{margin:14px 18px 0;background:#fff1f1;color:#8c2f2f;padding:10px;border-radius:8px}.shipment-head{margin-top:14px;padding-top:13px;border-top:1px solid #edf0f3;display:flex;align-items:center}.status{margin-left:auto;background:#fff0e6;color:#9a4b00;border-radius:999px;padding:4px 8px;font-size:11px;font-weight:700}.status.good{background:#d9f3e5;color:#17643d}.packages{margin-top:8px}.pkg{display:grid;grid-template-columns:28px 1fr auto;gap:8px;align-items:center;border:1px solid #edf0f3;border-radius:9px;padding:8px;margin-bottom:7px}.pkgno{width:25px;height:25px;border-radius:50%;background:#f1f4f7;display:grid;place-items:center;font-size:11px;font-weight:700}.fields{display:grid;grid-template-columns:minmax(125px,1.7fr) repeat(4,minmax(62px,.7fr));gap:6px}.fields input{width:100%;min-width:0;border:1px solid #d4d9e2;border-radius:7px;padding:7px 8px}.pkgactions{display:flex;gap:5px}.smallbtn{padding:7px 8px;font-size:11px}.danger{color:#b42318}.shipactions{display:flex;gap:8px;margin-top:11px}.hint{margin-top:6px}@media(max-width:1200px){.grid{grid-template-columns:1fr}.fields{grid-template-columns:1.5fr repeat(4,1fr)}}@media(max-width:760px){.pkg{grid-template-columns:28px 1fr}.pkgactions{grid-column:2}.fields{grid-template-columns:1fr 1fr}.head{flex-direction:column}.counts{margin-left:0}}
  `]
})
export class FulfilmentComponent implements OnInit{
  pickup=computed(()=>this.f.rows().filter(r=>r.route==='Pickup'&&r.status!=='Fulfilled'));
  shipping=computed(()=>this.f.rows().filter(r=>r.route==='Shipping'&&r.status!=='Fulfilled'));
  constructor(readonly f:FulfilmentService){}
  ngOnInit(){void this.f.load();}
  n(v:string){return v===''?null:Number(v);}
  savePkg(pkg:ShipmentPackageRow,name:string,l:string,w:string,h:string,kg:string){void this.f.savePackage(pkg,{package_name:name.trim()||'Package '+pkg.package_no,length_mm:this.n(l),width_mm:this.n(w),height_mm:this.n(h),weight_kg:this.n(kg)});}
}
