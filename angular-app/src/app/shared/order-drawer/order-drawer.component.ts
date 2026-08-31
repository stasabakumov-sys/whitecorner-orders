import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { OrderItemRow, OrderRow } from '../../core/models/order.models';
import { OrderActivityComponent } from '../order-activity/order-activity.component';

@Component({
  selector: 'app-order-drawer',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, OrderActivityComponent],
  template: `
    <div class="shade" (click)="closed.emit()">
      <aside (click)="$event.stopPropagation()">
        <header>
          <div>
            <b>#{{ order.order_number }}</b>
            <div>{{ order.customer_name }}</div>
            <small>{{ order.company }}</small>
          </div>
          <button (click)="closed.emit()">×</button>
        </header>

        <div class="body">
          <section>
            <div class="section-title">Overview</div>
            <div class="overview">
              <div><b>Payment</b><span class="badge paid">{{ order.payment_status || '—' }}</span></div>
              <div><b>Fulfilment</b><span class="badge fulfil">{{ order.delivery_type || 'Shipping' }}</span></div>
              <div><b>Total</b><span>{{ order.total || 0 | currency:(order.currency || 'AUD') }}</span></div>
              <div><b>Date</b><span>{{ order.wix_created_at | date:'dd MMM yyyy' }}</span></div>
              <div><b>Items</b><span>{{ physicalItemCount() }}</span></div>
              <div><b>Status</b><span>{{ productionStatus() }}</span></div>
            </div>
            @if (deliveryAddress()) { <div class="detail"><b>Delivery:</b> {{ deliveryAddress() }}</div> }
            @if (order.buyer_note) { <div class="detail"><b>Buyer note:</b> {{ order.buyer_note }}</div> }
          </section>

          @if (mainItems().length) {
            <section>
              <div class="section-title">Items</div>
              @for (item of mainItems(); track item.id) {
                <div class="item">
                  <div class="media">
                    @if (mediaUrl(item)) { <img [src]="mediaUrl(item)" alt="" /> } @else { <div class="placeholder"></div> }
                  </div>
                  <div class="item-main">
                    <b>{{ item.product_name }}</b>
                    <div>
                      <span class="pill">qty: {{ item.quantity || 1 }}</span>
                      @for (option of optionLabels(item); track option) { <span class="pill">{{ option }}</span> }
                    </div>
                  </div>
                  <div class="money">
                    <span>{{ item.unit_price || 0 | currency:(order.currency || 'AUD') }} each</span>
                    <small>qty {{ item.quantity || 1 }}</small>
                    <b>{{ itemTotal(item) | currency:(order.currency || 'AUD') }}</b>
                  </div>
                </div>
              }
            </section>
          }

          @if (addonItems().length) {
            <section>
              <div class="section-title">Add-ons</div>
              @for (item of addonItems(); track item.id) {
                <div class="item">
                  <div class="media">
                    @if (mediaUrl(item)) { <img [src]="mediaUrl(item)" alt="" /> } @else { <div class="placeholder"></div> }
                  </div>
                  <div class="item-main">
                    <b>{{ item.product_name }}</b><span class="pill addon">Add-on</span>
                    <div><span class="pill">qty: {{ item.quantity || 1 }}</span></div>
                  </div>
                  <div class="money">
                    <span>{{ item.unit_price || 0 | currency:(order.currency || 'AUD') }} each</span>
                    <small>qty {{ item.quantity || 1 }}</small>
                    <b>{{ itemTotal(item) | currency:(order.currency || 'AUD') }}</b>
                  </div>
                </div>
              }
            </section>
          }

          <section class="totals-wrap">
            <div class="totals">
              @if (order.subtotal != null) { <div><span>Subtotal</span><span>{{ order.subtotal | currency:(order.currency || 'AUD') }}</span></div> }
              @if (deliveryAmount() > 0) { <div><span>Delivery</span><span>{{ deliveryAmount() | currency:(order.currency || 'AUD') }}</span></div> }
              @if ((order.discount || 0) !== 0) { <div><span>Discount</span><span>− {{ abs(order.discount || 0) | currency:(order.currency || 'AUD') }}</span></div> }
              @if ((order.additional_fees || 0) !== 0) { <div><span>Additional fees</span><span>{{ order.additional_fees || 0 | currency:(order.currency || 'AUD') }}</span></div> }
              @if ((order.tax || 0) !== 0) { <div><span>Tax</span><span>{{ order.tax || 0 | currency:(order.currency || 'AUD') }}</span></div> }
              <div class="final"><span>Total</span><span>{{ order.total || 0 | currency:(order.currency || 'AUD') }}</span></div>
            </div>
          </section>

          <app-order-activity [order]="order" />
        </div>
      </aside>
    </div>
  `,
  styles: [`
    .shade{position:fixed;inset:0;background:#0f172a55;z-index:50}aside{position:absolute;right:0;top:0;bottom:0;width:min(1040px,96vw);background:#fff;overflow:auto;box-shadow:-6px 0 25px #0002}header{position:sticky;top:0;z-index:3;display:flex;justify-content:space-between;padding:18px 22px;border-bottom:1px solid #e4e7ec;background:#fff}header small{display:block;color:#758198;margin-top:3px}header button{border:0;background:#eef1f5;border-radius:50%;width:42px;height:42px;font-size:18px}.body{padding:20px 22px}.body section{margin-bottom:22px}.section-title{font-size:11px;text-transform:uppercase;color:#758198;font-weight:700;margin-bottom:8px}.overview{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.overview>div{border:1px solid #e4e7ec;border-radius:8px;padding:10px;background:#fbfcfd;display:flex;flex-direction:column;gap:5px}.badge{display:inline-block;width:max-content;padding:3px 8px;border-radius:10px;font-size:11px;font-weight:600}.paid{background:#d8f3e4;color:#17643d}.fulfil{background:#ece9ff;color:#514a9e}.detail{margin-top:10px;color:#758198;font-size:12px}.item{display:grid;grid-template-columns:76px 1fr auto;gap:12px;align-items:start;border:1px solid #e4e7ec;border-radius:9px;padding:10px;margin-bottom:9px}.media img,.placeholder{width:76px;height:76px;border-radius:7px;border:1px solid #e4e7ec;object-fit:cover;background:#f6f8fa}.pill{display:inline-block;background:#f1f4f7;border-radius:5px;padding:4px 6px;font-size:11px;margin:5px 5px 0 0}.addon{margin-left:6px}.money{text-align:right;display:flex;flex-direction:column;gap:3px}.money small{color:#758198}.totals-wrap{display:flex;justify-content:flex-end}.totals{width:min(420px,100%);border-top:1px solid #e4e7ec;padding-top:8px}.totals>div{display:flex;justify-content:space-between;padding:5px 0}.totals .final{font-weight:800;font-size:16px;border-top:1px solid #e4e7ec;margin-top:5px;padding-top:10px}@media(max-width:800px){.overview{grid-template-columns:1fr 1fr}.item{grid-template-columns:60px 1fr}.media img,.placeholder{width:60px;height:60px}.money{grid-column:2;text-align:left}}
  `],
})
export class OrderDrawerComponent {
  @Input({ required: true }) order!: OrderRow;
  @Output() closed = new EventEmitter<void>();

