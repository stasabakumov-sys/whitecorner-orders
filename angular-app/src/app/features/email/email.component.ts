import { Component, computed, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { DrawerModule } from 'primeng/drawer';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

type MailView = 'Inbox' | 'Needs reply' | 'Sent';
type AiState = 'Not analysed' | 'Review' | 'Draft ready' | 'Auto handled';
type MailIntent =
  | 'Order question'
  | 'Customisation'
  | 'Product question'
  | 'Production / lead time'
  | 'Pickup'
  | 'Delivery / shipping'
  | 'Payment / invoice'
  | 'Order change'
  | 'Claim / damage'
  | 'Cancellation / refund'
  | 'General enquiry';

interface MailRow {
  id: string;
  correspondent: string;
  subject: string;
  preview: string;
  received_at: string;
  direction: 'Incoming' | 'Outgoing';
  status: MailView;
  ai_state?: AiState;
  linked_order?: string | null;
  intent?: MailIntent | null;
  needs_reply?: boolean | null;
  confidence?: number | null;
  recommended_action?: string | null;
  draft_reply?: string | null;
  automation_allowed?: boolean;
  risk_reason?: string | null;
}

@Component({
  selector: 'app-email',
  standalone: true,
  imports: [ButtonModule, DrawerModule, InputTextModule, TableModule, TagModule],
  template: `
    <section class="mail-shell">
      <div class="head">
        <div>
          <div class="title-row">
            <h2>Email</h2>
            <p-tag value="Mailbox not connected" severity="warn" />
          </div>
          <p>Customer email with AI-assisted analysis and replies.</p>
        </div>
        <p-button label="Compose" icon="pi pi-pencil" [disabled]="true" />
      </div>

      <div class="agent-panel">
        <div class="agent-icon">AI</div>
        <div class="agent-copy">
          <div class="agent-title">
            <b>AI Email Agent</b>
            <p-tag value="Review before send" severity="info" />
          </div>
          <p>The agent will analyse incoming messages, match them to an order when possible and decide whether the next step is information only, a draft reply or manual review.</p>
          <div class="agent-flow">
            <span>Analyse</span><i>→</i>
            <span>Match order</span><i>→</i>
            <span>Classify intent</span><i>→</i>
            <span>Recommend action</span><i>→</i>
            <span>Draft reply</span>
          </div>
          <div class="intent-title">AI categories</div>
          <div class="intent-list">
            @for (intent of intents; track intent) { <span>{{ intent }}</span> }
          </div>
        </div>
        <div class="guardrails">
          <small>Never auto-send</small>
          <span>Claims / damage</span>
          <span>Refunds / cancellations</span>
          <span>Paid-order changes</span>
          <span>Financial consequences</span>
          <span>Low-confidence matches</span>
        </div>
      </div>

      <div class="controls">
        <div class="views">
          @for (view of views; track view) {
            <p-button
              [label]="view + ' ' + countFor(view)"
              [outlined]="activeView() !== view"
              [severity]="activeView() === view ? 'primary' : 'secondary'"
              (onClick)="activeView.set(view)"
            />
          }
        </div>
        <input pInputText placeholder="Search email…" [value]="query()" (input)="query.set($any($event.target).value)" />
      </div>

      <p-table [value]="visibleRows()" styleClass="p-datatable-sm" [tableStyle]="{'min-width':'980px'}">
        <ng-template pTemplate="header">
          <tr><th>From / To</th><th>Subject</th><th>Message</th><th>Order</th><th>Date</th><th>AI</th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-mail>
          <tr class="mailrow" (click)="selected.set(mail)">
            <td><b>{{ mail.correspondent }}</b><small>{{ mail.direction }}</small></td>
            <td><b>{{ mail.subject }}</b></td>
            <td class="preview">{{ mail.preview }}</td>
            <td>{{ mail.linked_order || '—' }}</td>
            <td>{{ mail.received_at }}</td>
            <td><p-tag [value]="mail.ai_state || 'Not analysed'" [severity]="aiSeverity(mail.ai_state)" /></td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr><td colspan="6"><div class="empty"><div class="empty-icon">✉</div><b>No email connected yet</b><span>When the info mailbox is connected, messages will appear here automatically.</span><small>Inbox / Needs reply / Sent stay as working views; AI will populate the analysis behind each thread.</small></div></td></tr>
        </ng-template>
      </p-table>
    </section>

    <p-drawer [visible]="!!selected()" (visibleChange)="$event || selected.set(null)" position="right" [modal]="true" [style]="{width:'min(860px,96vw)'}" styleClass="mail-drawer">
      @if(selected(); as mail){
        <ng-template pTemplate="header"><div class="drawer-title"><b>{{ mail.subject }}</b><span>{{ mail.correspondent }}</span></div></ng-template>
        <div class="drawerbody">
          <section>
            <div class="section-title">Thread</div>
            <div class="message-card"><div class="message-meta"><b>{{ mail.direction }}</b><span>{{ mail.received_at }}</span></div><p>{{ mail.preview || 'Message content will appear here when the mailbox is connected.' }}</p></div>
          </section>
          <section>
            <div class="section-title">AI analysis</div>
            <div class="analysis-grid">
              <div><small>State</small><p-tag [value]="mail.ai_state || 'Not analysed'" [severity]="aiSeverity(mail.ai_state)" /></div>
              <div><small>Linked order</small><b>{{ mail.linked_order || 'Not matched' }}</b></div>
              <div><small>Category</small><b>{{ mail.intent || 'Not analysed' }}</b></div>
              <div><small>Needs reply</small><b>{{ mail.needs_reply == null ? 'Not analysed' : (mail.needs_reply ? 'Yes' : 'No') }}</b></div>
              <div><small>Confidence</small><b>{{ mail.confidence == null ? '—' : confidenceLabel(mail.confidence) }}</b></div>
              <div><small>Automation</small><b>{{ mail.automation_allowed ? 'Allowed' : 'Manual review' }}</b></div>
            </div>
            <div class="recommendation"><small>Recommended action</small><p>{{ mail.recommended_action || 'AI recommendation will appear here after analysis.' }}</p></div>
            @if(mail.risk_reason){<div class="risk"><b>Manual review required:</b> {{ mail.risk_reason }}</div>}
          </section>
          <section>
            <div class="section-title">Draft reply</div>
            <textarea pInputText rows="10" [value]="mail.draft_reply || ''" placeholder="AI draft will appear here…" disabled></textarea>
            <div class="draft-actions"><p-button label="Regenerate" icon="pi pi-refresh" [outlined]="true" [disabled]="true" /><p-button label="Send" icon="pi pi-send" [disabled]="true" /></div>
            <small class="hint">Sending remains disabled until mailbox integration is connected.</small>
          </section>
        </div>
      }
    </p-drawer>
  `,
  styles: [`
    .mail-shell{background:#fff;border:1px solid #e4e7ec;border-radius:12px;overflow:hidden}.head{padding:18px 20px;border-bottom:1px solid #e4e7ec;display:flex;gap:18px;align-items:flex-start}.head>div:first-child{min-width:0}.head>p-button{margin-left:auto}.title-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.title-row h2{margin:0}.head p{margin:5px 0 0;color:#758198;font-size:12px}
    .agent-panel{margin:16px 18px;display:grid;grid-template-columns:auto minmax(0,1fr) minmax(220px,290px);gap:14px;align-items:start;border:1px solid #d8e3f2;background:#f8fbff;border-radius:12px;padding:15px}.agent-icon{width:44px;height:44px;border-radius:10px;background:#172033;color:#fff;display:grid;place-items:center;font-weight:800;font-size:13px}.agent-title{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.agent-copy p{margin:6px 0 10px;color:#667085;font-size:12px;line-height:1.45}.agent-flow,.intent-list{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.agent-flow span{font-size:11px;background:#fff;border:1px solid #dce4ee;border-radius:999px;padding:5px 8px;color:#475467}.agent-flow i{font-style:normal;color:#98a2b3}.intent-title{margin-top:12px;margin-bottom:6px;color:#758198;text-transform:uppercase;font-size:10px;font-weight:700}.intent-list span{font-size:10px;background:#eef4ff;color:#344054;border:1px solid #d8e3f2;border-radius:999px;padding:4px 7px}.guardrails{background:#fff;border:1px solid #dce4ee;border-radius:9px;padding:11px;display:flex;gap:5px;flex-wrap:wrap}.guardrails small{width:100%;color:#758198;text-transform:uppercase;font-size:10px;font-weight:700;margin-bottom:3px}.guardrails span{font-size:10px;background:#fff4ed;color:#9a3412;border-radius:999px;padding:4px 7px}
    .controls{display:flex;align-items:center;gap:14px;padding:12px 18px;border-top:1px solid #edf0f3;border-bottom:1px solid #edf0f3}.views{display:flex;gap:6px;flex-wrap:wrap}.controls input{margin-left:auto;width:min(340px,100%)}:host ::ng-deep .p-datatable-thead>tr>th{font-size:11px;text-transform:uppercase;color:#758198;background:#fafbfc}.mailrow{cursor:pointer}.preview{max-width:430px;color:#667085}td small{display:block;margin-top:3px;color:#98a2b3}.empty{display:flex;min-height:260px;align-items:center;justify-content:center;flex-direction:column;text-align:center;gap:8px;color:#667085}.empty b{color:#172033;font-size:16px}.empty span{max-width:570px}.empty small{margin-top:5px;color:#98a2b3}.empty-icon{width:48px;height:48px;border-radius:50%;background:#f1f4f7;display:grid;place-items:center;font-size:22px;color:#475467}
    .drawer-title{display:flex;flex-direction:column;gap:3px}.drawer-title span{font-size:12px;color:#758198}.drawerbody{padding:4px 2px}.drawerbody section{margin-bottom:24px}.section-title{font-size:11px;text-transform:uppercase;color:#758198;font-weight:700;margin-bottom:8px}.message-card,.recommendation{border:1px solid #e4e7ec;border-radius:9px;padding:12px;background:#fbfcfd}.message-card p,.recommendation p{white-space:pre-wrap;line-height:1.5}.message-meta{display:flex;justify-content:space-between;gap:12px;font-size:12px;color:#758198}.analysis-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.analysis-grid>div{border:1px solid #e4e7ec;border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:5px}.analysis-grid small,.recommendation small{font-size:10px;text-transform:uppercase;color:#758198;font-weight:700}.risk{margin-top:8px;background:#fff1f1;color:#8c2f2f;border-radius:8px;padding:10px;font-size:12px}.drawerbody textarea{width:100%;resize:vertical;border:1px solid #d4d9e2;border-radius:8px;padding:10px;font:inherit}.draft-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:9px}.hint{display:block;margin-top:6px;color:#98a2b3;text-align:right}
    @media(max-width:860px){.agent-panel{grid-template-columns:auto 1fr}.guardrails{grid-column:1/-1}.head,.controls{flex-direction:column}.head>p-button,.controls input{margin-left:0}.controls input{width:100%}.analysis-grid{grid-template-columns:1fr 1fr}}@media(max-width:560px){.analysis-grid{grid-template-columns:1fr}}
  `]
})
export class EmailComponent {
  readonly views: MailView[] = ['Inbox','Needs reply','Sent'];
  readonly intents: MailIntent[] = ['Order question','Customisation','Product question','Production / lead time','Pickup','Delivery / shipping','Payment / invoice','Order change','Claim / damage','Cancellation / refund','General enquiry'];
  readonly activeView = signal<MailView>('Inbox');
  readonly query = signal('');
  readonly rows = signal<MailRow[]>([]);
  readonly selected = signal<MailRow|null>(null);

  readonly visibleRows = computed(() => {
    const view = this.activeView();
    const q = this.query().trim().toLowerCase();
    return this.rows().filter(row => row.status === view && (!q || `${row.correspondent} ${row.subject} ${row.preview} ${row.linked_order || ''}`.toLowerCase().includes(q)));
  });

  countFor(view: MailView): number { return this.rows().filter(row => row.status === view).length; }
  confidenceLabel(value:number):string { return `${Math.round(value * 100)}%`; }
  aiSeverity(state?: AiState): 'success'|'info'|'warn'|'secondary' {
    if (state === 'Auto handled') return 'success';
    if (state === 'Draft ready') return 'info';
    if (state === 'Review') return 'warn';
    return 'secondary';
  }
}
