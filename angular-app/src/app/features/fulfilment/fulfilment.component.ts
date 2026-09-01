import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { DrawerModule } from 'primeng/drawer';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { OrderItemRow } from '../../core/models/order.models';
import { FulfilmentRow, FulfilmentService, ShipmentPackageRow } from '../../core/services/fulfilment.service';

@Component({
  selector: 'app-fulfilment',
  standalone: true,
  imports: [DatePipe, ButtonModule, DrawerModule, InputTextModule, TableModule, TagModule],
  template: `
    <section class="page-card">
      <div class="page-head">
        <div>
          <h2>Fulfilment</h2>
          <p>Orders move here after every production unit is Ready.</p>
          <div class="route-buttons">
            <p-button label="Pickup" [badge]="String(pickup().length)" [outlined]="tab() !== 'Pickup'" [severity]="tab() === 'Pickup' ? 'primary' : 'secondary'" (onClick)="tab.set('Pickup')" />
            <p-button label="Delivery" [badge]="String(delivery().length)" [outlined]="tab() !== 'Delivery'" [severity]="tab() === 'Delivery' ? 'primary' : 'secondary'" (onClick)="tab.set('Delivery')" />
          </div>
        </div>
      </div>

      @if (f.error()) { <div class="error">{{ f.error() }}</div> }

      <p-table [value]="visible()" [tableStyle]="{ 'min-width': '54rem' }" [rowHover]="true">
        <ng-template pTemplate="header"><tr><th>Order</th><th>Customer</th><th>Ready</th><th>Method</th><th>Status</th></tr></ng-template>
        <ng-template pTemplate="body" let-row>
          @if (f.orderFor(row); as o) {
            <tr class="order-row" (click)="selected.set(row)">
              <td><b>#{{ o.order_number }}</b></td>
              <td>{{ o.customer_name || '—' }}@if (o.company) { <small>{{ o.company }}</small> }</td>
              <td>{{ row.ready_at | date:'dd MMM yyyy, h:mm a' }}</td>
              <td>{{ row.route === 'Pickup' ? 'Pickup' : (o.delivery_title || 'Delivery') }}</td>
              <td><p-tag [value]="displayStatus(row)" [severity]="statusSeverity(row)" /></td>
            </tr>
          }
        </ng-template>
        <ng-template pTemplate="emptymessage"><tr><td colspan="5" class="empty">No {{ tab().toLowerCase() }} orders yet.</td></tr></ng-template>
      </p-table>
    </section>

    <p-drawer [visible]="selected() !== null" (visibleChange)="onDrawerVisible($event)" position="right" [modal]="true" [dismissible]="true" [blockScroll]="true" [style]="{ width: 'min(980px, 96vw)' }">
      @if (selected(); as row) {
        @if (f.orderFor(row); as o) {
          <ng-template pTemplate="header">
            <div class="drawer-title"><div><b class="order-number">#{{ o.order_number }}</b><div>{{ o.customer_name || '—' }}</div><small>{{ o.company }}</small></div><p-tag [value]="displayStatus(row)" [severity]="statusSeverity(row)" /></div>
          </ng-template>
          <div class="drawer-body">
            <section class="section">
              <div class="section-title">Overview</div>
              <div class="overview">
                <div class="info-box"><b>Fulfilment</b><span>{{ row.route === 'Pickup' ? 'Pickup' : 'Delivery' }}</span></div>
                <div class="info-box"><b>Ready</b><span>{{ row.ready_at | date:'dd MMM yyyy, h:mm a' }}</span></div>
                <div class="info-box"><b>Status</b><span>{{ displayStatus(row) }}</span></div>
                <div class="info-box"><b>Email</b><span>{{ o.buyer_email || '—' }}</span></div>
              </div>
              @if (o.delivery_address) { <div class="address"><b>Delivery address:</b> {{ address(o.delivery_address) }}</div> }
            </section>

            <section class="section">
              <div class="section-title">Order composition</div>
              @for (item of orderItems(o.wc_order_items || []); track item.id) {
                <div class="item-card">
                  @if (image(item)) { <img [src]="image(item)" alt="" /> } @else { <div class="image-placeholder"></div> }
                  <div><b>{{ item.product_name || 'Unnamed item' }}</b><div class="chips"><span>qty: {{ item.quantity || 1 }}</span>@for (opt of options(item); track opt) { <span>{{ opt }}</span> }</div></div>
                  <div class="price">{{ item.unit_price != null ? 'A$' + item.unit_price.toFixed(2) : '' }}</div>
                </div>
              }
            </section>

            @if (row.route === 'Pickup') {
              <section class="section">
                <div class="section-title">Pickup</div>
                <div class="callout">Ready-for-pickup email: <b>{{ row.pickup_email_status }}</b></div>
                @if (row.status === 'Awaiting Pickup') { <p-button label="Mark as collected" (onClick)="collect(row)" /> } @else { <div class="done">Collected / Fulfilled ✓</div> }
              </section>
            } @else {
              <section class="section">
                <div class="section-title">Packages</div>
                @if (f.shipmentFor(row); as shipment) {
                  <div class="package-head"><div><b>{{ f.packagesFor(shipment.id).length }} package(s)</b><div class="muted">Review automatically attached packages or add the actual boxes.</div></div><p-tag [value]="shipment.status" [severity]="shipmentSeverity(shipment.status)" /></div>
                  @for (pkg of f.packagesFor(shipment.id); track pkg.id) {
                    <div class="package-card">
                      <div class="package-no">{{ pkg.package_no }}</div>
                      <div class="package-fields">
                        <label>Name<input pInputText #pn [value]="pkg.package_name || ''" /></label>
                        <label>L mm<input pInputText #pl type="number" [value]="pkg.length_mm ?? ''" /></label>
                        <label>W mm<input pInputText #pw type="number" [value]="pkg.width_mm ?? ''" /></label>
                        <label>H mm<input pInputText #ph type="number" [value]="pkg.height_mm ?? ''" /></label>
                        <label>kg<input pInputText #pk type="number" step="0.1" [value]="pkg.weight_kg ?? ''" /></label>
                      </div>
                      <div class="package-actions"><p-button label="Save" size="small" outlined (onClick)="savePkg(pkg,pn.value,pl.value,pw.value,ph.value,pk.value)" /><p-button label="Remove" size="small" severity="danger" text (onClick)="f.removePackage(pkg)" /></div>
                    </div>
                  } @empty { <div class="callout warning">No packaging profile matched automatically. Add the actual package(s) below.</div> }
                  @if (row.status === 'Shipping Preparation') {
                    <div class="actions"><p-button label="Add package" severity="secondary" outlined (onClick)="f.addPackage(shipment)" /><p-button label="Mark shipping booked" [disabled]="!f.shipmentComplete(shipment.id)" (onClick)="book(row)" /></div>
                    @if (!f.shipmentComplete(shipment.id)) { <div class="muted hint">Complete L × W × H and weight for every package before booking.</div> }
                  } @else if (row.status === 'Shipping Booked') { <div class="done">Shipping booked ✓</div><div class="muted hint">Future: In Transit → Delivered → Fulfilled from courier tracking.</div> }
                } @else { <div class="callout warning">Shipment record is being prepared.</div> }
              </section>
            }
          </div>
        }
      }
    </p-drawer>
  `,
  styles: [`
    .page-card{background:#fff;border:1px solid #e4e7ec;border-radius:12px;overflow:hidden}.page-head{padding:18px 20px 14px;border-bottom:1px solid #e4e7ec}.page-head h2{margin:0 0 4px}.page-head p{margin:0;color:#758198;font-size:12px}.route-buttons{display:flex;gap:8px;margin-top:14px}.error{margin:12px 18px;background:#fff1f1;color:#8c2f2f;padding:10px;border-radius:8px}.order-row{cursor:pointer}.order-row td small{display:block;color:#758198;margin-top:3px}.empty{text-align:center;color:#758198;padding:28px}.drawer-title{display:flex;align-items:center;justify-content:space-between;gap:18px;width:100%;padding-right:8px}.drawer-title small{display:block;color:#758198;margin-top:2px}.order-number{font-size:17px}.drawer-body{padding:4px 2px 18px}.section{margin-bottom:24px}.section-title{text-transform:uppercase;font-size:11px;font-weight:800;color:#758198;margin-bottom:9px}.overview{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.info-box{border:1px solid #e4e7ec;border-radius:8px;padding:10px;background:#fbfcfd}.info-box b,.info-box span{display:block}.info-box span{margin-top:4px}.address{margin-top:10px;color:#596579;font-size:12px}.item-card{display:grid;grid-template-columns:70px 1fr auto;gap:12px;align-items:start;border:1px solid #e4e7ec;border-radius:9px;padding:10px;margin-bottom:8px}.item-card img,.image-placeholder{width:70px;height:70px;border:1px solid #e4e7ec;border-radius:7px;object-fit:cover;background:#f6f8fa}.chips{margin-top:5px}.chips span{display:inline-block;background:#f1f4f7;border-radius:5px;padding:4px 6px;font-size:11px;margin:3px 4px 0 0}.price{text-align:right}.callout{padding:11px 12px;background:#f7f9fc;border-radius:8px;font-size:12px;margin-bottom:12px}.warning{background:#fff8ed;color:#8a4b08}.done{margin-top:12px;color:#17643d;font-weight:700}.package-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px}.muted{color:#758198;font-size:12px}.package-card{border:1px solid #e4e7ec;border-radius:9px;padding:10px;margin-bottom:8px;display:grid;grid-template-columns:30px 1fr auto;gap:10px;align-items:end}.package-no{width:26px;height:26px;border-radius:50%;background:#f1f4f7;display:grid;place-items:center;font-size:11px;font-weight:700;align-self:center}.package-fields{display:grid;grid-template-columns:minmax(150px,1.6fr) repeat(4,minmax(75px,.7fr));gap:7px}.package-fields label{font-size:10px;color:#758198;text-transform:uppercase;font-weight:700}.package-fields input{display:block;width:100%;margin-top:4px}.package-actions{display:flex;gap:4px}.actions{display:flex;gap:8px;margin-top:10px}.hint{margin-top:6px}@media(max-width:900px){.overview{grid-template-columns:1fr 1fr}.package-card{grid-template-columns:30px 1fr}.package-actions{grid-column:2}.package-fields{grid-template-columns:1fr 1fr}}@media(max-width:600px){.overview{grid-template-columns:1fr}.item-card{grid-template-columns:58px 1fr}.item-card img,.image-placeholder{width:58px;height:58px}.price{grid-column:2;text-align:left}.package-fields{grid-template-columns:1fr}.route-buttons{flex-wrap:wrap}}
  `],
})
export class FulfilmentComponent implements OnInit {
  readonly String = String;
  tab = signal<'Pickup' | 'Delivery'>('Delivery');
  selected = signal<FulfilmentRow | null>(null);
  pickup = computed(() => this.f.rows().filter((r) => r.route === 'Pickup'));
  delivery = computed(() => this.f.rows().filter((r) => r.route === 'Shipping'));
  visible = computed(() => this.tab() === 'Pickup' ? this.pickup() : this.delivery());
  constructor(readonly f: FulfilmentService) {}
  ngOnInit() { void this.f.load(); }
  displayStatus(row: FulfilmentRow) { if (row.route === 'Pickup') return row.status === 'Fulfilled' ? 'Fulfilled' : 'Awaiting Pickup'; const shipment = this.f.shipmentFor(row); return row.status === 'Fulfilled' ? 'Fulfilled' : (shipment?.status || row.status); }
  statusSeverity(row: FulfilmentRow): 'success'|'info'|'warn'|'secondary' { const s=this.displayStatus(row); if(s==='Fulfilled'||s==='Delivered')return'success'; if(s==='Ready to Book')return'info'; if(s==='Packaging Review'||s==='Awaiting Pickup')return'warn'; return'secondary'; }
  shipmentSeverity(status:string): 'success'|'info'|'warn'|'secondary' { if(status==='Delivered')return'success'; if(status==='Ready to Book')return'info'; if(status==='Packaging Review')return'warn'; return'secondary'; }
  orderItems(items: OrderItemRow[]) { return items.filter((i) => !/^delivery$/i.test(i.product_name || '')); }
  image(item: OrderItemRow) { const x:any=item.image||{},r:any=item.raw_item||{}; return x.url||x.imageUrl||x.imageInfo?.url||r.media?.url||r.image?.url||r.image?.imageInfo?.url||''; }
  options(item: OrderItemRow) { const out:string[]=[]; for(const obj of [item.wix_options,item.custom_text_fields]) if(obj&&typeof obj==='object') for(const[k,v]of Object.entries(obj)){const z=typeof v==='object'&&v?(v as any).value||(v as any).name||(v as any).description:String(v??'');if(String(z).trim())out.push(`${k}: ${String(z).trim()}`);} return [...new Set(out)].slice(0,10); }
  address(a:Record<string,unknown>){const x:any=a;return[x.addressLine,x.city,x.subdivision,x.postalCode,x.country].filter(Boolean).join(', ');}
  n(v:string){return v===''?null:Number(v);}
  savePkg(pkg:ShipmentPackageRow,name:string,l:string,w:string,h:string,kg:string){void this.f.savePackage(pkg,{package_name:name.trim()||'Package '+pkg.package_no,length_mm:this.n(l),width_mm:this.n(w),height_mm:this.n(h),weight_kg:this.n(kg)});}
  async collect(row:FulfilmentRow){await this.f.markCollected(row);}
  async book(row:FulfilmentRow){await this.f.markShippingBooked(row);}
  onDrawerVisible(visible:boolean){if(!visible)this.selected.set(null);}
}
