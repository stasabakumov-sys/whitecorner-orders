import {Injectable, signal} from '@angular/core';
import {SupabaseService} from '../../core/services/supabase.service';

export type BillingKind = 'invoice' | 'receipt';
export interface BillingDocument {
  id: string; kind: BillingKind; wix_id: string; number: string | null; customer_name: string | null;
  wix_order_id: string | null; currency: string | null; total: string | null; paid: string | null;
  status: string; issued_at: string | null; source_hash: string; synced_at: string;
  pdf_saved: boolean; pdf_error: string | null;
  hub_order_id?: string | null; order_number?: string | null;
}
export interface BillingSource {
  kind: BillingKind; saved: number; pdf_saved: number; pdf_pending: number;
  run: {id: string; saved_count: number; scan_complete: boolean; started_at: string; last_error: string | null} | null;
}
@Injectable({providedIn: 'root'})
export class BillingService {
  readonly documents = signal<BillingDocument[]>([]);
  readonly sources = signal<BillingSource[]>([]);
  readonly total = signal(0);
  readonly busy = signal(false);
  readonly loading = signal(false);
  readonly detailLoading = signal(false);
  readonly error = signal('');
  readonly progress = signal('');
  readonly kind = signal<BillingKind>('invoice');
  readonly page = signal(0);
  readonly search = signal('');
  readonly detail = signal<{source: unknown; document: BillingDocument; versions: {source_hash: string; imported_at: string; pdf_saved: boolean}[]} | null>(null);
  private pauseRequested = false;
  private readSequence = 0;
  constructor(private readonly db: SupabaseService) {}
  private async request(body: Record<string, unknown>) {
    const {data, error} = await this.db.client.functions.invoke('wix-billing-import', {body});
    if (error) {
      const response = await error.context?.json?.().catch(() => null);
      throw new Error(response?.error || 'Billing service is unavailable. Check deployment and your Hub session, then retry.');
    }
    if (!data?.ok) throw new Error(data?.error || 'The billing operation was not confirmed. Retry.');
    return data;
  }
  private message(e: unknown) { return e instanceof Error ? e.message : 'The operation failed. Retry.'; }
  async load(clearError = true) {
    const sequence = ++this.readSequence;
    this.loading.set(true); if (clearError) this.error.set('');
    try {
      const [list, status] = await Promise.all([
        this.request({action: 'list', kind: this.kind(), page: this.page(), search: this.search()}),
        this.request({action: 'status'}),
      ]);
      if (sequence !== this.readSequence) return;
      this.documents.set(list.documents); this.total.set(list.total); this.sources.set(status.sources);
    } catch (e) { if (sequence === this.readSequence) this.error.set(this.message(e)); }
    finally { if (sequence === this.readSequence) this.loading.set(false); }
  }
  pause() { this.pauseRequested = true; this.progress.set('Pausing after the current operation is saved…'); }
  async checkAccess() {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(''); this.progress.set('Checking Wix document access…');
    try {
      const {results} = await this.request({action: 'checkAccess'});
      this.progress.set(results.filter((r: {available: boolean}) => r.available).map((r: {kind: string}) => `${r.kind}s: access confirmed`).join('; '));
      this.error.set(results.filter((r: {available: boolean}) => !r.available).map((r: {error: string}) => r.error).join('\n'));
    } catch (e) { this.error.set(this.message(e)); this.progress.set('Access check did not complete.'); }
    finally { this.busy.set(false); }
  }
  async importDocuments(restart = false, kinds: BillingKind[] = [this.kind()]) {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(''); this.pauseRequested = false;
    const errors: string[] = [];
    try {
      for (const kind of kinds) {
        if (this.pauseRequested) break;
        let first = true;
        try {
          while (!this.pauseRequested) {
            this.progress.set(`Reading ${kind}s from Wix…`);
            const {run} = await this.request({action: 'importPage', kind, restart: restart && first});
            first = false;
            this.progress.set(`${run.saved_count} ${kind}s saved in this scan. ${run.scan_complete ? 'Data scan finished; PDF copies are separate.' : 'Reading the next page…'}`);
            if (run.scan_complete) break;
          }
        } catch (e) { errors.push(`${kind}s: ${this.message(e)}`); }
      }
      this.error.set(errors.join('\n'));
      this.progress.set(this.pauseRequested ? 'Paused. Saved pages are kept; Resume continues this scan.' : errors.length ? 'Import stopped with issues. Saved documents are kept.' : 'Data scans finished. Copy PDFs to complete the document archive.');
      await this.load(false);
    } finally { this.busy.set(false); }
  }
  async copyPdfs(id?: string) {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(''); this.pauseRequested = false;
    let copied = 0, failed = 0;
    try {
      let page = 0;
      do {
        const list = id ? {documents: [{id, pdf_saved: false}], total: 1} : await this.request({action: 'list', kind: this.kind(), page, search: ''});
        const pending = list.documents.filter((document: BillingDocument) => !document.pdf_saved);
        for (let offset = 0; offset < pending.length; offset += 4) {
          if (this.pauseRequested) break;
          this.progress.set(`Copying PDFs: ${copied} saved, ${failed} need review…`);
          await Promise.all(pending.slice(offset, offset + 4).map(async (document: BillingDocument) => {
            try { await this.request({action: 'copyPdf', id: document.id}); copied++; }
            catch (e) { failed++; this.error.set(this.message(e)); }
            if (!this.pauseRequested) this.progress.set(`Copying PDFs: ${copied} saved, ${failed} need review…`);
          }));
        }
        page++;
        if (id || page * 50 >= list.total) break;
      } while (!this.pauseRequested);
      this.progress.set(`${this.pauseRequested ? 'Paused. ' : ''}${copied} PDFs copied; ${failed} need review. Errors remain beside the affected documents.`);
    } catch (e) { this.error.set(this.message(e)); this.progress.set('PDF copying stopped. Saved files are kept; retry.'); }
    finally { await this.load(false); this.busy.set(false); }
  }
  async view(id: string) {
    if (this.detailLoading()) return;
    this.detailLoading.set(true);
    this.error.set('');
    try { this.detail.set(await this.request({action: 'detail', id})); }
    catch (e) { this.error.set(this.message(e)); }
    finally { this.detailLoading.set(false); }
  }
  async openPdf(id: string, hash?: string) {
    // Reserve a user-initiated window before awaiting the signed URL.
    const target = window.open('about:blank', '_blank');
    if (!target) { this.error.set('Allow pop-ups for Hub and retry opening the PDF.'); return; }
    target.opener = null;
    this.error.set(''); this.progress.set('Opening the private PDF…');
    try { const result = await this.request({action: 'openPdf', id, hash}); target.location.href = result.url; this.progress.set('PDF opened in a new tab.'); }
    catch (e) { target.close(); this.error.set(this.message(e)); this.progress.set('PDF could not be opened.'); }
  }
}
