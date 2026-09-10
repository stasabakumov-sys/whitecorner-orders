import {Component, signal, output} from '@angular/core';
import {WixCatalogImportComponent} from './wix-catalog-import.component';
import {DialogModule} from 'primeng/dialog';
import {SupabaseService} from '../../core/services/supabase.service';
import {environment} from '../../../environments/environment';
import {HubCatalogProduct, WixCatalogProduct, reconcileCatalogue} from './wix-catalog-review';

@Component({selector: 'app-wix-catalog-review', standalone: true, imports: [DialogModule,WixCatalogImportComponent], template: `
  <button (click)="open = true">Review Wix catalogue</button>
  <p-dialog header="Review Wix catalogue" [(visible)]="open" [modal]="true" [style]="{width:'880px',maxWidth:'95vw'}" [draggable]="false">
    <p>Read and compare checks Wix identities without changing products. Use Import below to save product cards and variants.</p>
    <button (click)="review()" [disabled]="busy()">{{busy() ? 'Reading Wix…' : 'Read and compare'}}</button>
    @if(busy()){<p role="status">{{progress()}} product identities read. This is not an import.</p>}
    @if(error()){<p role="alert" class="error">{{error()}}</p>}
    @if(report(); as r){
      <p><strong>{{progress()}} Wix products</strong> · {{version()}} · {{r.linked}} linked · {{r.newCount}} new · {{r.review}} to review</p>
      <p>{{r.unlinked.length}} Hub products have no Wix ID. {{r.absent.length}} linked Hub products were not returned; they will be kept.</p>
      <p class="notice">Identity review only. Full variant details, inventory and media still require import validation.
      @if(version()==='V3_CATALOG'){ Hidden-product coverage has not been verified.}
      @else{ Hidden products were explicitly requested.}</p>
      <div class="table-wrap"><table><thead><tr><th>Wix product</th><th>Match</th><th>Variants returned</th></tr></thead><tbody>
      @for(p of r.rows;track p.id){<tr><td>{{p.name}}<small>{{p.id}}</small></td><td>{{p.status}}</td><td>{{p.variantCount ?? 'Not read'}}</td></tr>}
      </tbody></table></div>
    }
    <app-wix-catalog-import (saved)="report.set(null);saved.emit()" />
  </p-dialog>
`, styles: [`button{font:inherit;padding:8px 12px;border:1px solid #dce5ef;border-radius:8px;background:white;color:#344054;cursor:pointer}button:disabled{opacity:.5}p{line-height:1.5}.notice{background:#f1f5fa;padding:12px;border-radius:8px}.error{color:#b42318}.table-wrap{max-height:45vh;overflow:auto}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:10px;border-bottom:1px solid #e7edf5}small{display:block;color:#758198;font-size:11px;overflow-wrap:anywhere}`]})
export class WixCatalogReviewComponent {
  readonly saved=output<void>();
  open = false;
  readonly busy = signal(false); readonly error = signal(''); readonly progress = signal(0); readonly version = signal('');
  readonly report = signal<ReturnType<typeof reconcileCatalogue> | null>(null);
  constructor(private readonly supabase: SupabaseService) {}
  async review() {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(''); this.report.set(null); this.progress.set(0); this.version.set('');
    try {
      const hub: HubCatalogProduct[] = [];
      for (let offset = 0; ; offset += 500) {
        const {data, error} = await this.supabase.client.from('wc_shipping_products').select('id,wix_product_id,product_name').order('id').range(offset, offset + 499);
        if (error) throw new Error('Could not read the Hub catalogue. Retry the review.');
        hub.push(...(data || [])); if ((data || []).length < 500) break;
      }
      const wix: WixCatalogProduct[] = [], seen = new Set<string>(), cursors = new Set<string>();
      let offset = 0, cursor: string | null = null, expected: number | null = null;
      for (let page = 0; ; page++) {
        if (page >= 1000) throw new Error('Catalogue review limit reached; the review is incomplete.');
        const {data, error} = await this.supabase.client.functions.invoke(environment.wixSyncFunction, {
          body: {action: 'queryCatalog', offset, cursor, ...(this.version() ? {version: this.version()} : {})},
        });
        if (error) {const detail = await error.context?.json?.().catch(() => null); throw new Error(detail?.error || 'Wix catalogue could not be read. Check that the catalogue function is deployed.');}
        if (!data || !['V1_CATALOG', 'V3_CATALOG'].includes(data.version) || !Array.isArray(data.products) || typeof data.complete !== 'boolean') throw new Error('Invalid catalogue review response');
        if (this.version() && this.version() !== data.version) throw new Error('Catalogue version changed. Restart the review.');
        this.version.set(data.version);
        if (data.total != null) {
          if (!Number.isSafeInteger(data.total) || data.total < 0 || expected !== null && expected !== data.total) throw new Error('Catalogue total changed. Restart the review.');
          expected = data.total;
        }
        for (const p of data.products) {
          if (!p?.id || seen.has(p.id)) throw new Error('Duplicate product IDs during pagination. Restart the review.');
          seen.add(p.id); wix.push(p);
        }
        this.progress.set(wix.length);
        if (data.complete) {
          if (data.nextOffset !== null || data.nextCursor !== null || expected !== null && wix.length !== expected) throw new Error('Catalogue review is incomplete.');
          break;
        }
        if (!data.products.length) throw new Error('Catalogue pagination stalled.');
        if (data.version === 'V1_CATALOG') {
          if (data.nextOffset !== offset + data.products.length) throw new Error('Catalogue pagination stalled.');
          offset = data.nextOffset;
        } else {
          if (typeof data.nextCursor !== 'string' || !data.nextCursor || cursors.has(data.nextCursor)) throw new Error('Catalogue pagination stalled.');
          cursor = data.nextCursor; cursors.add(cursor!);
        }
      }
      this.report.set(reconcileCatalogue(wix, hub));
    } catch (error) {this.error.set(error instanceof Error ? error.message : 'Catalogue review failed');}
    finally {this.busy.set(false);}
  }
}
