import { Component, computed, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

type MailView = 'Inbox' | 'Needs reply' | 'Sent';

interface MailRow {
  id: string;
  from: string;
  subject: string;
  preview: string;
  received_at: string;
  status: 'New' | 'Needs reply' | 'Replied' | 'Sent';
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
          <p>Incoming and outgoing customer email will be managed here.</p>
        </div>
        <p-button label="Compose" icon="pi pi-pencil" [disabled]="true" />
      </div>

      <div class="controls">
        <div class="views">
          @for (view of views; track view) {
            <p-button
              [label]="view"
              [outlined]="activeView() !== view"
              [severity]="activeView() === view ? 'primary' : 'secondary'"
              (onClick)="activeView.set(view)"
            />
          }
        </div>
        <input pInputText placeholder="Search email…" [value]="query()" (input)="query.set($any($event.target).value)" />
      </div>

      <div class="summary">
        <div><span>Inbox</span><b>{{ inboxCount() }}</b></div>
        <div><span>Needs reply</span><b>{{ needsReplyCount() }}</b></div>
        <div><span>Sent</span><b>{{ sentCount() }}</b></div>
        <div class="agent"><span>AI agent</span><p-tag value="Planned" severity="info" /></div>
      </div>

      <p-table [value]="visibleRows()" styleClass="p-datatable-sm" [tableStyle]="{'min-width':'760px'}">
        <ng-template pTemplate="header">
          <tr><th>From / To</th><th>Subject</th><th>Message</th><th>Date</th><th>Status</th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-mail>
          <tr>
            <td>{{ mail.from }}</td>
            <td><b>{{ mail.subject }}</b></td>
            <td class="preview">{{ mail.preview }}</td>
            <td>{{ mail.received_at }}</td>
            <td><p-tag [value]="mail.status" [severity]="tagSeverity(mail.status)" /></td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr>
            <td colspan="5">
              <div class="empty">
                <div class="empty-icon">✉</div>
                <b>No email connected yet</b>
                <span>When the info mailbox is connected, messages will appear here automatically.</span>
                <small>Next stage: mailbox connection → thread view → AI analysis → draft/automatic replies.</small>
              </div>
            </td>
          </tr>
        </ng-template>
      </p-table>
    </section>
  `,
  styles: [`
    .mail-shell{background:#fff;border:1px solid #e4e7ec;border-radius:12px;overflow:hidden}
    .head{padding:18px 20px;border-bottom:1px solid #e4e7ec;display:flex;gap:18px;align-items:flex-start}
    .head>div:first-child{min-width:0}.head>p-button{margin-left:auto}.title-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.title-row h2{margin:0}.head p{margin:5px 0 0;color:#758198;font-size:12px}
    .controls{display:flex;align-items:center;gap:14px;padding:12px 18px;border-bottom:1px solid #edf0f3}.views{display:flex;gap:6px;flex-wrap:wrap}.controls input{margin-left:auto;width:min(300px,100%)}
    .summary{display:grid;grid-template-columns:repeat(4,minmax(130px,1fr));gap:10px;padding:14px 18px;background:#fafbfc;border-bottom:1px solid #edf0f3}.summary>div{background:#fff;border:1px solid #e4e7ec;border-radius:9px;padding:11px 12px;display:flex;align-items:center;gap:10px}.summary span{color:#667085;font-size:12px}.summary b{font-size:18px;margin-left:auto}.summary .agent p-tag{margin-left:auto}
    :host ::ng-deep .p-datatable-thead>tr>th{font-size:11px;text-transform:uppercase;color:#758198;background:#fafbfc}.preview{max-width:430px;color:#667085}.empty{display:flex;min-height:280px;align-items:center;justify-content:center;flex-direction:column;text-align:center;gap:8px;color:#667085}.empty b{color:#172033;font-size:16px}.empty span{max-width:520px}.empty small{margin-top:5px;color:#98a2b3}.empty-icon{width:48px;height:48px;border-radius:50%;background:#f1f4f7;display:grid;place-items:center;font-size:22px;color:#475467}
    @media(max-width:760px){.head,.controls{flex-direction:column}.head>p-button,.controls input{margin-left:0}.controls input{width:100%}.summary{grid-template-columns:1fr 1fr}}
  `]
})
export class EmailComponent {
  readonly views: MailView[] = ['Inbox','Needs reply','Sent'];
  readonly activeView = signal<MailView>('Inbox');
  readonly query = signal('');
  readonly rows = signal<MailRow[]>([]);

  readonly inboxCount = computed(() => this.rows().filter(x => x.status !== 'Sent').length);
  readonly needsReplyCount = computed(() => this.rows().filter(x => x.status === 'Needs reply').length);
  readonly sentCount = computed(() => this.rows().filter(x => x.status === 'Sent').length);
  readonly visibleRows = computed(() => {
    const view = this.activeView();
    const q = this.query().trim().toLowerCase();
    return this.rows().filter(row => {
      const matchesView = view === 'Inbox' ? row.status !== 'Sent' : view === 'Needs reply' ? row.status === 'Needs reply' : row.status === 'Sent';
      const matchesQuery = !q || `${row.from} ${row.subject} ${row.preview}`.toLowerCase().includes(q);
      return matchesView && matchesQuery;
    });
  });

  tagSeverity(status: MailRow['status']): 'success'|'info'|'warn'|'secondary' {
    if (status === 'Needs reply') return 'warn';
    if (status === 'Sent' || status === 'Replied') return 'success';
    if (status === 'New') return 'info';
    return 'secondary';
  }
}
