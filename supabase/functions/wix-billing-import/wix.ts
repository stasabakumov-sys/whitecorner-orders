// Wix is an adapter: no issuance, payment, send, void or PDF-generation calls.
export type Kind = 'invoice' | 'receipt';
type Json = Record<string, any>;
export class BillingError extends Error {}
export const endpoint = (kind: Kind) => kind === 'invoice' ? '/invoices/v4/invoices' : '/receipts/v1/receipts';
export function kindOf(value: unknown): Kind {
  if (value !== 'invoice' && value !== 'receipt') throw new BillingError('Choose invoices or receipts.');
  return value;
}
const text = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value : null;
function decimal(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string' || !/^-?\d+(\.\d+)?$/.test(value)) throw new BillingError('Wix returned an invalid monetary amount. No page was saved.');
  return value; // Never round, infer GST or turn a missing amount into zero.
}
function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(k => k !== 'downloadUrl').map(k => [k, canonical(value[k])]));
  return value;
}
export async function sha256(value: Uint8Array): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(value).buffer))).map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function snapshot(kind: Kind, source: Json) {
  if (!source || !text(source.id) || !/^[\w-]{1,128}$/.test(source.id)) throw new BillingError('Wix returned a missing or invalid document ID. No page was saved.');
  const customer = kind === 'invoice' ? source.customerInfo : source.customer;
  const contact = customer?.contactDetails || {};
  const numbering = source.numbering || source.identifier || {};
  const reference = source.reference || {};
  // A Wix Payments order is NOT a Wix eCommerce order. Never guess by name/number.
  const wixOrderId = kind === 'invoice'
    ? reference.orderReference?.orderId || reference.standaloneReference?.orderId || reference.migratedReference?.orderId
    : source.sourceReference?.wixEcomOrder?.orderId;
  const raw = canonical(source);
  return {
    wix_id: source.id,
    source_hash: await sha256(new TextEncoder().encode(JSON.stringify(raw))),
    source_json: raw,
    number: text(numbering.displayNumber) || (numbering.number != null ? `${numbering.prefix || ''}${numbering.number}${numbering.suffix || ''}` : null),
    customer_name: text(contact.fullName) || text([contact.firstName, contact.lastName].filter(Boolean).join(' ')) || text(contact.company),
    wix_order_id: text(wixOrderId),
    currency: text(source.currency),
    total: decimal(source.totals?.total),
    paid: decimal(kind === 'receipt' ? source.payment?.amount : source.totals?.paidAmount),
    status: text(source.status) || (kind === 'receipt' ? 'ISSUED' : 'UNKNOWN'),
    issued_at: text(source.issueDate) || text(source.createdDate),
    source_updated_at: text(source.updatedDate),
  };
}
export async function wixRead(kind: Kind, headers: Record<string, string>, suffix: string, body?: unknown, call: typeof fetch = fetch): Promise<Json> {
  let response: Response;
  try {
    response = await call(`https://www.wixapis.com${endpoint(kind)}${suffix}`, {
      method: body === undefined ? 'GET' : 'POST', headers,
      ...(body === undefined ? {} : {body: JSON.stringify(body)}), signal: AbortSignal.timeout(25000), redirect: 'error',
    });
  } catch { throw new BillingError('Wix could not be reached. Saved progress is kept; retry.'); }
  if (!response.ok) {
    if (response.status === 403 || response.status === 401) throw new BillingError(`Wix denied access to ${kind}s. Check the site API key and Manage ${kind === 'invoice' ? 'Invoices' : 'Receipts'} permission, then retry.`);
    if (response.status === 428 && kind === 'invoice') throw new BillingError('Wix Invoices API is not enabled for this site yet. Export existing invoices from the Wix dashboard for migration; receipts can be imported separately.');
    throw new BillingError(`Wix ${kind} read failed (HTTP ${response.status}). Saved progress is kept; retry.`);
  }
  try { return await response.json(); } catch { throw new BillingError('Wix returned unreadable data. Saved progress is kept; retry.'); }
}
export async function queryPage(kind: Kind, headers: Record<string, string>, cursor: string | null, cutoff: string, call: typeof fetch = fetch) {
  const payload = await wixRead(kind, headers, '/query', {query: {
    // The cursor already carries the original filter/sort; Wix rejects repeating them.
    ...(cursor ? {} : {filter: {createdDate: {$lte: cutoff}}, sort: [{fieldName: 'id', order: 'ASC'}]}),
    cursorPaging: {limit: 50, ...(cursor ? {cursor} : {})},
  }}, call);
  const documents = payload[`${kind}s`];
  const meta = payload.pagingMetadata;
  if (!Array.isArray(documents) || documents.length > 50 || typeof meta?.hasNext !== 'boolean' || meta.count !== documents.length) {
    throw new BillingError('Wix returned incomplete pagination metadata. No page was saved.');
  }
  const next = meta.hasNext ? text(meta.cursors?.next) : null;
  if (meta.hasNext && (!next || next === cursor || !documents.length)) throw new BillingError('Wix pagination did not advance. No page was saved.');
  const rows = await Promise.all(documents.map((d: Json) => snapshot(kind, d)));
  if (new Set(rows.map(d => d.wix_id)).size !== rows.length) throw new BillingError('Wix returned duplicate documents. No page was saved.');
  return {rows, next, complete: !meta.hasNext};
}

