import { describe, expect, it, vi } from 'vitest';
import { FulfilmentRow, FulfilmentService, ShipmentRow } from './fulfilment.service';
import { OrdersService } from './orders.service';

function setup() {
  const row: FulfilmentRow = { id: 'fulfilment', order_id: 'order', route: 'Shipping', status: 'Shipping Preparation', ready_at: '', pickup_email_status: 'Not required' };
  const shipment: ShipmentRow = { id: 'shipment', fulfilment_id: row.id, order_id: row.order_id, status: 'Quote Selected', courier_order_id: 'courier-order', selected_quote: { id: 'quote' } as any };
  const saved = { row: { ...row }, order: { id: 'order', order_number: 'TEST-1', fulfillment_status: 'NOT_FULFILLED' }, sync: [] as any[], shipment: { ...shipment } };
  const query = (table: string) => {
    let update: any;
    const q: any = {
      select: () => q, eq: () => q, order: () => q, in: () => q,
      update: (value: any) => { update = value; return q; },
      single: async () => ({ data: saved.row }),
      maybeSingle: async () => {
        if (table === 'wc_fulfilment' && update) Object.assign(saved.row, update);
        if (table === 'wc_orders' && update) Object.assign(saved.order, update);
        return { data: { id: 'saved' } };
      },
      then: (resolve: any) => {
        if(update&&table==='wc_fulfilment')Object.assign(saved.row,update);
        if(update&&table==='wc_orders')Object.assign(saved.order,update);
        return resolve({ data: table === 'wc_fulfilment' ? [saved.row] : table === 'wc_orders' ? [saved.order] : table === 'wc_shipments' ? [saved.shipment] : table === 'wc_shipping_fulfillment_sync' ? saved.sync : [] });
      },
    }; return q;
  };
  const supabase = { client: { from: vi.fn(query), rpc: vi.fn(async () => {
    saved.row.status = 'Shipping Booked'; saved.row.shipping_booked_at = new Date().toISOString();
    saved.shipment.status = 'Shipping Booked';
    saved.sync = [{ order_id: 'order', status: 'pending', error: null }];
    return { error: null };
  }), functions: { invoke: vi.fn(async () => {
    saved.row.status = 'Fulfilled'; saved.order.fulfillment_status = 'FULFILLED';
    saved.sync[0].status = 'synced'; return { data: { ok: true } };
  }) } } };
  const orders = new OrdersService(supabase as any);
  orders.orders.set([saved.order, { id: 'unrelated', order_number: 'TEST-2', fulfillment_status: 'NOT_FULFILLED' }]);
  const activity = { load: vi.fn(async () => {}), addFulfilledNote: vi.fn(async () => {}) };
  const courier = { saveOrderDetails: vi.fn(async () => {}), bookOrder: vi.fn(async () => {}) };
  const service = new FulfilmentService(supabase as any, orders, activity as any, { unitsForOrder: () => [] } as any, courier as any);
  service.rows.set([row]); service.shipments.set([shipment]);
  vi.spyOn(service, 'refreshBookingStatus').mockResolvedValue(undefined);
  return { row, saved, supabase, orders, activity, courier, service };
}

