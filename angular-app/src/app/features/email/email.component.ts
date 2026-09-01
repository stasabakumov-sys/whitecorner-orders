import { Component, computed, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

type MailView = 'Inbox' | 'Needs reply' | 'Sent';

interface MailRow {
  id: string;
  correspondent: string;
  subject: string;
  preview: string;
  received_at: string;
  direction: 'Incoming' | 'Outgoing';
  status: 'Inbox' | 'Needs reply' | 'Sent';
  ai_state?: 'Not analysed' | 'Review' | 'Draft ready' | 'Auto handled';
}

@Component({
  selector: 'app-email',
  standalone: true,
  imports: [ButtonModule, InputTextModule, TableModule, TagModule],
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
            <p-tag value="Interface ready" severity="info" />
          </div>
          <p>The agent will analyse incoming messages, link them to an order when possible and recommend or prepare the next action.</p>
          <div class="agent-flow">
            <span>Analyse message</span><i>→</i>
            <span>Find order / customer</span><i>→</i>
            <span>Decide action</span><i>→</i>
            <span>Draft or reply</span>
          </div>
        </div>
        <div class="agent-mode">
          <small>Initial mode</small>
          <b>Review before send</b>
          <span>AI may prepare drafts, but sending stays manual until explicitly enabled.</span>
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

      <p-table [value]="visibleRows()" styleClass="p-datatable-sm" [tableStyle]="{'min-width':'900px'}">
        <ng-template pTemplate="header">
          <tr>
            <th>From / To</th>
            <th>Subject</th>
            <th>Message</th>
            <th>Date</th>
            <th>AI</th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-mail>
          <tr>
            <td><b>{{ mail.correspondent }}</b><small>{{ mail.direction }}</small></td>
            <td><b>{{ mail.subject }}</b></td>
            <td class="preview">{{ mail.preview }}</td>
            <td>{{ mail.received_at }}</td>
            <td><p-tag [value]="mail.ai_state || 'Not analysed'" [severity]="aiSeverity(mail.ai_state)" /></td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr>
            <td colspan="5">
              <div class="empty">
                <div class="empty-icon">✉</div>
                <b>No email connected yet</b>
                <span>When the info mailbox is connected, messages will appear here automatically.</span>
                <small>AI will classify incoming messages, link orders and prepare replies while the Inbox / Needs reply / Sent views remain available.</small>
              </div>
            </td>
          </tr>
        </ng-template>
      </p-table>
    </section>
  `,
  styles: [`
    .mail-shell{background:#fff;border:1px solid #e4e7ec;border-radius:12px;overflow:hidden}
    .head{padding:18px 20px;border-bottom:1px solid #e4e7ec;display:flex;gap:18px;align-items:flex-start}.head>div:first-child{min-width:0}.head>p-button{margin-left:auto}.title-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.title-row h2{margin:0}.head p{margin:5px 0 0;color:#758198;font-size:12px}
    .agent-panel{margin:16px 18px;display:grid;grid-template-columns:auto minmax(0,1fr) minmax(210px,280px);gap:14px;align-items:start;border:1px solid #d8e3f2;background:#f8fbff;border-radius:12px;padding:15px}.agent-icon{width:44px;height:44px;border-radius:10px;background:#172033;color:#fff;display:grid;place-items:center;font-weight:800;font-size:13px}.agent-title{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.agent-copy p{margin:6px 0 10px;color:#667085;font-size:12px;line-height:1.45}.agent-flow{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.agent-flow span{font-size:11px;background:#fff;border:1px solid #dce4ee;border-radius:999px;padding:5px 8px;color:#475467}.agent-flow i{font-style:normal;color:#98a2b3}.agent-mode{background:#fff;border:1px solid #dce4ee;border-radius:9px;padding:11px;display:flex;flex-direction:column;gap:4px}.agent-mode small{color:#758198;text-transform:uppercase;font-size:10px;font-weight:700}.agent-mode b{font-size:13px}.agent-mode span{color:#758198;font-size:11px;line-height:1.4}
    .controls{display:flex;align-items:center;gap:14px;padding:12px 18px;border-top:1px solid #edf0f3;border-bottom:1px solid #edf0f3}.views{display:flex;gap:6px;flex-wrap:wrap}.controls input{margin-left:auto;width:min(340px,100%)}
    :host ::ng-deep .p-datatable-thead>tr>th{font-size:11px;text-transform:uppercase;color:#758198;background:#fafbfc}.preview{max-width:430px;color:#667085}td small{display:block;margin-top:3px;color:#98a2b3}.empty{display:flex;min-height:280px;align-items:center;justify-content:center;flex-direction:column;text-align:center;gap:8px;color:#667085}.empty b{color:#172033;font-size:16px}.empty span{max-width:570px}.empty small{margin-top:5px;color:#98a2b3}.empty-icon{width:48px;height:48px;border-radius:50%;background:#f1f4f7;display:grid;place-items:center;font-size:22px;color:#475467}
    @media(max-width:860px){.agent-panel{grid-template-columns:auto 1fr}.agent-mode{grid-column:1/-1}.head,.controls{flex-direction:column}.head>p-button,.controls input{margin-left:0}.controls input{width:100%}}
  `]
})
export class EmailComponent {
  readonly views: MailView[] = ['Inbox','Needs reply','Sent'];
  readonly activeView = signal<MailView>('Inbox');
  readonly query = signal('');
  readonly rows = signal<MailRow[]>([]);

  readonly visibleRows = computed(() => {
    const view = this.activeView();
    const q = this.query().trim().toLowerCase();
    return this.rows().filter(row => row.status === view && (!q || `${row.correspondent} ${row.subject} ${row.preview}`.toLowerCase().includes(q)));
  });

  countFor(view: MailView): number { return this.rows().filter(row => row.status === view).length; }

  aiSeverity(state?: MailRow['ai_state']): 'success'|'info'|'warn'|'secondary' {
    if (state === 'Auto handled') return 'success';
    if (state === 'Draft ready') return 'info';
    if (state === 'Review') return 'warn';
    return 'secondary';
  }
}
