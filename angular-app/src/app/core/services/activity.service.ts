import { Injectable, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { OrderActivityRow, OrderRow } from '../models/order.models';

@Injectable({ providedIn: 'root' })
export class ActivityService {
  readonly rows = signal<OrderActivityRow[]>([]);
  private loaded = false;
  private readonly fulfilledNote = 'Order status: FULFILLED';

  constructor(
    private readonly supabase: SupabaseService,
    private readonly auth: AuthService,
  ) {}

  async load(): Promise<void> {
    if (this.loaded) return;
    const [activityResult, fulfilmentResult] = await Promise.all([
      this.supabase.client
        .from('wc_order_activity')
        .select('*')
        .order('created_at', { ascending: false }),
      this.supabase.client
        .from('wc_fulfilment')
        .select('order_id,fulfilled_at')
        .eq('status', 'Fulfilled'),
    ]);
    if (activityResult.error) return;

    let rows = (activityResult.data ?? []) as OrderActivityRow[];
    const notedOrderIds = new Set(
      rows
        .filter(row => row.activity_type === 'note' && row.message === this.fulfilledNote)
        .map(row => row.order_id),
    );
    const missingNotes = (fulfilmentResult.data ?? [])
      .filter(row => !notedOrderIds.has(String(row.order_id)))
      .map(row => ({
        order_id: String(row.order_id),
        activity_type: 'note' as const,
        message: this.fulfilledNote,
        created_by: 'Fulfilment',
        created_at: row.fulfilled_at || new Date().toISOString(),
      }));

    if (missingNotes.length) {
      const { data: inserted } = await this.supabase.client
        .from('wc_order_activity')
        .insert(missingNotes)
        .select();
      if (inserted?.length) rows = [...inserted as OrderActivityRow[], ...rows];
    }

    this.rows.set(rows);
    this.loaded = true;
  }

  async addNote(orderId: string, message: string): Promise<void> {
    const payload = {
      order_id: orderId,
      activity_type: 'note',
      message,
      created_by: this.auth.userEmail() || 'User',
    };
    const { data, error } = await this.supabase.client
      .from('wc_order_activity')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    this.rows.update((rows) => [data as OrderActivityRow, ...rows]);
  }

  async addFulfilledNote(orderId: string, createdAt: string): Promise<void> {
    if (this.rows().some(row => row.order_id === orderId && row.message === this.fulfilledNote)) return;
    const payload = {
      order_id: orderId,
      activity_type: 'note',
      message: this.fulfilledNote,
      created_by: 'Fulfilment',
      created_at: createdAt,
    };
    const { data, error } = await this.supabase.client
      .from('wc_order_activity')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    this.rows.update(rows => [data as OrderActivityRow, ...rows]);
  }

  eventsFor(order: OrderRow): OrderActivityRow[] {
    const local = this.rows().filter((row) => row.order_id === order.id);
    const wix = this.wixEvents(order);
    return [...local, ...wix].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }

  private wixEvents(order: OrderRow): OrderActivityRow[] {
    let raw: unknown = order.activities;
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch { raw = []; }
    }
    let arr: unknown[] = [];
    if (Array.isArray(raw)) arr = raw;
    else if (raw && typeof raw === 'object') {
      const obj = raw as Record<string, unknown>;
      if (Array.isArray(obj['items'])) arr = obj['items'] as unknown[];
      else if (Array.isArray(obj['activities'])) arr = obj['activities'] as unknown[];
    }

    const out: OrderActivityRow[] = [];
    let hasPlaced = false;
    for (const candidate of arr) {
      if (!candidate || typeof candidate !== 'object') continue;
      const x = candidate as Record<string, unknown>;
      const created = this.firstString(x, ['created_at','createdAt','dateCreated','createdDate','timestamp','date','time']);
      const type = String(
        x['type'] ?? x['activityType'] ?? x['eventType'] ?? x['kind'] ??
        ((x['activity'] as Record<string, unknown> | undefined)?.['type'] ?? '')
      ).toUpperCase();
      let message = this.firstString(x, ['message','description','title','text','summary']);
      const number = this.receiptNumber(x);

      if (/ORDER_PLACED|PLACED_ORDER|ORDER_CREATED/.test(type)) {
        hasPlaced = true;
        message ||= `${order.customer_name || 'Customer'} placed an order`;
      } else if (/ORDER_PAID|PAYMENT_PAID|MARKED_PAID/.test(type)) {
        message ||= 'Order marked as Paid';
      } else if (/RECEIPT/.test(type) && /SENT|SEND/.test(type)) {
        message = number ? `Receipt #${number} sent to customer` : (message || 'Receipt sent to customer');
      } else if (/RECEIPT/.test(type) && /CREATED|CREATE/.test(type)) {
        message = number ? `Receipt #${number} created` : (message || 'Receipt created');
      } else if (/INVOICE/.test(type) && /SENT|SEND/.test(type)) {
        message = number ? `Invoice #${number} sent to customer` : (message || 'Invoice sent to customer');
      } else if (/INVOICE/.test(type) && /CREATED|CREATE/.test(type)) {
        message = number ? `Invoice #${number} created` : (message || 'Invoice created');
      }

      if (message && number && /^Receipt created$/i.test(message)) message = `Receipt #${number} created`;
      if (message && number && /^Receipt sent to customer$/i.test(message)) message = `Receipt #${number} sent to customer`;
      if (!created || !message) continue;
      out.push({ order_id: order.id, activity_type: 'wix', message, created_at: created, created_by: 'Wix' });
    }

    if (!hasPlaced && order.wix_created_at) {
      out.push({
        order_id: order.id,
        activity_type: 'wix',
        message: `${order.customer_name || 'Customer'} placed an order`,
        created_at: order.wix_created_at,
        created_by: 'Wix',
      });
    }

    const seen = new Set<string>();
    return out.filter((row) => {
      const key = `${row.created_at}|${row.message}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private firstString(obj: Record<string, unknown>, keys: string[]): string {
    for (const key of keys) {
      const value = obj[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (typeof value === 'number') return String(value);
    }
    return '';
  }

  private receiptNumber(root: Record<string, unknown>): string {
    let found = '';
    const walk = (value: unknown, path = ''): void => {
      if (found || !value || typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        const next = `${path}.${key}`.toLowerCase();
        if ((next.includes('receipt') || next.includes('invoice')) && key.toLowerCase().includes('number')) {
          if ((typeof child === 'string' || typeof child === 'number') && String(child).trim()) {
            found = String(child).trim();
            return;
          }
        }
        walk(child, next);
      }
    };
    walk(root);
    return found;
  }
}