describe('FulfilmentService shipping completion', () => {
  it('automatically calls Wix after the booking is saved and updates Hub', async () => {
    const s = setup(); await expect(s.service.bookShipment(s.row, {} as any)).resolves.toBe(true);
    expect(s.supabase.client.rpc).toHaveBeenCalledWith('wc_save_shipping_booking', expect.anything());
    expect(s.supabase.client.functions.invoke).toHaveBeenCalledWith(expect.anything(), { body: { action: 'fulfillShipping', orderId: 'order' } });
    expect(s.supabase.client.rpc.mock.invocationCallOrder[0]).toBeLessThan(s.supabase.client.functions.invoke.mock.invocationCallOrder[0]);
    expect(s.service.rows()[0].status).toBe('Fulfilled');
    expect(s.orders.orders()[0].fulfillment_status).toBe('FULFILLED');
    expect(s.orders.orders()[1].fulfillment_status).toBe('NOT_FULFILLED');
    expect(s.activity.load).toHaveBeenCalledWith(true);
  });
  it('retains fulfilled status when data is reloaded from storage', async () => {
    const s = setup(); await s.service.bookShipment(s.row, {} as any);
    s.service.rows.set([]); s.orders.orders.set([]);
    await s.orders.load(); await s.service.load();
    expect(s.service.rows()[0].status).toBe('Fulfilled');
    expect(s.orders.orders()[0].fulfillment_status).toBe('FULFILLED');
  });
  it('keeps booking when Wix fails and retries only Wix', async () => {
    const s = setup();
    s.supabase.client.functions.invoke.mockRejectedValueOnce(new Error('temporary failure'));
    expect(await s.service.bookShipment(s.row, {} as any)).toBe(true);
    expect(s.service.error()).toContain('temporary failure');
    expect(s.service.rows()[0].status).toBe('Shipping Booked');
    expect(s.orders.orders()[0].fulfillment_status).toBe('NOT_FULFILLED');
    await s.service.syncShippingFulfillment(s.service.rows()[0]);
    expect(s.service.rows()[0].status).toBe('Fulfilled');
    expect(s.courier.bookOrder).toHaveBeenCalledOnce();
  });
  it('does not fulfill when courier booking fails', async () => {
    const s = setup(); s.courier.bookOrder.mockRejectedValueOnce(new Error('booking rejected'));
    expect(await s.service.bookShipment(s.row, {} as any)).toBe(false);
    expect(s.supabase.client.functions.invoke).not.toHaveBeenCalled();
    expect(s.service.rows()[0].status).toBe('Shipping Preparation');
  });
  it('blocks another booking after persistence failure', async () => {
    const s = setup(); s.supabase.client.rpc.mockResolvedValueOnce({ error: { message: 'database unavailable' } } as any);
    expect(await s.service.bookShipment(s.row, {} as any)).toBe(false);
    expect(await s.service.bookShipment(s.row, {} as any)).toBe(false);
    expect(s.courier.bookOrder).toHaveBeenCalledOnce();
    expect(s.supabase.client.functions.invoke).not.toHaveBeenCalled();
  });
  it('keeps the pickup collection trigger separate from shipping', async () => {
    const s = setup(); const pickup = { ...s.row, route: 'Pickup' as const, status: 'Awaiting Pickup' as const };
    expect(await s.service.bookShipment(pickup, {} as any)).toBe(false);
    expect(await s.service.syncShippingFulfillment(pickup)).toBe(false);
    expect(await s.service.markCollected(s.row)).toBe(false);
    savedPickup(s, pickup);
    const mark = vi.spyOn(s.orders, 'markFulfilledInWix').mockResolvedValue({ ok: true });
    expect(await s.service.markCollected(pickup)).toBe(true);
    expect(mark).toHaveBeenCalledWith('order'); expect(s.courier.bookOrder).not.toHaveBeenCalled();
  });
  it('retains pickup rollback when Wix fails', async () => {
    const s = setup(); const pickup = { ...s.row, route: 'Pickup' as const, status: 'Awaiting Pickup' as const };
    savedPickup(s, pickup);
    vi.spyOn(s.orders, 'markFulfilledInWix').mockRejectedValue(new Error('Wix unavailable'));
    expect(await s.service.markCollected(pickup)).toBe(false);
    expect(s.saved.row.status).toBe('Awaiting Pickup');
    expect(s.saved.order.fulfillment_status).toBe('NOT_FULFILLED');
    expect(s.activity.addFulfilledNote).not.toHaveBeenCalled();
    expect(s.service.error()).toContain('Wix unavailable');
  });
  it('does not skip another order while one sync is running', async () => {
    const s = setup();
    s.service.syncingOrderIds.set(['different-order']);
    s.saved.sync = [{order_id:'order',status:'pending'}];
    await s.service.syncShippingFulfillment({...s.row,status:'Shipping Booked'});
    expect(s.supabase.client.functions.invoke).toHaveBeenCalledOnce();
    expect(s.service.syncingOrderIds()).toEqual(['different-order']);
  });
});

function savedPickup(s: ReturnType<typeof setup>, row: FulfilmentRow) {
  s.saved.row = row; s.service.rows.set([row]);
}
