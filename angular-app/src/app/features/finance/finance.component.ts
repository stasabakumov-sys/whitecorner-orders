import { Component, ElementRef, HostListener, ViewChild, inject, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TagModule } from 'primeng/tag';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-finance',
  standalone: true,
  imports: [ButtonModule, MessageModule, ProgressSpinnerModule, TagModule],
  template: `
    <section class="finance-shell">
      <header class="page-head">
        <div class="title-block">
          <div class="title-line">
            <h2>Finance</h2>
            @if (loadState() === 'ready') { <p-tag value="Database live" severity="success" /> }
            @else if (loadState() === 'error') { <p-tag value="Connection issue" severity="danger" /> }
            @else { <p-tag value="Loading data" severity="secondary" /> }
          </div>
          <p>Expenses, income, profit and classification rules.</p>
        </div>
        <div class="toolbar">
          <p-button label="Import expenses" icon="pi pi-upload" [outlined]="true" size="small" (onClick)="runFinanceAction('importExpenses')" />
          <p-button label="Import income" icon="pi pi-upload" [outlined]="true" size="small" (onClick)="runFinanceAction('importIncome')" />
          <p-button label="Export" icon="pi pi-download" [outlined]="true" size="small" (onClick)="runFinanceAction('export')" />
          <p-button icon="pi pi-refresh" ariaLabel="Refresh Finance" [text]="true" [rounded]="true" size="small" [loading]="loadState() === 'loading'" (onClick)="refreshFinance()" />
        </div>
      </header>

      <nav class="section-tabs" aria-label="Finance sections">
        @for (tab of tabs; track tab.id) {
          <p-button
            [label]="tab.label"
            [icon]="tab.icon"
            size="small"
            [outlined]="activeTab !== tab.id"
            [severity]="activeTab === tab.id ? 'primary' : 'secondary'"
            (onClick)="selectTab(tab.id)"
          />
        }
      </nav>

      <div class="frame-wrap">
        @if (loadState() === 'loading') {
          <div class="loading-layer" role="status" aria-live="polite">
            <p-progress-spinner strokeWidth="3" ariaLabel="Loading Finance data" />
            <div><b>Loading Finance data…</b><span>You can keep browsing while data loads.</span></div>
          </div>
        } @else if (loadState() === 'error') {
          <div class="error-layer" role="alert">
            <p-message severity="error">{{ loadError() }}</p-message>
            <p-button label="Try again" icon="pi pi-refresh" size="small" (onClick)="refreshFinance()" />
          </div>
        }
        <iframe
          #financeFrame
          src="finance/index.html"
          title="White Corner Finance"
          loading="eager"
          (load)="onFrameLoad()"
        ></iframe>
      </div>
    </section>
  `,
  styles: [`
    :host{display:block;height:100%;min-height:0;overflow:hidden}
    .finance-shell{height:100%;min-height:0;background:#f6f7f9;display:flex;flex-direction:column;overflow:hidden}
    .page-head{display:flex;align-items:center;gap:20px;padding:14px 18px 10px;background:#fff;border-bottom:1px solid #e4e7ec;flex:0 0 auto}
    .title-block{min-width:0}.title-line{display:flex;align-items:center;gap:10px}.title-line h2{margin:0;color:#101828;font-size:20px;font-weight:650;letter-spacing:-.02em}.title-block>p{margin:4px 0 0;color:#667085;font-size:11px}
    .toolbar{margin-left:auto;display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end}
    .section-tabs{display:flex;gap:6px;padding:9px 18px;background:#fff;border-bottom:1px solid #e4e7ec;flex:0 0 auto}
    .frame-wrap{flex:1 1 auto;min-height:0;display:flex;flex-direction:column}
    iframe{display:block;width:100%;flex:1;min-height:0;border:0;background:#f6f7f9}
    .loading-layer,.error-layer{flex:0 0 auto;display:flex;align-items:center;justify-content:center;background:#f6f7f9;padding:8px 18px}
    .loading-layer{gap:13px;color:#344054}.loading-layer p-progress-spinner{width:30px;height:30px}.loading-layer div{display:flex;flex-direction:column;gap:3px}.loading-layer b{font-size:12px}.loading-layer span{font-size:10px;color:#667085}
    .error-layer{gap:12px}
    :host ::ng-deep .page-head .p-tag{font-size:9px;padding:2px 7px}
    :host ::ng-deep .toolbar .p-button,:host ::ng-deep .section-tabs .p-button{font-size:11px;padding:.42rem .7rem}
    @media(max-width:900px){.page-head{align-items:flex-start;flex-direction:column;gap:10px}.toolbar{margin-left:0;justify-content:flex-start}.section-tabs{overflow-x:auto}.section-tabs p-button{flex:0 0 auto}}
  `],
})
export class FinanceComponent {
  @ViewChild('financeFrame') private financeFrame?: ElementRef<HTMLIFrameElement>;

