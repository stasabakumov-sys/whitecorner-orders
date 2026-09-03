import { Injectable, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { OrderRow } from '../models/order.models';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class OrdersService {
  readonly orders = signal<OrderRow[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly lastSync = signal<string | null>(null);

  private excluded = new Set(['10242']);

  constructor(private supabase: SupabaseService) {}

  async load() {
    this.loading.set(true);
    this.error.set('');

    const [ordersResult, fulfilledResult] = await Promise.all([
      this.supabase.client
        .from('wc_orders')
        .select('*,wc_order_items(*,wc_production_units(*))')
        .eq('is_hidden', false)
        .order('wix_created_at', { ascending: false }),
      this.supabase.client
        .from('wc_fulfilment')
        .select('order_id')
        .eq('status', 'Fulfilled'),
    ]);

    this.loading.set(false);

    if (ordersResult.error) {
      this.error.set(ordersResult.error.message);
      return;
    }

    const fulfilledOrderIds = new Set(
      (fulfilledResult.data ?? []).map(row => String(row.order_id)),
    );
    const sourceRows = (ordersResult.data ?? []) as OrderRow[];
    const rows = sourceRows
      .filter(order => !this.excluded.has(String(order.order_number)))
      .map(order =>
        fulfilledOrderIds.has(String(order.id))
          ? { ...order, fulfillment_status: 'FULFILLED' }
          : order,
      );

    this.orders.set(rows);

    const staleOrderIds = sourceRows
      .filter(
        order =>
          fulfilledOrderIds.has(String(order.id)) &&
          String(order.fulfillment_status ?? '').toUpperCase() !== 'FULFILLED',
      )
      .map(order => order.id);

    if (staleOrderIds.length) {
      const { error: reconcileError } = await this.supabase.client
        .from('wc_orders')
        .update({ fulfillment_status: 'FULFILLED' })
        .in('id', staleOrderIds);

      if (reconcileError) {
        console.error('Could not persist fulfilled order reconciliation', reconcileError);
      }
    }

    const syncs = rows
      .map(order => order.wix_synced_at)
      .filter(Boolean)
      .sort() as string[];
    this.lastSync.set(syncs.at(-1) ?? null);
  }

  async syncWix() {
    this.error.set('');
    const { data, error } = await this.supabase.client.functions.invoke(environment.wixSyncFunction);
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    await this.load();
  }
}
