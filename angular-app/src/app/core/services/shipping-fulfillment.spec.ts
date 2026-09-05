import { describe, expect, it, vi } from 'vitest';
import { syncShippingFulfillment } from '../../../../../supabase/functions/wix-orders-sync/shipping-fulfillment';

function setup() {
  const state = { status: 'pending', token: null as string|null, orderStatus: 'NOT_FULFILLED', notes: [] as string[] };
  const db = {
    rpc: vi.fn(async (name: string, args: any) => {
      if (name === 'wc_claim_shipping_fulfillment') {
        if (state.status === 'synced') return { data: { status: 'synced' } };
        if (state.token) return { data: { status: 'busy' } };
        state.token = args.p_token;
        return { data: { status: 'claimed', uncertain: state.status === 'uncertain' } };
      }
      state.status = args.p_status;
      if (args.p_status === 'synced') {
        state.orderStatus = 'FULFILLED';
        state.notes.push('WIX fulfilled');
      }
      if (args.p_error) state.notes.push(args.p_error);
      if (args.p_status !== 'uncertain' || args.p_error) state.token = null;
      return { error: null };
    }),
    from: vi.fn(() => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { wix_order_id: 'wix-order' } }) }) }) })),
  };
  const lineItems = [{ id: 'product', quantity: 2 }, { id: 'delivery', quantity: 1 }];
  let fulfillments: any[] = [];
  const request = vi.fn(async (url: any, init: any) => {
    if (init.method === 'POST') {
      fulfillments = [...fulfillments, { id: 'wix-fulfillment', lineItems: JSON.parse(init.body).fulfillment.lineItems }];
      return Response.json({ orderWithFulfillments: { orderId: 'wix-order', fulfillments } });
    }
    if (String(url).includes('/fulfillments/')) return Response.json({ orderWithFulfillments: { orderId: 'wix-order', fulfillments } });
    return Response.json({ order: { id: 'wix-order', status: 'APPROVED', fulfillmentStatus: 'NOT_FULFILLED', lineItems } });
  });
  return { db, state, request, run: () => syncShippingFulfillment(db, 'hub-order', {}, request as typeof fetch),
    existing: (value: any[]) => { fulfillments = value; }, lineItems };
}

describe('shipping fulfillment server workflow', () => {
  it('uses Wix ID, fulfills all remaining lines and persists completion plus note', async () => {
    const s = setup();
    await expect(s.run()).resolves.toEqual({ ok: true, alreadyFulfilled: false });
    expect(s.request.mock.calls[2][0]).toContain('/orders/wix-order/create-fulfillment');
    expect(JSON.parse(s.request.mock.calls[2][1].body).fulfillment.lineItems).toEqual(s.lineItems);
    expect(s.state.orderStatus).toBe('FULFILLED');
    expect(s.state.notes).toEqual(['WIX fulfilled']);
  });
  it('does not repeat a completed request or its note', async () => {
    const s = setup(); await s.run(); await s.run();
    expect(s.request.mock.calls.filter(call => call[1].method === 'POST')).toHaveLength(1);
    expect(s.state.notes).toHaveLength(1);
  });
  it('checks fulfillments even when the asynchronous Wix order status is stale', async () => {
    const s = setup(); s.existing([{ id: 'already-there', lineItems: s.lineItems }]);
    await s.run();
    expect(s.request.mock.calls.every(call => call[1].method !== 'POST')).toBe(true);
    expect(s.state.orderStatus).toBe('FULFILLED');
  });
  it('only submits remaining quantities for partial fulfillment', async () => {
    const s = setup(); s.existing([{ id: 'partial', lineItems: [{ id: 'product', quantity: 1 }] }]);
    await s.run();
    expect(JSON.parse(s.request.mock.calls[2][1].body).fulfillment.lineItems[0].quantity).toBe(1);
  });
  it('persists a read failure without claiming completion and safely retries', async () => {
    const s = setup(); s.request.mockResolvedValueOnce(new Response('', { status: 503 }));
    await expect(s.run()).rejects.toThrow('HTTP 503');
    expect(s.state.status).toBe('failed'); expect(s.state.orderStatus).toBe('NOT_FULFILLED');
    expect(s.state.notes[0]).toContain('503');
    await s.run(); expect(s.state.orderStatus).toBe('FULFILLED');
  });
  it('does not duplicate a POST with an unknown outcome', async () => {
    const s = setup();
    const original = s.request.getMockImplementation()!;
    s.request.mockImplementation(async (url, init) => {
      if (init.method === 'POST') { await original(url, init); throw new Error('network lost'); }
      return original(url, init);
    });
    await expect(s.run()).rejects.toThrow('interrupted');
    expect(s.state.status).toBe('uncertain');
    await s.run();
    expect(s.request.mock.calls.filter(call => call[1].method === 'POST')).toHaveLength(1);
    expect(s.state.orderStatus).toBe('FULFILLED');
  });
  it('retries a rejected rate-limited POST safely', async () => {
    const s = setup(); const original = s.request.getMockImplementation()!;
    let rejected = false;
    s.request.mockImplementation((url, init) => {
      if (init.method === 'POST' && !rejected) { rejected = true; return Promise.resolve(new Response('', { status: 429 })); }
      return original(url, init);
    });
    await expect(s.run()).rejects.toThrow('429'); expect(s.state.status).toBe('failed');
    await s.run(); expect(s.state.orderStatus).toBe('FULFILLED');
  });
  it('does not retry an ambiguous server failure with another POST', async () => {
    const s = setup(); const original = s.request.getMockImplementation()!;
    s.request.mockImplementation((url, init) => init.method === 'POST'
      ? Promise.resolve(new Response('', { status: 503 })) : original(url, init));
    await expect(s.run()).rejects.toThrow('503');
    await expect(s.run()).rejects.toThrow('No second fulfillment');
    expect(s.request.mock.calls.filter(call => call[1].method === 'POST')).toHaveLength(1);
  });
  it('requires verification when an uncertain POST is still absent from Wix', async () => {
    const s = setup(); s.state.status = 'uncertain';
    await expect(s.run()).rejects.toThrow('No second fulfillment');
    expect(s.request.mock.calls.every(call => call[1].method !== 'POST')).toBe(true);
  });
  it('serializes concurrent attempts', async () => {
    const s = setup(); const first = s.run();
    await expect(s.run()).rejects.toThrow('already running'); await first;
    expect(s.request.mock.calls.filter(call => call[1].method === 'POST')).toHaveLength(1);
  });
  it('does not accept an invalid fulfillment list', async () => {
    const s = setup(); const original = s.request.getMockImplementation()!;
    s.request.mockImplementation((url, init) => String(url).includes('/fulfillments/')
      ? Promise.resolve(Response.json({})) : original(url, init));
    await expect(s.run()).rejects.toThrow('list could not be verified');
    expect(s.state.orderStatus).toBe('NOT_FULFILLED');
  });
  it('keeps separate orders independent when one fails', async () => {
    const failing = setup(), successful = setup();
    failing.request.mockResolvedValueOnce(new Response('', { status: 503 }));
    await Promise.allSettled([failing.run(), successful.run()]);
    expect(failing.state.orderStatus).toBe('NOT_FULFILLED');
    expect(successful.state.orderStatus).toBe('FULFILLED');
  });
});
