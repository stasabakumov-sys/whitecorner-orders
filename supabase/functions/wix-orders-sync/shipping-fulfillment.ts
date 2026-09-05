// Kept independent of Deno so the actual server flow can be tested with mocks.
export async function syncShippingFulfillment(db: any, orderId: string,
  wixHeaders: Record<string, string>, request: typeof fetch = fetch) {
  const token = crypto.randomUUID();
  const { data: claim, error: claimError } = await db.rpc('wc_claim_shipping_fulfillment', {
    p_order_id: orderId, p_token: token,
  });
  if (claimError) throw new Error('Could not claim shipping sync. A saved shipping booking and the shipping sync migration are required.');
  if (claim?.status === 'synced') return { ok: true, alreadyFulfilled: true };
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
  try {
    const { data: order, error } = await db.from('wc_orders').select('wix_order_id').eq('id', orderId).single();
    if (error || !order?.wix_order_id) throw new Error('Wix order ID is missing. Manual review required.');
    const id = encodeURIComponent(order.wix_order_id);
    const wix = await read(`https://www.wixapis.com/ecom/v1/orders/${id}`);
    const remoteOrder = wix.order;
    if (!remoteOrder || remoteOrder.id !== order.wix_order_id) throw new Error('Wix order identity could not be verified.');
    if (['FULFILLED','COMPLETED'].includes(String(remoteOrder.fulfillmentStatus).toUpperCase())) {
      await record('synced');
      return { ok: true, alreadyFulfilled: true };
    }
    // Use authoritative quantities and include delivery/service lines: leaving
    // an actual Wix line unfulfilled can leave the order PARTIALLY_FULFILLED.
    const lines = remoteOrder.lineItems;
    if (!Array.isArray(lines) || !lines.length || lines.some((line: any) => !line.id || !Number.isInteger(line.quantity) || line.quantity < 1)) {
      throw new Error('Wix line items could not be verified. Manual review required.');
    }
    const listed = await read(`https://www.wixapis.com/ecom/v1/fulfillments/orders/${id}`);
    const remainingFrom = (result: any) => {
      const items = result?.fulfillments;
      if (result?.orderId !== order.wix_order_id || !Array.isArray(items) || items.some((item: any) =>
        !item.id || !Array.isArray(item.lineItems) || item.lineItems.some((line: any) =>
          !line.id || !Number.isInteger(line.quantity) || line.quantity < 1))) {
        throw new Error('Wix fulfillment list could not be verified.');
      }
      return lines.map((line: any) => ({ id: line.id, quantity: line.quantity - items.reduce(
        (sum: number, fulfillment: any) => sum + fulfillment.lineItems.filter((item: any) => item.id === line.id)
          .reduce((count: number, item: any) => count + item.quantity, 0), 0),
      })).filter((line: any) => line.quantity > 0);
    };
    const remaining = remainingFrom(listed.orderWithFulfillments);
    const fulfillments = listed.orderWithFulfillments.fulfillments;
    if (!remaining.length) {
      await record('synced');
      return { ok: true, alreadyFulfilled: true };
    }
    if (uncertain) throw new Error('Previous Wix request has an unconfirmed outcome. No second fulfillment was sent. Retry verification later or request manual review.');
    if (remoteOrder.status !== 'APPROVED') throw new Error('Wix order is not approved. Manual review required.');
    // Persist BEFORE sending. If the process dies after Wix accepts the POST,
    // the next caller must reconcile with GET instead of blindly creating again.
    await record('uncertain');
    uncertain = true;
    const response = await request(`https://www.wixapis.com/ecom/v1/fulfillments/orders/${id}/create-fulfillment`, {
      method: 'POST', headers: wixHeaders, body: JSON.stringify({ fulfillment: { lineItems: remaining } }),
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) {
      // A timeout, 409, or server failure may have committed the fulfillment.
      if (response.status >= 400 && response.status < 500 && ![408,409].includes(response.status)) uncertain = false;
      throw new Error(`Wix fulfillment request failed (HTTP ${response.status}). Retry synchronization; shipping is already booked.`);
    }
    const payload = await response.json();
    const confirmed = payload.orderWithFulfillments;
    const fulfillmentId = confirmed?.fulfillments?.find((item: any) =>
      item.id && !fulfillments.some((old: any) => old.id === item.id))?.id;
    if (!fulfillmentId || remainingFrom(confirmed).length) throw new Error('Wix response did not confirm complete fulfillment. Retry verification.');
    await record('synced', null, fulfillmentId);
    return { ok: true, alreadyFulfilled: false };
  } catch (error) {
    // Only our own sanitized messages are persisted; no remote bodies or PII.
    const message = error instanceof Error && /^(Could not|Wix |Previous Wix)/.test(error.message)
      ? error.message : 'Wix synchronization was interrupted. Retry verification; do not book shipping again.';
    await record(uncertain ? 'uncertain' : 'failed', message);
    throw new Error(message);
  }
}
