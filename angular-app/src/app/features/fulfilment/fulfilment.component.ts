import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { DrawerModule } from 'primeng/drawer';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { OrderItemRow, OrderRow } from '../../core/models/order.models';
import { FulfilmentRow, FulfilmentService, ShipmentPackageRow } from '../../core/services/fulfilment.service';
import { FastCourierInsuranceSelection, FastCourierQuote, FastCourierQuoteRequest } from '../../core/services/fast-courier.service';

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
            <tr class="order-row" (click)="open(row)">
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
                  <div class="package-head"><div><b>{{ f.packagesFor(shipment.id).length }} package(s)</b><div class="muted">Only an exact saved product profile can attach packages automatically.</div></div><p-tag [value]="shipment.status" [severity]="shipmentSeverity(shipment.status)" /></div>
                  @if (!f.hasSavedProfile(o)) {
                    <div class="callout profile-missing">
                      <b>No saved packaging profile for:</b> {{ f.profileTargetName(o) }}
                      <div>Add the actual packages below. When they are complete, save them for this product so the next identical Wix product can reuse them.</div>
                      @if (f.shipmentComplete(shipment.id)) {
                        <p-button label="Save packages for this product" size="small" outlined [loading]="f.savingProfileShipmentId() === shipment.id" (onClick)="f.savePackagesAsProductProfile(shipment)" />
                      }
                    </div>
                  } @else {
                    <div class="callout profile-saved"><b>Saved product profile:</b> {{ f.profileTargetName(o) }}</div>
                  }
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
                  } @empty { <div class="callout warning">No exact packaging profile exists. Add the actual package(s) below — nothing has been guessed or copied from another product.</div> }
                  @if (row.status === 'Shipping Preparation') {
                    <div class="actions">
                      <p-button label="Add package" severity="secondary" outlined (onClick)="f.addPackage(shipment)" />
                      @if (shipment.status === 'Packaging Review') { <p-button label="Approve packages" [disabled]="!f.shipmentComplete(shipment.id)" (onClick)="f.approvePackages(shipment)" /> }
                    </div>
                    @if (!f.shipmentComplete(shipment.id)) { <div class="muted hint">Complete L × W × H and weight for every package before approval.</div> }
                    @else if (shipment.status !== 'Packaging Review') { <div class="done">Packing list approved ✓</div><div class="muted hint">Changing any package will require approval and fresh quotes again.</div> }
                  } @else if (row.status === 'Shipping Booked') { <div class="done">Shipping booked ✓</div><div class="muted hint">Future: In Transit → Delivered → Fulfilled from courier tracking.</div> }
                } @else { <div class="callout warning">Shipment record is being prepared.</div> }
              </section>

              @if (f.shipmentFor(row); as shipment) {
                <section class="section quote-section">
                  <div class="section-title">Fast Courier quote</div>
                  <div class="callout safety"><b>Quote only.</b> This does not book a courier or charge the account.</div>
                  <div class="callout insurance" [class.warning]="insuranceNeedsReview(o)">
                    <b>Goods value: {{ money(goodsValue(o)) }}</b> <span>(delivery excluded)</span>
                    @if (insuranceStatus() === 'checking') { <div>Checking Fast Courier insurance options…</div> }
                    @else if (insuranceSelection(o); as insurance) {
                      @if (insurance.required) { <div>Insurance required · cover up to {{ money(insurance.insuranceValue) }} · +{{ money(insurance.insuranceFee) }}</div> }
                      @else { <div>Free cover up to {{ money(insurance.insuranceValue) }}</div> }
                    } @else { <div>Available cover does not fully protect this order. Manual review required before booking.</div> }
                  </div>
                  <div class="route-grid">
                    <fieldset>
                      <legend>Pickup</legend>
                      <label>Suburb<input pInputText #pickupSuburb [value]="pickupAddress().suburb" /></label>
                      <label>State<input pInputText #pickupState [value]="pickupAddress().state" /></label>
                      <label>Postcode<input pInputText #pickupPostcode inputmode="numeric" [value]="pickupAddress().postcode" /></label>
                      <label>Building<select #pickupType><option value="commercial">Commercial</option><option value="residential">Residential</option></select></label>
                      <label class="check"><input #pickupTailLift type="checkbox" /> Tail lift required</label>
                    </fieldset>
                    <fieldset>
                      <legend>Destination</legend>
                      <label>Suburb<input pInputText #destinationSuburb [value]="destination().suburb" /></label>
                      <label>State<input pInputText #destinationState [value]="destination().state" /></label>
                      <label>Postcode<input pInputText #destinationPostcode inputmode="numeric" [value]="destination().postcode" /></label>
                      <label>Building<select #destinationType [value]="destinationBuildingType()"><option value="residential">Residential</option><option value="commercial">Commercial</option></select></label>
                      <label class="check"><input #destinationTailLift type="checkbox" /> Tail lift required</label>
                      <div class="address-detection">
                        @if (addressTypeStatus() === 'checking') { Checking address type with Google… }
                        @else if (addressTypeStatus() === 'commercial') { Google: commercial address ✓ }
                        @else if (addressTypeStatus() === 'residential') { Google: residential address ✓ }
                        @else { Google could not determine the building type — check manually. }
                      </div>
                    </fieldset>
                  </div>
                  <div class="actions quote-action">
                    <p-button
                      [label]="f.quotingShipmentId() === shipment.id ? 'Comparing prices…' : 'Get courier quotes'"
                      icon="pi pi-search"
                      [loading]="f.quotingShipmentId() === shipment.id"
                      [disabled]="!canQuote(shipment.status) || !f.shipmentComplete(shipment.id)"
                      (onClick)="getQuotes(row,pickupSuburb.value,pickupState.value,pickupPostcode.value,pickupType.value,pickupTailLift.checked,destinationSuburb.value,destinationState.value,destinationPostcode.value,destinationType.value,destinationTailLift.checked)" />
                    @if (f.quotingShipmentId() === shipment.id) { <span class="muted">Fast Courier is comparing providers. This can take up to 90 seconds.</span> }
                    @if (shipment.quoted_at) { <span class="muted">Saved {{ shipment.quoted_at | date:'dd MMM, h:mm a' }}</span> }
                  </div>

                  @if (f.quotesFor(shipment).length) {
                    <div class="quote-list">
                      @for (quote of f.quotesFor(shipment); track quote.id) {
                        <button type="button" class="quote-card" [class.selected]="shipment.selected_quote_id === quote.id" [disabled]="insuranceNeedsReview(o)" (click)="selectQuote(shipment,quote,o)">
                          <div class="quote-logo">@if (quote.logo) { <img [src]="quote.logo" alt="" /> } @else { <span>{{ initials(quote.courierName) }}</span> }</div>
                          <div class="quote-main"><b>{{ quote.courierName || 'Courier' }} · {{ quote.name || 'Service' }}</b><span>{{ quote.eta || 'ETA unavailable' }}@if (quote.pickupCutOffTime) { · Cut-off {{ quote.pickupCutOffTime }} }</span></div>
                          <div class="quote-price"><b>{{ money(quoteTotal(quote,o)) }}</b><span>{{ insuranceFee(o) > 0 ? 'delivery + insurance' : 'incl. GST' }}</span>@if (insuranceFee(o) > 0) { <span>{{ money(quote.priceIncludingGst) }} + {{ money(insuranceFee(o)) }}</span> }</div>
                          <div class="quote-choice">{{ shipment.selected_quote_id === quote.id ? 'Selected ✓' : 'Select' }}</div>
                          @if (noticeText(quote)) { <div class="quote-notice">{{ noticeText(quote) }}</div> }
                        </button>
                      }
                    </div>
                    @if (shipment.selected_quote_id) { <div class="callout selected-note">Quote selected and saved for the next stage. <b>No booking has been made.</b></div> }
                  }
                </section>
              }
            }
          </div>
        }
      }
    </p-drawer>
  `,
  styles: [`
    .page-card{background:#fff;border:1px solid #e4e7ec;border-radius:12px;overflow:hidden}.page-head{padding:18px 20px 14px;border-bottom:1px solid #e4e7ec}.page-head h2{margin:0 0 4px}.page-head p{margin:0;color:#758198;font-size:12px}.route-buttons{display:flex;gap:8px;margin-top:14px}.error{margin:12px 18px;background:#fff1f1;color:#8c2f2f;padding:10px;border-radius:8px}.order-row{cursor:pointer}.order-row td small{display:block;color:#758198;margin-top:3px}.empty{text-align:center;color:#758198;padding:28px}.drawer-title{display:flex;align-items:center;justify-content:space-between;gap:18px;width:100%;padding-right:8px}.drawer-title small{display:block;color:#758198;margin-top:2px}.order-number{font-size:17px}.drawer-body{padding:4px 2px 18px}.section{margin-bottom:24px}.section-title{text-transform:uppercase;font-size:11px;font-weight:800;color:#758198;margin-bottom:9px}.overview{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.info-box{border:1px solid #e4e7ec;border-radius:8px;padding:10px;background:#fbfcfd}.info-box b,.info-box span{display:block}.info-box span{margin-top:4px}.address{margin-top:10px;color:#596579;font-size:12px}.item-card{display:grid;grid-template-columns:70px 1fr auto;gap:12px;align-items:start;border:1px solid #e4e7ec;border-radius:9px;padding:10px;margin-bottom:8px}.item-card img,.image-placeholder{width:70px;height:70px;border:1px solid #e4e7ec;border-radius:7px;object-fit:cover;background:#f6f8fa}.chips{margin-top:5px}.chips span{display:inline-block;background:#f1f4f7;border-radius:5px;padding:4px 6px;font-size:11px;margin:3px 4px 0 0}.price{text-align:right}.callout{padding:11px 12px;background:#f7f9fc;border-radius:8px;font-size:12px;margin-bottom:12px}.warning{background:#fff8ed;color:#8a4b08}.profile-missing{background:#eef8ff;color:#174f78}.profile-missing div{margin:5px 0 9px}.profile-saved{background:#edf9f2;color:#17643d}.done{margin-top:12px;color:#17643d;font-weight:700}.package-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px}.muted{color:#758198;font-size:12px}.package-card{border:1px solid #e4e7ec;border-radius:9px;padding:10px;margin-bottom:8px;display:grid;grid-template-columns:30px 1fr auto;gap:10px;align-items:end}.package-no{width:26px;height:26px;border-radius:50%;background:#f1f4f7;display:grid;place-items:center;font-size:11px;font-weight:700;align-self:center}.package-fields{display:grid;grid-template-columns:minmax(150px,1.6fr) repeat(4,minmax(75px,.7fr));gap:7px}.package-fields label{font-size:10px;color:#758198;text-transform:uppercase;font-weight:700}.package-fields input{display:block;width:100%;margin-top:4px}.package-actions{display:flex;gap:4px}.actions{display:flex;gap:8px;margin-top:10px}.hint{margin-top:6px}.safety{background:#eef8ff;color:#174f78}.insurance{background:#f7f9fc;color:#344054}.insurance b{margin-right:5px}.insurance div{margin-top:5px;font-weight:600}.route-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.route-grid fieldset{border:1px solid #e4e7ec;border-radius:9px;padding:12px;display:grid;grid-template-columns:2fr .8fr 1fr;gap:9px}.route-grid legend{font-weight:700;padding:0 5px}.route-grid label{font-size:10px;text-transform:uppercase;font-weight:700;color:#758198}.route-grid input,.route-grid select{display:block;width:100%;margin-top:4px;height:37px;border:1px solid #d4d9e2;border-radius:7px;padding:7px;background:#fff;color:#101828}.route-grid .check{grid-column:1/-1;display:flex;gap:7px;align-items:center;text-transform:none;font-size:12px}.route-grid .check input{width:auto;height:auto;margin:0}.address-detection{grid-column:1/-1;color:#667085;font-size:11px}.quote-action{align-items:center;margin:12px 0}.quote-list{display:grid;gap:8px}.quote-card{width:100%;display:grid;grid-template-columns:60px 1fr auto 75px;gap:12px;align-items:center;text-align:left;border:1px solid #dce2ea;border-radius:10px;background:#fff;padding:11px;cursor:pointer;color:#101828}.quote-card:disabled{cursor:not-allowed;opacity:.62}.quote-card:hover:not(:disabled){border-color:#91b9ff}.quote-card.selected{border:2px solid #116dff;background:#f6f9ff}.quote-logo{width:56px;height:40px;display:grid;place-items:center;border-radius:7px;background:#f7f8fa;overflow:hidden;font-weight:800}.quote-logo img{max-width:52px;max-height:34px;object-fit:contain}.quote-main b,.quote-main span,.quote-price b,.quote-price span{display:block}.quote-main span,.quote-price span{font-size:11px;color:#758198;margin-top:3px}.quote-price{text-align:right}.quote-choice{font-size:12px;color:#116dff;text-align:right}.quote-notice{grid-column:2/-1;color:#7a4a05;background:#fff8e8;border-radius:6px;padding:7px;font-size:11px}.selected-note{margin-top:10px;background:#edf9f2;color:#17643d}@media(max-width:900px){.overview{grid-template-columns:1fr 1fr}.package-card{grid-template-columns:30px 1fr}.package-actions{grid-column:2}.package-fields{grid-template-columns:1fr 1fr}.route-grid{grid-template-columns:1fr}}@media(max-width:600px){.overview{grid-template-columns:1fr}.item-card{grid-template-columns:58px 1fr}.item-card img,.image-placeholder{width:58px;height:58px}.price{grid-column:2;text-align:left}.package-fields{grid-template-columns:1fr}.route-buttons{flex-wrap:wrap}.route-grid fieldset{grid-template-columns:1fr 1fr}.quote-card{grid-template-columns:48px 1fr auto}.quote-logo{width:46px}.quote-choice{grid-column:2/-1}.quote-notice{grid-column:1/-1}}
  `],
})
export class FulfilmentComponent implements OnInit {
  readonly String = String;
  tab = signal<'Pickup' | 'Delivery'>('Delivery');
  selected = signal<FulfilmentRow | null>(null);
  pickupAddress = signal({suburb:'BURLEIGH HEADS',state:'QLD',postcode:'4220'});
  destination = signal({suburb:'',state:'',postcode:''});
  destinationBuildingType = signal<'commercial'|'residential'>('residential');
  addressTypeStatus = signal<'checking'|'commercial'|'residential'|'unknown'>('unknown');
  insuranceStatus = signal<'checking'|'ready'|'error'>('checking');
  insuranceOptions = signal<{label:string;insuranceValue:number;insuranceFee:number}[]>([]);
  private addressTypeRequest = 0;
  pickup = computed(() => this.f.rows().filter((r) => r.route === 'Pickup'));
  delivery = computed(() => this.f.rows().filter((r) => r.route === 'Shipping'));
  visible = computed(() => this.tab() === 'Pickup' ? this.pickup() : this.delivery());
  constructor(readonly f: FulfilmentService) {}
  ngOnInit() { void this.f.load(); }
  displayStatus(row: FulfilmentRow) { if (row.route === 'Pickup') return row.status === 'Fulfilled' ? 'Fulfilled' : 'Awaiting Pickup'; const shipment = this.f.shipmentFor(row); return row.status === 'Fulfilled' ? 'Fulfilled' : (shipment?.status || row.status); }
  statusSeverity(row: FulfilmentRow): 'success'|'info'|'warn'|'secondary' { const s=this.displayStatus(row); if(s==='Fulfilled'||s==='Delivered')return'success'; if(s==='Ready to Quote'||s==='Quoted'||s==='Quote Selected')return'info'; if(s==='Packaging Review'||s==='Awaiting Pickup')return'warn'; return'secondary'; }
  shipmentSeverity(status:string): 'success'|'info'|'warn'|'secondary' { if(status==='Delivered')return'success'; if(status==='Ready to Quote'||status==='Quoted'||status==='Quote Selected')return'info'; if(status==='Packaging Review')return'warn'; return'secondary'; }
  canQuote(status:string){return status==='Ready to Quote'||status==='Quoted'||status==='Quote Selected';}
  orderItems(items: OrderItemRow[]) { return items.filter((i) => !/^(delivery|shipping)(\s+(fee|charge))?$/i.test(String(i.product_name || '').trim())); }
  image(item: OrderItemRow) { const x:any=item.image||{},r:any=item.raw_item||{}; return x.url||x.imageUrl||x.imageInfo?.url||r.media?.url||r.image?.url||r.image?.imageInfo?.url||''; }
  options(item: OrderItemRow) { const out:string[]=[]; for(const obj of [item.wix_options,item.custom_text_fields]) if(obj&&typeof obj==='object') for(const[k,v]of Object.entries(obj)){const z=typeof v==='object'&&v?(v as any).value||(v as any).name||(v as any).description:String(v??'');if(String(z).trim())out.push(`${k}: ${String(z).trim()}`);} return [...new Set(out)].slice(0,10); }
  address(a:Record<string,unknown>){const x:any=a;return[x.addressLine,x.city,x.subdivision,x.postalCode,x.country].filter(Boolean).join(', ');}
  open(row:FulfilmentRow){
    this.selected.set(row);
    const order=this.f.orderFor(row),a:any=order?.delivery_address||{};
    // A company name does not prove that the delivery premises are commercial:
    // customers often enter a home address. Default safely until Wix supplies an
    // explicit checkout answer; the operator can still override it before quoting.
    this.destinationBuildingType.set('residential');
    this.destination.set({
      suburb:String(a.city||a.suburb||a.locality||'').toUpperCase(),
      state:this.stateCode(String(a.subdivision||a.state||a.region||'')),
      postcode:String(a.postalCode||a.postcode||a.zipCode||''),
    });
    void this.detectDestinationBuildingType(order?.id||'',a);
    void this.loadInsuranceOptions();
  }
  async detectDestinationBuildingType(orderId:string,address:Record<string,unknown>){
    const request=++this.addressTypeRequest;
    this.addressTypeStatus.set('checking');
    try{
      const result=await this.f.detectAddressType(address);
      const current=this.selected();
      if(request!==this.addressTypeRequest||!current||this.f.orderFor(current)?.id!==orderId)return;
      if(result.type==='commercial'){this.destinationBuildingType.set('commercial');this.addressTypeStatus.set('commercial');}
      else if(result.type==='residential'){this.destinationBuildingType.set('residential');this.addressTypeStatus.set('residential');}
      else{this.destinationBuildingType.set('residential');this.addressTypeStatus.set('unknown');}
    }catch{
      if(request===this.addressTypeRequest){this.destinationBuildingType.set('residential');this.addressTypeStatus.set('unknown');}
    }
  }
  stateCode(value:string){const raw=value.trim().toUpperCase().replace(/^AU[-\s]/,'');const map:Record<string,string>={QUEENSLAND:'QLD','NEW SOUTH WALES':'NSW',VICTORIA:'VIC',TASMANIA:'TAS','SOUTH AUSTRALIA':'SA','WESTERN AUSTRALIA':'WA','NORTHERN TERRITORY':'NT','AUSTRALIAN CAPITAL TERRITORY':'ACT'};return map[raw]||raw;}
  async loadInsuranceOptions(){
    if(this.insuranceOptions().length){this.insuranceStatus.set('ready');return;}
    this.insuranceStatus.set('checking');
    try{
      const labels=await this.f.getInsuranceOptions();
      const options=labels.map(label=>this.parseInsuranceOption(label)).filter((x):x is {label:string;insuranceValue:number;insuranceFee:number}=>!!x).sort((a,b)=>a.insuranceValue-b.insuranceValue);
      this.insuranceOptions.set(options);this.insuranceStatus.set(options.length?'ready':'error');
    }catch{this.insuranceStatus.set('error');}
  }
  parseInsuranceOption(label:string){const cover=label.match(/(?:up\s*to|upto)\s*\$\s*(\d+(?:\.\d+)?)/i),fee=label.match(/^\s*\+\s*\$?\s*(\d+(?:\.\d+)?)/);if(!cover)return null;return{label,insuranceValue:Number(cover[1]),insuranceFee:/free/i.test(label)?0:Number(fee?.[1]||0)};}
  goodsValue(order:OrderRow){const items=this.orderItems(order.wc_order_items||[]);const total=items.reduce((sum,item)=>sum+Number(item.unit_price||0)*Math.max(1,Number(item.quantity||1)),0);return Math.round((total>0?total:Number(order.subtotal||0))*100)/100;}
  insuranceSelection(order:OrderRow):FastCourierInsuranceSelection|null{const goodsValue=this.goodsValue(order),option=this.insuranceOptions().find(x=>x.insuranceValue>=goodsValue);if(!option)return null;return{required:goodsValue>450,goodsValue,extendedLiability:goodsValue>450,insuranceValue:option.insuranceValue,insuranceFee:goodsValue>450?option.insuranceFee:0,label:option.label};}
  insuranceNeedsReview(order:OrderRow){return this.insuranceStatus()==='error'||(this.insuranceStatus()==='ready'&&!this.insuranceSelection(order));}
  insuranceFee(order:OrderRow){return this.insuranceSelection(order)?.insuranceFee||0;}
  quoteTotal(quote:FastCourierQuote,order:OrderRow){return Number(quote.priceIncludingGst||0)+this.insuranceFee(order);}
  selectQuote(shipment:any,quote:FastCourierQuote,order:OrderRow){const insurance=this.insuranceSelection(order);if(!insurance){this.f.error.set('Insurance cover is insufficient for this goods value. Manual review is required before selecting a quote.');return;}void this.f.selectFastCourierQuote(shipment,{...quote,insurance});}
  getQuotes(row:FulfilmentRow,ps:string,pstate:string,pp:string,ptype:string,ptail:boolean,ds:string,dstate:string,dp:string,dtype:string,dtail:boolean){
    const shipment=this.f.shipmentFor(row);if(!shipment)return;
    const request:FastCourierQuoteRequest={
      pickupSuburb:ps.trim().toUpperCase(),pickupState:this.stateCode(pstate),pickupPostcode:Number(pp),pickupBuildingType:ptype as 'commercial'|'residential',isPickupTailLift:ptail,
      destinationSuburb:ds.trim().toUpperCase(),destinationState:this.stateCode(dstate),destinationPostcode:Number(dp),destinationBuildingType:dtype as 'commercial'|'residential',isDropOffTailLift:dtail,isDropOffPOBox:false,
      items:this.f.packagesFor(shipment.id).map(p=>({type:'box',weight:Number(p.weight_kg),length:Number(p.length_mm)/10,width:Number(p.width_mm)/10,height:Number(p.height_mm)/10,quantity:1,contents:'Other'})),
    };
    void this.f.requestFastCourierQuotes(row,request);
  }
  money(value:number|undefined){return value==null?'—':new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(value);}
  initials(value:string|undefined){return String(value||'FC').split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase();}
  noticeText(quote:FastCourierQuote){return String(quote.notice?.body||'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();}
  n(v:string){return v===''?null:Number(v);}
  savePkg(pkg:ShipmentPackageRow,name:string,l:string,w:string,h:string,kg:string){void this.f.savePackage(pkg,{package_name:name.trim()||'Package '+pkg.package_no,length_mm:this.n(l),width_mm:this.n(w),height_mm:this.n(h),weight_kg:this.n(kg)});}
  async collect(row:FulfilmentRow){await this.f.markCollected(row);}
  onDrawerVisible(visible:boolean){if(!visible)this.selected.set(null);}
}
