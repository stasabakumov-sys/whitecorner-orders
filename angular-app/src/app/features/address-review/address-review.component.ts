import { Component, OnInit, signal } from '@angular/core';
import { OrderRow } from '../../core/models/order.models';
import { OrdersService } from '../../core/services/orders.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { OrderDrawerComponent } from '../../shared/order-drawer/order-drawer.component';

type AddressIssue = {
  id: string;
  order_id: string;
  order_number?: string | number | null;
  customer_name?: string | null;
  address_text?: string | null;
  issue_summary?: string | null;
  suggested_address?: string | null;
  suggested_suburb?: string | null;
  suggested_state?: string | null;
  suggested_postcode?: string | null;
  validation_status?: string | null;
  checked_at?: string | null;
  updated_at?: string | null;
};

@Component({
  selector: 'app-address-review',
  standalone: true,
  imports: [OrderDrawerComponent],
  template: `
    <section class="panel">
      <header class="issuehead">
        <b>Address Review</b>
        <span>{{ openIssues().length }} issue{{ openIssues().length === 1 ? '' : 's' }}</span>
        <span class="mut">Only Shipping orders are checked</span>
      </header>

      @if (loading()) {
        <div class="empty">Loading address issues…</div>
      } @else if (error()) {
        <div class="error">{{ error() }}</div>
      } @else if (!openIssues().length) {
        <div class="empty">No address issues found.</div>
      } @else {
        <div class="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Address from Wix</th>
                <th>Problem</th>
                <th>Suggested address</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              @for (issue of openIssues(); track issue.id) {
                <tr>
                  <td><button class="btn" (click)="openOrder(issue.order_id)">#{{ issue.order_number }}</button></td>
                  <td>{{ issue.customer_name || '—' }}</td>
                  <td>{{ issue.address_text || '—' }}</td>
                  <td><span class="problem">{{ issue.issue_summary || 'Address issue' }}</span></td>
                  <td>
                    @if (issue.suggested_address) {
                      <div>{{ issue.suggested_address }}</div>
                      <div class="suggested">{{ suggestionMeta(issue) }}</div>
                    } @else { — }
                  </td>
                  <td>{{ issue.validation_status || '—' }}</td>
                  <td class="actions">
                    <button class="btn" (click)="setIssue(issue, 'Reviewed')">Reviewed</button>
                    <button class="btn" (click)="setIssue(issue, 'Ignored')">Ignore</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>

    @if (selected(); as order) {
      <app-order-drawer [order]="order" (closed)="selected.set(null)" />
    }
  `,
  styles: [`
    .panel{background:#fff;border:1px solid #e4e7ec;border-radius:12px;overflow:hidden}
    .issuehead{padding:14px 16px;border-bottom:1px solid #e4e7ec;display:flex;gap:12px;align-items:center}
    .issuehead .mut{margin-left:auto}
    .mut,.empty{font-size:12px;color:#758198}
    .empty{padding:28px}
    .error{margin:14px;background:#fff1f1;color:#8c2f2f;border:1px solid #f0caca;padding:12px;border-radius:8px}
    .tablewrap{overflow:auto}
    table{width:100%;border-collapse:collapse;min-width:1080px}
    th{background:#fafbfc;text-align:left;font-size:11px;text-transform:uppercase;color:#758198;padding:12px 14px;border-bottom:1px solid #e4e7ec}
    td{padding:13px 14px;border-bottom:1px solid #edf0f3;vertical-align:top}
    tbody tr:last-child td{border-bottom:0}
    .btn{border:1px solid #d4d9e2;background:#fff;color:#116dff;border-radius:8px;padding:8px 11px;cursor:pointer;white-space:nowrap}
    .btn:hover{background:#f8fbff}
    .problem{font-weight:700;color:#b42318}
    .suggested{color:#17643d;font-size:12px;margin-top:4px}
    .actions{white-space:nowrap}
    .actions .btn+.btn{margin-left:5px}
  `]
})
export class AddressReviewComponent implements OnInit {
  readonly issues = signal<AddressIssue[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly selected = signal<OrderRow | null>(null);

  constructor(
    private readonly supabase: SupabaseService,
    readonly orders: OrdersService,
  ) {}

  ngOnInit() {
    void this.load();
    if (!this.orders.orders().length) void this.orders.load();
  }

  openIssues() {
    return this.issues().filter(issue => issue.validation_status !== 'Ignored');
  }

  suggestionMeta(issue: AddressIssue) {
    return [issue.suggested_suburb, issue.suggested_state, issue.suggested_postcode].filter(Boolean).join(' · ');
  }

  async load() {
    this.loading.set(true);
    this.error.set('');
    const { data, error } = await this.supabase.client
      .from('wc_address_issues')
      .select('*')
      .order('checked_at', { ascending: false });
    this.loading.set(false);
    if (error) {
      this.error.set(error.message);
      return;
    }
    this.issues.set((data ?? []) as AddressIssue[]);
  }

  openOrder(orderId: string) {
    const order = this.orders.orders().find(x => x.id === orderId) ?? null;
    if (order) {
      this.selected.set(order);
      return;
    }
    this.error.set('Order could not be opened. Please refresh Orders and try again.');
  }

  async setIssue(issue: AddressIssue, status: 'Reviewed' | 'Ignored') {
    this.error.set('');
    const previous = issue.validation_status;
    issue.validation_status = status;
    this.issues.set([...this.issues()]);

    const { error } = await this.supabase.client
      .from('wc_address_issues')
      .update({ validation_status: status, updated_at: new Date().toISOString() })
      .eq('id', issue.id);

    if (error) {
      issue.validation_status = previous;
      this.issues.set([...this.issues()]);
      this.error.set(error.message);
    }
  }
}
