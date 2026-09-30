import {DatePipe, JsonPipe} from '@angular/common';
import {Component, inject} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {DialogModule} from 'primeng/dialog';
import {RouterLink} from '@angular/router';
import {HubMembersService} from '../../core/services/hub-members.service';
import {BillingService} from './billing.service';

@Component({selector: 'app-billing', standalone: true, imports: [DatePipe, JsonPipe, FormsModule, DialogModule, RouterLink], template: `
  <header><h1>Invoices & receipts</h1><p>Wix documents saved in Hub. Original amounts and document versions are preserved.</p></header>
  <div class="summary" aria-live="polite">
    @for(source of billing.sources(); track source.kind) {
      <span><b>{{source.saved}} {{source.kind}}s</b> · @if(source.run){
        Latest scan: {{source.run.saved_count}} saved · {{source.run.scan_complete ? 'data scan finished' : 'in progress'}}
        <small>Started {{source.run.started_at | date:'MMM d, yyyy, h:mm a':'+1000'}} AEST</small>
        @if(source.run.last_error){<small class="row-error">{{source.run.last_error}}</small>}
      } @else {Not imported yet}<small>PDFs: {{source.pdf_saved}} saved · {{source.pdf_pending}} not copied</small></span>
    }
  </div>
  <div class="controls">
    <select aria-label="Document type" [ngModel]="billing.kind()" (ngModelChange)="billing.kind.set($event);billing.page.set(0);billing.load()" [disabled]="billing.busy() || billing.loading()"><option value="invoice">Invoices</option><option value="receipt">Receipts</option></select>
    <input aria-label="Search document number or customer" placeholder="Document number or customer" [ngModel]="billing.search()" (ngModelChange)="billing.search.set($event)" (keyup.enter)="search()" [disabled]="billing.busy()">
    <button (click)="search()" [disabled]="billing.busy() || billing.loading()">Search</button>
    <button (click)="billing.load()" [disabled]="billing.busy() || billing.loading()">Refresh list</button>
    @if(members.manager()) {
      <button (click)="billing.checkAccess()" [disabled]="billing.busy()">Check Wix access</button>
      <button (click)="billing.importDocuments(false,['invoice','receipt'])" [disabled]="billing.busy()">Import / resume all</button>
      <button (click)="billing.importDocuments(true)" [disabled]="billing.busy()">Fresh {{billing.kind()}} scan</button>
      <button (click)="billing.copyPdfs()" [disabled]="billing.busy()">Copy all {{billing.kind()}} PDFs</button>
      @if(billing.busy()){<button (click)="billing.pause()">Pause after current step</button>}
    }
  </div>
  @if(billing.error()){<p class="notice error" role="alert">{{billing.error()}}</p>}
  @if(billing.progress()){<p class="notice" role="status">{{billing.progress()}}</p>}
  @if(billing.loading()){<p role="status">Loading saved documents…</p>}
  @if(billing.detailLoading()){<p role="status">Loading document details…</p>}
  <div class="table-wrap"><table><thead><tr><th>Document</th><th>Customer</th><th>Issued</th><th>Status</th><th>Total</th><th>PDF in Hub</th><th>Actions</th></tr></thead><tbody>
    @for(doc of billing.documents();track doc.id){<tr>
      <td>{{doc.number || 'Unnumbered draft'}}<small>{{doc.kind}}</small>@if(doc.hub_order_id && doc.order_number){<small><a routerLink="/orders" [queryParams]="{order:doc.order_number}">Order {{doc.order_number}}</a></small>}</td>
      <td>{{doc.customer_name || '—'}}</td><td>{{doc.issued_at ? (doc.issued_at | date:'MMM d, yyyy':'+1000') : '—'}}</td>
      <td>{{doc.status}}</td><td class="amount">{{doc.total ?? '—'}} {{doc.currency || ''}}</td>
      <td>@if(doc.pdf_saved){<span class="saved">Saved</span>}@else{<span>Not copied</span>}@if(doc.pdf_error){<small class="row-error">{{doc.pdf_error}}</small>}</td>
      <td><div class="actions"><button (click)="billing.view(doc.id)" [disabled]="billing.busy()">Details</button>
        @if(doc.pdf_saved){<button (click)="billing.openPdf(doc.id)">Open PDF</button>}@else if(members.manager()){<button (click)="billing.copyPdfs(doc.id)" [disabled]="billing.busy()">Copy PDF</button>}
      </div></td>
    </tr>} @empty {<tr><td colspan="7">{{billing.loading() ? 'Loading…' : billing.error() ? 'Documents could not be loaded. See the error above.' : 'No saved documents match this view.'}}</td></tr>}
  </tbody></table></div>
  <footer><span>{{billing.total()}} matching documents</span><button (click)="page(-1)" [disabled]="billing.page() === 0 || billing.busy() || billing.loading()">Previous</button><span>Page {{billing.page()+1}}</span><button (click)="page(1)" [disabled]="(billing.page()+1)*50 >= billing.total() || billing.busy() || billing.loading()">Next</button></footer>
  <p class="help">A finished data scan does not mean every PDF is copied. Missing PDFs remain visible for retry. Invoices and receipts are separate records and are not added to Finance income totals.</p>
  <p-dialog header="Saved document details" [visible]="!!billing.detail()" (visibleChange)="!$event && billing.detail.set(null)" [modal]="true" [style]="{width:'760px',maxWidth:'95vw'}">
    @if(billing.detail();as detail){
      <p>Wix ID: {{detail.document.wix_id}}</p>
      <p>Wix eCommerce order ID: {{detail.document.wix_order_id || 'No explicit order association supplied by Wix'}}</p>
      <h3>Saved versions</h3><ul>@for(version of detail.versions;track version.source_hash){<li>{{version.imported_at | date:'MMM d, yyyy, h:mm a':'+1000'}} AEST · {{version.pdf_saved ? 'PDF saved' : 'PDF not copied'}} @if(version.pdf_saved){<button (click)="billing.openPdf(detail.document.id,version.source_hash)">Open version PDF</button>}</li>}</ul>
      <details><summary>Original Wix record</summary><pre>{{detail.source | json}}</pre></details>
    }
  </p-dialog>
`, styles: [`
  :host{display:block;color:#263345}h1{margin:0}header p,.help{color:#718096;font-size:13px}header{margin-bottom:18px}
  .summary{display:flex;gap:24px;flex-wrap:wrap;margin-bottom:16px;font-size:13px;color:#667085}.summary b{color:#344054}
  .controls{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px}button,select,input{border:1px solid #dce2eb;border-radius:8px;background:#fff;padding:9px 12px;font:inherit;font-size:12px;color:inherit;min-height:36px}button{cursor:pointer}button:hover:not(:disabled){background:#f2f5f9}button:disabled{opacity:.5;cursor:default}input{min-width:225px;flex:1;max-width:360px}
  .notice{padding:12px;border:1px solid #d7e6fa;border-radius:8px;background:#edf5ff;font-size:13px;white-space:pre-line}.error{background:#fff0ee;border-color:#f4ccc8;color:#a12622}
  .table-wrap{overflow:auto;border:1px solid #e1e6ed;border-radius:12px;background:#fff}table{border-collapse:collapse;width:100%;font-size:13px}th,td{padding:14px;text-align:left;border-bottom:1px solid #edf0f4;vertical-align:top}th{color:#718096;font-size:11px;font-weight:600;background:#fcfdff}tbody tr:last-child td{border-bottom:0}.amount{white-space:nowrap}small{display:block;color:#718096;font-size:11px;margin-top:5px}.row-error{color:#a12622;min-width:200px;max-width:330px}.saved{color:#197550}.actions{display:flex;gap:6px;flex-wrap:wrap;min-width:160px}
  footer{display:flex;gap:12px;align-items:center;margin-top:14px;font-size:12px;color:#718096}footer>span:first-child{margin-right:auto}.help{line-height:1.5}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}li{margin-bottom:10px}li button{margin-left:8px}details summary{cursor:pointer}
  @media(max-width:700px){input{max-width:none;min-width:180px}.controls>*{flex-grow:1}footer{flex-wrap:wrap}.summary{gap:12px}}
`]})
export class BillingComponent {
  readonly billing = inject(BillingService);
  readonly members = inject(HubMembersService);
  constructor() { void this.billing.load(); }
  search() { if (this.billing.busy()) return; this.billing.page.set(0); void this.billing.load(); }
  page(delta: number) { this.billing.page.update(p => Math.max(0, p + delta)); void this.billing.load(); }
}