// Download only from reviewed Wix asset hosts; redirects cannot escape the list.
export async function downloadPdf(url: string, call: typeof fetch = fetch, wixHeaders?: Record<string, string>): Promise<Uint8Array> {
  let target: URL;
  try { target = new URL(url); } catch { throw new BillingError('Wix returned an invalid PDF link. Retry the document.'); }
  if (target.protocol !== 'https:' || target.username || target.password || target.port || !['static.wixstatic.com', 'files.wix.com', 'www.wixapis.com', 'manage.wix.com'].includes(target.hostname)) {
    const host = /^[a-z0-9.-]{1,253}$/.test(target.hostname) ? target.hostname : 'unrecognized';
    throw new BillingError(`The Wix PDF download host (${host}) needs review before it can be copied. The saved document is kept.`);
  }
  let response: Response;
  try { response = await call(target, {redirect: 'error', signal: AbortSignal.timeout(30000)}); }
  catch { throw new BillingError('PDF download failed or redirected to an unreviewed host. Retry or review the Wix download host.'); }
  // Wix's own dashboard download service can require the same Wix identity.
  // Never forward credentials to asset hosts, redirects or arbitrary URLs.
  if (response.status === 401 && target.hostname === 'manage.wix.com' && wixHeaders?.Authorization && wixHeaders?.['wix-site-id']) {
    try {
      response = await call(target, {redirect: 'error', signal: AbortSignal.timeout(30000), headers: {
        Authorization: wixHeaders.Authorization, 'wix-site-id': wixHeaders['wix-site-id'],
      }});
    } catch { throw new BillingError('Authenticated Wix PDF download failed. Saved documents are kept; retry.'); }
  }
  if (!response.ok) throw new BillingError(`PDF download failed (HTTP ${response.status}). Wix download authorization or dashboard export is required; saved data is kept.`);
  const limit = 20 * 1024 * 1024;
  const size = Number(response.headers.get('content-length'));
  if (size > limit) throw new BillingError(`PDF is ${size} bytes; the limit is ${limit} bytes. Export and review this document manually.`);
  if (!response.body) throw new BillingError('Wix returned an empty PDF. Retry the document.');
  const chunks: Uint8Array[] = []; let bytes = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.length;
      if (bytes > limit) { await reader.cancel(); throw new BillingError(`PDF exceeds ${limit} bytes (received ${bytes}). Export and review this document manually.`); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const data = new Uint8Array(bytes); let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
  if (new TextDecoder().decode(data.slice(0, 5)) !== '%PDF-') throw new BillingError('Wix returned a non-PDF file. The previous file is kept; retry.');
  return data;
}
