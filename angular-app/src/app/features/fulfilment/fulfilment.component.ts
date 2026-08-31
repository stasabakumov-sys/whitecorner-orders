import { Component, OnInit, computed, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { OrderItemRow } from '../../core/models/order.models';
import { FulfilmentRow, FulfilmentService, ShipmentPackageRow } from '../../core/services/fulfilment.service';

@Component({
  selector:'app-fulfilment',
  standalone:true,
  imports:[DatePipe],
  template:`
  <section class="panel">
    <div class="head">
      <div><h2>Fulfilment</h2><p>Orders move here after every production unit is Ready.</p></div>
      <div class="tabs">
        <button [class.on]="tab()==='Pickup'" (click)="tab.set('Pickup')">Pickup <b>{{pickup().length}}</b></button>
        <button [class.on]="tab()==='Delivery'" (click)="tab.set('Delivery')">Delivery <b>{{delivery().length}}</b></button>
      </div>
    </div>
    @if(f.error()){<div class="error">{{f.error()}}</div>}

    <div class="tablewrap">
      <table>
        <thead><tr><th>Order</th><th>Customer</th><th>Ready</th><th>Method</th><th>Status</th></tr></thead>
        <tbody>
          @for(row of visible();track row.id){
            @if(f.orderFor(row);as o){
              <tr (click)="selected.set(row)">
                <td><b>#{{o.order_number}}</b></td>
                <td>{{o.customer_name||'—'}}<small>{{o.company}}</small></td>
                <td>{{row.ready_at|date:'dd MMM yyyy, h:mm a'}}</td>
                <td>{{tab()==='Pickup'?'Pickup':(o.delivery_title||'Delivery')}}</td>
                <td><span class="badge" [class.pickup]="tab()==='Pickup'" [class.delivery]="tab()==='Delivery'">{{displayStatus(row)}}</span></td>
              </tr>
            }
          } @empty {
            <tr class="emptyrow"><td colspan="5">No {{tab().toLowerCase()}} orders yet.</td></tr>
          }
        </tbody>
      </table>
    </div>
  </section>

  @if(selected();as row){
    @if(f.orderFor(row);as o){
      <div class="shade" (click)="closeFromShade($event)">
        <aside class="drawer">
          <div class="drawerhead">
            <div><b class="orderno">#{{o.order_number}}</b><div class="customer">{{o.customer_name||'—'}}</div><div class="mut">{{o.company}}</div></div>
            <div class="drawerstatus"><span class="badge" [class.pickup]="row.route==='Pickup'" [class.delivery]="row.route==='Shipping'">{{displayStatus(row)}}</span></div>
            <button class="close" (click)="selected.set(null)">×</button>
          </div>
          <div class="drawerbody">
            <section class="section">
              <div class="sectiontitle">Overview</div>
              <div class="overview">
                <div class="box"><b>Fulfilment</b><span>{{row.route==='Pickup'?'Pickup':'Delivery'}}</span></div>
                <div class="box"><b>Ready</b><span>{{row.ready_at|date:'dd MMM yyyy, h:mm a'}}</span></div>
                <div class="box"><b>Status</b><span>{{displayStatus(row)}}</span></div>
                <div class="box"><b>Email</b><span>{{o.buyer_email||'—'}}</span></div>
              </div>
              @if(o.delivery_address){<div class="address"><b>Delivery address:</b> {{address(o.delivery_address)}}</div>}
            </section>

            <section class="section">
              <div class="sectiontitle">Order composition</div>
              @for(item of orderItems(o.wc_order_items||[]);track item.id){
                <div class="item">
                  @if(image(item)){<img [src]="image(item)" alt="">} @else {<div class="imgplaceholder"></div>}
                  <div class="itemmain"><b>{{item.product_name||'Unnamed item'}}</b><div class="chips"><span>qty: {{item.quantity||1}}</span>@for(opt of options(item);track opt){<span>{{opt}}</span>}</div></div>
                  <div class="price">{{item.unit_price!=null?'A$'+item.unit_price.toFixed(2):''}}</div>
                </div>
              }
            </section>

            @if(row.route==='Pickup'){
              <section class="section">
                <div class="sectiontitle">Pickup</div>
                <div class="callout">Ready-for-pickup email: <b>{{row.pickup_email_status}}</b></div>
                @if(row.status==='Awaiting Pickup'){
                  <button class="primary" (click)="collect(row)">Mark as collected</button>
                } @else {
                  <div class="done">Collected / Fulfilled ✓</div>
                }
              </section>
            } @else {
              <section class="section">
                <div class="sectiontitle">Packages</div>
                @if(f.shipmentFor(row);as shipment){
                  <div class="packagehead"><div><b>{{f.packagesFor(shipment.id).length}} package(s)</b><div class="mut">Review the automatically attached packages or add the actual boxes.</div></div><span class="shipmentstatus" [class.good]="f.shipmentComplete(shipment.id)">{{shipment.status}}</span></div>
                  <div class="packages">
                    @for(pkg of f.packagesFor(shipment.id);track pkg.id){
                      <div class="pkg">
                        <div class="pkgno">{{pkg.package_no}}</div>
                        <div class="pkgfields">
                          <label>Name<input #pn [value]="pkg.package_name||''"></label>
                          <label>L mm<input #pl type="number" [value]="pkg.length_mm??''"></label>
                          <label>W mm<input #pw type="number" [value]="pkg.width_mm??''"></label>
                          <label>H mm<input #ph type="number" [value]="pkg.height_mm??''"></label>
                          <label>kg<input #pk type="number" step="0.1" [value]="pkg.weight_kg??''"></label>
                        </div>
                        <div class="pkgactions"><button class="secondary" (click)="savePkg(pkg,pn.value,pl.value,pw.value,ph.value,pk.value)">Save</button><button class="remove" (click)="f.removePackage(pkg)">Remove</button></div>
                      </div>
                    } @empty {
                      <div class="callout warn">No packaging profile matched automatically. Add the actual package(s) below.</div>
                    }
                  </div>
                  @if(row.status==='Shipping Preparation'){
                    <div class="actions"><button class="secondary" (click)="f.addPackage(shipment)">+ Add package</button><button class="primary" [disabled]="!f.shipmentComplete(shipment.id)" (click)="book(row)">Mark shipping booked</button></div>
                    @if(!f.shipmentComplete(shipment.id)){<div class="mut hint">Complete L × W × H and weight for every package before booking.</div>}
                  } @else if(row.status==='Shipping Booked'){
                    <div class="done">Shipping booked ✓</div><div class="mut hint">Future: In Transit → Delivered → Fulfilled from courier tracking.</div>
                  }
                } @else {
                  <div class="callout warn">Shipment record is being prepared.</div>
                }
              </section>
            }
          </div>
        </aside>
      </div>
    }
  }`,
  styles:[`
    .panel{background:#fff;border:1px solid #e4e7ec;border-radius:12px;overflow:hidden}.head{padding:16px 18px;border-bottom:1px solid #e4e7ec;display:flex;align-items:center;gap:20px}.head h2{margin:0 0 4px}.head p{margin:0;color:#758198;font-size:12px}.tabs{margin-left:auto;display:inline-flex;background:#f3f5f8;border:1px solid #e1e5eb;border-radius:999px;padding:3px;gap:3px}.tabs button{border:0;background:transparent;border-radius:999px;padding:8px 15px;color:#5f6b7a;cursor:pointer}.tabs button.on{background:#fff;color:#116dff;box-shadow:0 1px 3px #0001}.tabs b{margin-left:5px}.error{margin:12px 18px 0;background:#fff1f1;color:#8c2f2f;padding:10px;border-radius:8px}.tablewrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:850px}th{text-align:left;background:#fafbfc;color:#758198;text-transform:uppercase;font-size:11px;padding:12px 14px}td{padding:14px;border-top:1px solid #edf0f3}tbody tr:not(.emptyrow){cursor:pointer}tbody tr:not(.emptyrow):hover{background:#f8fbff}td small{display:block;color:#758198;margin-top:3px}.emptyrow td{text-align:center;color:#758198;padding:28px}.badge{display:inline-block;border-radius:999px;padding:4px 9px;font-size:11px;font-weight:700}.badge.pickup{background:#e5f0ff;color:#2d62a8}.badge.delivery{background:#ece9ff;color:#514a9e}
    .shade{position:fixed;inset:0;background:#0f172a55;z-index:40}.drawer{position:absolute;right:0;top:0;bottom:0;width:min(980px,96vw);background:#fff;overflow:auto;box-shadow:-6px 0 25px #0002}.drawerhead{position:sticky;top:0;background:#fff;z-index:2;padding:18px 22px;border-bottom:1px solid #e4e7ec;display:flex;align-items:flex-start;gap:14px}.orderno{font-size:17px}.customer{margin-top:4px}.mut{color:#758198;font-size:12px}.drawerstatus{margin-left:auto}.close{border:0;background:#eef1f5;border-radius:50%;width:42px;height:42px;font-size:18px;cursor:pointer}.drawerbody{padding:20px 22px}.section{margin-bottom:24px}.sectiontitle{text-transform:uppercase;font-size:11px;font-weight:800;color:#758198;margin-bottom:9px}.overview{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.box{border:1px solid #e4e7ec;border-radius:8px;padding:10px;background:#fbfcfd}.box b,.box span{display:block}.box span{margin-top:4px}.address{margin-top:10px;color:#596579;font-size:12px}.item{display:grid;grid-template-columns:70px 1fr auto;gap:12px;align-items:start;border:1px solid #e4e7ec;border-radius:9px;padding:10px;margin-bottom:8px}.item img,.imgplaceholder{width:70px;height:70px;border:1px solid #e4e7ec;border-radius:7px;object-fit:cover;background:#f6f8fa}.chips{margin-top:5px}.chips span{display:inline-block;background:#f1f4f7;border-radius:5px;padding:4px 6px;font-size:11px;margin:3px 4px 0 0}.price{text-align:right}.callout{padding:11px 12px;background:#f7f9fc;border-radius:8px;font-size:12px}.warn{background:#fff8ed;color:#8a4b08}.primary,.secondary,.remove{border-radius:8px;padding:8px 11px;cursor:pointer}.primary{background:#116dff;color:#fff;border:0}.primary:disabled{background:#a9b8cf;cursor:not-allowed}.secondary{background:#fff;color:#116dff;border:1px solid #d4d9e2}.remove{background:#fff;color:#b42318;border:1px solid #e4caca}.done{margin-top:12px;color:#17643d;font-weight:700}.packagehead{display:flex;align-items:flex-start;gap:12px;margin-bottom:10px}.shipmentstatus{margin-left:auto;background:#fff0e6;color:#9a4b00;border-radius:999px;padding:4px 8px;font-size:11px;font-weight:700}.shipmentstatus.good{background:#d9f3e5;color:#17643d}.pkg{border:1px solid #e4e7ec;border-radius:9px;padding:10px;margin-bottom:8px;display:grid;grid-template-columns:30px 1fr auto;gap:10px;align-items:end}.pkgno{width:26px;height:26px;border-radius:50%;background:#f1f4f7;display:grid;place-items:center;font-size:11px;font-weight:700;align-self:center}.pkgfields{display:grid;grid-template-columns:minmax(150px,1.6fr) repeat(4,minmax(75px,.7fr));gap:7px}.pkgfields label{font-size:10px;color:#758198;text-transform:uppercase;font-weight:700}.pkgfields input{display:block;width:100%;margin-top:4px;border:1px solid #d4d9e2;border-radius:7px;padding:7px 8px;font:inherit;color:#172033}.pkgactions{display:flex;gap:6px}.actions{display:flex;gap:8px;margin-top:10px}.hint{margin-top:6px}@media(max-width:900px){.overview{grid-template-columns:1fr 1fr}.pkg{grid-template-columns:30px 1fr}.pkgactions{grid-column:2}.pkgfields{grid-template-columns:1fr 1fr}.head{align-items:flex-start;flex-direction:column}.tabs{margin-left:0}}@media(max-width:600px){.overview{grid-template-columns:1fr}.item{grid-template-columns:58px 1fr}.item img,.imgplaceholder{width:58px;height:58px}.price{grid-column:2;text-align:left}.pkgfields{grid-template-columns:1fr}}
  `]
})
export class FulfilmentComponent implements OnInit{
  tab=signal<'Pickup'|'Delivery'>('Delivery');
  selected=signal<FulfilmentRow|null>(null);
  pickup=computed(()=>this.f.rows().filter(r=>r.route==='Pickup'));
  delivery=computed(()=>this.f.rows().filter(r=>r.route==='Shipping'));
  visible=computed(()=>this.tab()==='Pickup'?this.pickup():this.delivery());
  constructor(readonly f:FulfilmentService){}
  ngOnInit(){void this.f.load();}
  displayStatus(row:FulfilmentRow){if(row.route==='Pickup')return row.status==='Fulfilled'?'Fulfilled':'Awaiting Pickup';const s=this.f.shipmentFor(row);return row.status==='Fulfilled'?'Fulfilled':(s?.status||row.status);}
  orderItems(items:OrderItemRow[]){return items.filter(i=>!/^delivery$/i.test(i.product_name||''));}
  image(item:OrderItemRow){const x:any=item.image||{},r:any=item.raw_item||{};return x.url||x.imageUrl||x.imageInfo?.url||r.media?.url||r.image?.url||r.image?.imageInfo?.url||'';}
  options(item:OrderItemRow){const out:string[]=[];for(const obj of [item.wix_options,item.custom_text_fields])if(obj&&typeof obj==='object')for(const [k,v] of Object.entries(obj)){const z=typeof v==='object'&&v?(v as any).value||(v as any).name||(v as any).description:' '+String(v??'');if(String(z).trim())out.push(`${k}: ${String(z).trim()}`);}return [...new Set(out)].slice(0,10);}
  address(a:Record<string,unknown>){const x:any=a;return [x.addressLine,x.city,x.subdivision,x.postalCode,x.country].filter(Boolean).join(', ');}
  n(v:string){return v===''?null:Number(v);}
  savePkg(pkg:ShipmentPackageRow,name:string,l:string,w:string,h:string,kg:string){void this.f.savePackage(pkg,{package_name:name.trim()||'Package '+pkg.package_no,length_mm:this.n(l),width_mm:this.n(w),height_mm:this.n(h),weight_kg:this.n(kg)});}
  async collect(row:FulfilmentRow){await this.f.markCollected(row);}
  async book(row:FulfilmentRow){await this.f.markShippingBooked(row);}
  closeFromShade(e:MouseEvent){if((e.target as HTMLElement).classList.contains('shade'))this.selected.set(null);}
}