  private readonly auth = inject(AuthService);

  readonly tabs = [
    { id: 'expenses', label: 'Expenses', icon: 'pi pi-wallet' },
    { id: 'income', label: 'Income', icon: 'pi pi-arrow-down-left' },
    { id: 'profit', label: 'Profit', icon: 'pi pi-chart-line' },
    { id: 'assets', label: 'Rules & categories', icon: 'pi pi-sliders-h' },
  ] as const;
  activeTab: (typeof this.tabs)[number]['id'] = 'expenses';
  readonly loadState = signal<'loading' | 'ready' | 'error'>('loading');
  readonly loadError = signal('Finance data could not be loaded.');

  onFrameLoad(): void {
    this.loadState.set('loading');
    this.shareHubSession();
    this.runFinanceAction('setEmbedded');
    this.selectTab(this.activeTab);
  }

  @HostListener('window:message', ['$event'])
  onFinanceMessage(event: MessageEvent): void {
    if (event.origin !== window.location.origin || event.source !== this.financeFrame?.nativeElement.contentWindow) return;
    if (event.data?.type === 'white-corner-finance-loading') this.loadState.set('loading');
    if (event.data?.type === 'white-corner-finance-ready') this.loadState.set('ready');
    if (event.data?.type === 'white-corner-finance-error') {
      this.loadError.set(event.data.message || 'Finance data could not be loaded.');
      this.loadState.set('error');
    }
  }

  refreshFinance(): void {
    this.loadState.set('loading');
    this.runFinanceAction('refresh');
  }

  selectTab(tab: (typeof this.tabs)[number]['id']): void {
    this.activeTab = tab;
    const frame = this.financeFrame?.nativeElement.contentWindow as (Window & { showMainTab?: (tab: string) => void }) | undefined;
    if (!frame?.showMainTab) return;
    frame.showMainTab(tab);
  }

  runFinanceAction(action: 'importExpenses' | 'importIncome' | 'export' | 'refresh' | 'setEmbedded'): void {
    const doc = this.financeFrame?.nativeElement.contentDocument;
    const frame = this.financeFrame?.nativeElement.contentWindow as (Window & { exportCSV?: () => void; refreshDatabase?: () => void }) | undefined;
    if (!doc || !frame) return;
    if (action === 'setEmbedded') doc.body.classList.add('embedded');
    if (action === 'importExpenses') doc.getElementById('fileInput')?.click();
    if (action === 'importIncome') doc.getElementById('incomeFileInput')?.click();
    if (action === 'export') frame.exportCSV?.();
    if (action === 'refresh') frame.refreshDatabase?.();
  }

  shareHubSession(): void {
    const session = this.auth.session();
    const frameWindow = this.financeFrame?.nativeElement.contentWindow;
    if (!session || !frameWindow) return;

    frameWindow.postMessage(
      {
        type: 'white-corner-hub-session',
        session: {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        },
      },
      window.location.origin,
    );
  }
}