  private readonly addonTerms = [
    'additional tabletop','custom cutout','custom cutouts','side shelves','integrated ice storage shelf',
    'umbrella hole','support panel','customisation','customization','back panel with','benchtop upgrade',
  ];

  allItems(): OrderItemRow[] {
    return (this.order.wc_order_items ?? []).filter((i) => !/^delivery$/i.test(i.product_name ?? ''));
  }

  mainItems(): OrderItemRow[] { return this.allItems().filter((i) => !this.isAddon(i)); }
  addonItems(): OrderItemRow[] { return this.allItems().filter((i) => this.isAddon(i)); }

  isAddon(item: OrderItemRow): boolean {
    const name = String(item.product_name ?? '').toLowerCase();
    return this.addonTerms.some((term) => name.includes(term));
  }

  itemTotal(item: OrderItemRow): number {
    return Number(item.unit_price ?? 0) * Number(item.quantity ?? 1);
  }

  physicalItemCount(): number {
    return this.mainItems().reduce((sum, item) => sum + Math.max(1, Number(item.quantity ?? 1)), 0);
  }

  productionStatus(): string {
    const counts = new Map<string, number>();
    for (const item of this.mainItems()) {
      for (const unit of item.wc_production_units ?? []) {
        const status = unit.production_status || 'New';
        counts.set(status, (counts.get(status) ?? 0) + 1);
      }
    }
    return [...counts.entries()].map(([status, count]) => `${count} ${status}`).join(' · ') || '—';
  }

  deliveryAddress(): string {
    const a = this.order.delivery_address;
    if (!a || typeof a !== 'object') return '';
    const keys = ['addressLine','addressLine1','streetAddress','city','suburb','subdivision','state','postalCode','postcode'];
    const values: string[] = [];
    for (const key of keys) {
      const value = a[key];
      if (typeof value === 'string' && value.trim() && !values.includes(value.trim())) values.push(value.trim());
    }
    return values.join(', ');
  }

  deliveryAmount(): number {
    const direct = Number(this.order.shipping ?? 0);
    if (direct > 0) return direct;
    if ((this.order.delivery_type || 'Shipping') !== 'Shipping') return 0;
    const productSum = this.allItems().reduce((sum, item) => sum + this.itemTotal(item), 0);
    const residual = Number(this.order.total ?? 0) - productSum - Number(this.order.additional_fees ?? 0) + Math.abs(Number(this.order.discount ?? 0));
    return residual > 0.005 ? residual : 0;
  }

  mediaUrl(item: OrderItemRow): string {
    const image = item.image ?? {};
    const raw = item.raw_item ?? {};
    const candidates = [
      image['url'], image['imageUrl'],
      (image['imageInfo'] as Record<string, unknown> | undefined)?.['url'],
      (raw['media'] as Record<string, unknown> | undefined)?.['url'],
      (raw['image'] as Record<string, unknown> | undefined)?.['url'],
      ((raw['image'] as Record<string, unknown> | undefined)?.['imageInfo'] as Record<string, unknown> | undefined)?.['url'],
    ];
    return String(candidates.find((v) => typeof v === 'string' && v) ?? '');
  }

  optionLabels(item: OrderItemRow): string[] {
    const out: string[] = [];
    for (const source of [item.wix_options, item.custom_text_fields]) {
      if (!source || typeof source !== 'object') continue;
      for (const [key, raw] of Object.entries(source)) {
        let value: unknown = raw;
        if (raw && typeof raw === 'object') {
          const obj = raw as Record<string, unknown>;
          value = obj['value'] ?? obj['name'] ?? obj['description'] ?? '';
        }
        if (value !== '' && value != null) out.push(`${key}: ${String(value)}`);
      }
    }
    return [...new Set(out)].slice(0, 12);
  }

  abs(value: number): number { return Math.abs(value); }
}
