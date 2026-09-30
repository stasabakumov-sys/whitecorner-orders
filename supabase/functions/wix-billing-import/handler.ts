import {BillingError, downloadPdf, kindOf, queryPage, sha256, snapshot, wixRead} from './wix.ts';

const publicColumns = 'id,kind,wix_id,number,customer_name,wix_order_id,hub_order_id,order_number,currency,total,paid,status,issued_at,source_hash,synced_at,pdf_saved,pdf_error,pdf_saved_at';
function saved<T>(result: {data: T; error: unknown}, message: string): T {
  if (result.error || result.data == null) throw new BillingError(message);
  return result.data;
}
export async function billingAction(db: any, headers: Record<string, string>, site: string, actor: string, body: Record<string, any>, call: typeof fetch = fetch): Promise<any> {
  if (body.action === 'checkAccess') {
    const results = [];
    for (const kind of ['invoice', 'receipt'] as const) {
      try { await queryPage(kind, headers, null, new Date().toISOString(), call); results.push({kind, available: true}); }
      catch (e) { results.push({kind, available: false, error: safeError(e)}); }
    }
    return {results}; // No database or Wix mutations.
  }
  if (body.action === 'importPage') {
    const kind = kindOf(body.kind);
    const run: any = saved(await db.rpc('wc_billing_begin', {p_site: site, p_kind: kind, p_actor: actor, p_restart: body.restart === true}), 'Could not start or resume the import. Check the billing migration and retry.');
    if (run.scan_complete) return {run};
    try {
      const page = await queryPage(kind, headers, run.cursor, run.started_at, call);
      const next: any = saved(await db.rpc('wc_billing_save_page', {p_run: run.id, p_cursor: run.cursor, p_next: page.next, p_complete: page.complete, p_rows: page.rows}), 'Could not save this page, or the scan changed. Saved pages are kept; resume or start a fresh scan.');
      return {run: next};
    } catch (error) {
      await db.from('wc_billing_import_runs').update({last_error: safeError(error)}).eq('id', run.id).eq('saved_count', run.saved_count);
      throw error;
    }
  }
  if (body.action === 'status') {
    const result = [];
    for (const kind of ['invoice', 'receipt'] as const) {
      const runs: any[] = saved(await db.from('wc_billing_import_runs').select('id,kind,saved_count,scan_complete,started_at,updated_at,last_error').eq('site_id', site).eq('kind', kind).order('started_at', {ascending: false}).limit(1), 'Could not read import progress. Retry.');
      const count = await db.from('wc_billing_documents').select('id', {count: 'exact', head: true}).eq('site_id', site).eq('kind', kind);
      if (count.error || count.count == null) throw new BillingError('Could not count saved documents. Retry.');
      const pdfs = await db.from('wc_billing_document_list').select('id', {count: 'exact', head: true}).eq('site_id', site).eq('kind', kind).eq('pdf_saved', true);
      if (pdfs.error || pdfs.count == null) throw new BillingError('Could not count archived PDFs. Retry.');
      if (runs[0]) {
        const items = await db.from('wc_billing_import_items').select('document_id', {count: 'exact', head: true}).eq('run_id', runs[0].id);
        if (items.error || items.count !== runs[0].saved_count) throw new BillingError('Saved scan count could not be verified. Review the import before marking it complete.');
      }
      result.push({kind, run: runs[0] || null, saved: count.count, pdf_saved: pdfs.count, pdf_pending: count.count - pdfs.count});
    }
    return {sources: result};
  }
  if (body.action === 'list') {
    const kind = kindOf(body.kind);
    const page = body.page ?? 0;
    if (!Number.isSafeInteger(page) || page < 0 || page > 100000) throw new BillingError('Invalid document page.');
    let query = db.from('wc_billing_document_list').select(publicColumns, {count: 'exact'}).eq('site_id', site).eq('kind', kind);
    const search = typeof body.search === 'string' ? body.search.trim().slice(0, 100) : '';
    if (search) {
      // PostgREST filter grammar is not user-input syntax.
      const safe = search.replace(/[^\p{L}\p{N} @._-]/gu, ' ').replace(/[_%]/g, ' ').trim();
      if (!safe) throw new BillingError('Search using a document number or customer name.');
      query = query.or(`number.ilike.%${safe}%,customer_name.ilike.%${safe}%`);
    }
    const response = await query.order('issued_at', {ascending: false, nullsFirst: false}).order('id').range(page * 50, page * 50 + 49);
    const documents: any[] = saved(response, 'Could not load saved documents. Retry.');
    return {total: response.count, documents};
  }
  if (body.action === 'copyPdf' || body.action === 'openPdf' || body.action === 'detail') {
    if (typeof body.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.id)) throw new BillingError('Choose a saved document.');
    const doc: any = saved(await db.from('wc_billing_documents').select('*').eq('site_id', site).eq('id', body.id).maybeSingle(), 'Saved document not found. Reload the list.');
    const versions: any[] = saved(await db.from('wc_billing_document_versions').select('*').eq('document_id', doc.id).order('imported_at', {ascending: false}), 'Could not read the saved document. Retry.');
    const version = versions.find(v => v.source_hash === doc.source_hash);
    if (!version) throw new BillingError('The saved document snapshot is missing. Resume the import.');
    if (body.action === 'detail') return {document: doc, source: version.source_json, versions: versions.map(v => ({source_hash: v.source_hash, imported_at: v.imported_at, pdf_saved: !!v.pdf_path}))};
    if (body.action === 'openPdf') {
      const target = body.hash ? versions.find(v => v.source_hash === body.hash) : version;
      if (!target?.pdf_path) throw new BillingError('This PDF has not been copied to Hub. Copy it from Wix first.');
      const link: any = saved(await db.storage.from('billing-documents').createSignedUrl(target.pdf_path, 60), 'Could not open the private PDF. Retry.');
      return {url: link.signedUrl};
    }
    if (version.pdf_path) return {copied: true};
    try {
      const kind = kindOf(doc.kind);
      const fresh = (await wixRead(kind, headers, `/${encodeURIComponent(doc.wix_id)}`, undefined, call))[kind];
      const latest = await snapshot(kind, fresh);
      if (latest.source_hash !== doc.source_hash) throw new BillingError('This document changed in Wix. Start a fresh scan before copying its current PDF. Earlier snapshots are kept.');
      const info = kind === 'invoice' ? fresh.documentInfo : fresh.document;
      if (info?.status !== 'AVAILABLE' || typeof info.downloadUrl !== 'string') throw new BillingError('Wix has no downloadable PDF for this document yet. Existing document data is saved; export the original in Wix or retry later.');
      const bytes = await downloadPdf(info.downloadUrl, call);
      const hash = await sha256(bytes);
      const path = `${doc.id}/${doc.source_hash}/${hash}.pdf`;
      // Content-addressed upload makes a lost response safe to retry.
      const upload = await db.storage.from('billing-documents').upload(path, bytes, {contentType: 'application/pdf', upsert: true});
      if (upload.error) throw new BillingError('PDF could not be saved to Hub. The previous file is kept; retry.');
      const now = new Date().toISOString();
      saved(await db.from('wc_billing_document_versions').update({pdf_path: path, pdf_sha256: hash, pdf_bytes: bytes.length, pdf_saved_at: now, pdf_attempted_at: now, pdf_error: null}).eq('document_id', doc.id).eq('source_hash', doc.source_hash).select('pdf_path').single(), 'PDF upload succeeded but the archive record could not be confirmed. Retry this document.');
      return {copied: true};
    } catch (error) {
      const message = `${doc.kind} ${doc.number || doc.wix_id}.pdf: ${safeError(error)}`;
      await db.from('wc_billing_document_versions').update({pdf_error: message, pdf_attempted_at: new Date().toISOString()}).eq('document_id', doc.id).eq('source_hash', doc.source_hash).is('pdf_path', null);
      throw new BillingError(message);
    }
  }
  throw new BillingError('Unknown billing action.');
}
export function safeError(error: unknown): string {
  return error instanceof BillingError ? error.message : 'The document operation failed. Saved progress is kept; retry.';
}
