// Shared by automatic booking completion and Retry Wix synchronization.
export function savedShippingDetails(shipment: any) {
  const quote = shipment?.selected_quote;
  const booking = quote?.booking;
  const trackingNumber = String(booking?.status?.consignmentNumber || '').trim();
  const shippingProvider = String(quote?.courierName || '').trim();
  const service = String(quote?.name || '').trim();
  if (!shipment?.courier_order_id || !booking || !trackingNumber || !shippingProvider || !service) {
    throw new Error('Saved shipping booking, tracking, carrier and service are required. Wait for tracking or request review; do not book again.');
  }
  return { trackingNumber, shippingProvider, service };
}

export async function syncShippingFulfillment(db: any, orderId: string,
  wixHeaders: Record<string, string>, request: typeof fetch = fetch) {
  const { data: shipment, error: shipmentError } = await db.from('wc_shipments')
    .select('courier_order_id,selected_quote').eq('order_id', orderId).single();
  if (shipmentError) throw new Error('Could not read saved shipping booking.');
  const shipping = savedShippingDetails(shipment);
  const token = crypto.randomUUID();
  const { data: claim, error: claimError } = await db.rpc('wc_claim_shipping_fulfillment', {
    p_order_id: orderId, p_token: token,
  });
  if (claimError) throw new Error('Could not claim shipping sync. A saved shipping booking and the shipping sync migration are required.');
  if (claim?.status !== 'busy' && claim?.contractVersion !== 2) throw new Error('Shipping tracking migration is required before synchronization.');
  if (claim?.status === 'completed') return { ok: true, alreadyFulfilled: true };
  if (claim?.status !== 'claimed') throw new Error('Wix synchronization is already running. Retry after it finishes.');
  let uncertain = Boolean(claim.uncertain);
  const record = async (status: string, error: string | null = null, id: string | null = null) => {
    const result = await db.rpc('wc_record_shipping_fulfillment', {
      p_order_id: orderId, p_token: token, p_status: status, p_error: error, p_wix_fulfillment_id: id,
    });
    if (result.error) throw new Error('Could not save Wix synchronization result. Retry synchronization; do not book shipping again.');
  };
  const read = async (url: string) => {
    const response = await request(url, { headers: wixHeaders, signal: AbortSignal.timeout(25000) });
    if (!response.ok) throw new Error(`Could not read Wix fulfillment (HTTP ${response.status}). Retry synchronization.`);
    return response.json();
  };
  let verify: (() => Promise<any>) | undefined;
  try {
    const { data: order, error } = await db.from('wc_orders').select('wix_order_id').eq('id', orderId).single();
    if (error || !order?.wix_order_id) throw new Error('Wix order ID is missing. Manual review required.');
    const id = encodeURIComponent(order.wix_order_id);
    const { order: remote } = await read(`https://www.wixapis.com/ecom/v1/orders/${id}`);
    if (!remote || remote.id !== order.wix_order_id) throw new Error('Wix order identity could not be verified.');
    const lines = remote.lineItems;
    if (!Array.isArray(lines) || !lines.length || new Set(lines.map((l: any) => l.id)).size !== lines.length ||
      lines.some((l: any) => !l.id || !Number.isInteger(l.quantity) || l.quantity < 1)) {
      throw new Error('Wix line items could not be verified. Manual review required.');
    }
    const inspect = (result: any) => {
      const items = result?.fulfillments;
      if (result?.orderId !== order.wix_order_id || !Array.isArray(items) ||
        new Set(items.map((f: any) => f.id)).size !== items.length || items.some((f: any) => !f.id ||
          !Array.isArray(f.lineItems) || !f.lineItems.length || f.lineItems.some((l: any) =>
            !lines.some((line: any) => line.id === l.id) || !Number.isInteger(l.quantity) || l.quantity < 1))) {
        throw new Error('Wix fulfillment list could not be verified.');
      }
      const remaining = lines.map((l: any) => ({ id: l.id, quantity: l.quantity - items.reduce((sum: number, f: any) =>
        sum + f.lineItems.filter((i: any) => i.id === l.id).reduce((n: number, i: any) => n + i.quantity, 0), 0) }));
      if (remaining.some((l: any) => l.quantity < 0)) throw new Error('Wix fulfillment quantities are inconsistent.');
      const matches = items.filter((f: any) => String(f.trackingInfo?.trackingNumber || '').trim() === shipping.trackingNumber &&
        String(f.trackingInfo?.shippingProvider || '').trim().toLowerCase() === shipping.shippingProvider.toLowerCase());
      if (matches.length > 1) throw new Error('Wix has multiple matching fulfillments. Manual review required.');
      return { remaining: remaining.filter((l: any) => l.quantity > 0), match: matches[0] };
    };
    verify = async () => inspect((await read(`https://www.wixapis.com/ecom/v1/fulfillments/orders/${id}`)).orderWithFulfillments);
    const existing = await verify();
    if (existing.match && !existing.remaining.length) {
      await record('completed', null, existing.match.id);
      return { ok: true, alreadyFulfilled: true };
    }
    if (existing.match || !existing.remaining.length) throw new Error('Wix fulfillment does not match the complete saved shipment. Manual review required.');
    if (uncertain) throw new Error('Previous Wix request has an unconfirmed outcome. No second fulfillment was sent. Request manual review.');
    if (remote.status !== 'APPROVED') throw new Error('Wix order is not approved. Manual review required.');
    await record('uncertain'); // Persist before POST, including crashes and lost responses.
    uncertain = true;
    const response = await request(`https://www.wixapis.com/ecom/v1/fulfillments/orders/${id}/create-fulfillment`, {
      method: 'POST', headers: wixHeaders,
      body: JSON.stringify({ fulfillment: { lineItems: existing.remaining,
        trackingInfo: { trackingNumber: shipping.trackingNumber, shippingProvider: shipping.shippingProvider } } }),
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) {
      if (response.status >= 400 && response.status < 500 && ![408,409].includes(response.status)) uncertain = false;
      throw new Error(`Wix fulfillment request failed (HTTP ${response.status}). Retry synchronization; shipping is already booked.`);
    }
    // Verify concrete records even if POST returns an empty/malformed body or order status lags.
    const confirmed = await verify();
    if (!confirmed.match || confirmed.remaining.length) throw new Error('Wix response did not confirm complete fulfillment. Retry verification.');
    await record('completed', null, confirmed.match.id);
    return { ok: true, alreadyFulfilled: false };
  } catch (error) {
    if (uncertain && verify) {
      try {
        const recovered = await verify();
        if (recovered.match && !recovered.remaining.length) {
          await record('completed', null, recovered.match.id);
          return { ok: true, alreadyFulfilled: true };
        }
      } catch { /* Keep uncertain: a failed GET is not evidence that POST failed. */ }
    }
    const message = error instanceof Error && /^(Could not|Wix |Previous Wix)/.test(error.message)
      ? error.message : 'Wix synchronization was interrupted. Retry verification; do not book shipping again.';
    await record(uncertain ? 'uncertain' : 'failed', message);
    throw new Error(message);
  }
}
