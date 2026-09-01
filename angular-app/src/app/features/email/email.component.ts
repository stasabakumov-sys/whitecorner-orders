import { Component, computed, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';

type EmailTab = 'Mail' | 'AI Agent';
type MailView = 'Inbox' | 'Needs reply' | 'Sent';
type AiState = 'Not analysed' | 'Review' | 'Draft ready' | 'Auto handled';
type MailIntent = 'Order question'|'Customisation'|'Product question'|'Production / lead time'|'Pickup'|'Delivery / shipping'|'Payment / invoice'|'Order change'|'Claim / damage'|'Cancellation / refund'|'General enquiry';
type PolicyMode = 'Auto later' | 'Draft + review' | 'Manual only';
type MailboxId = 'all' | 'info' | 'support';

interface MailRow {
  id:string;
  mailbox:'info'|'support';
  correspondent:string;
  email:string;
  initials:string;
  subject:string;
  preview:string;
  body:string;
  received_at:string;
  time:string;
  direction:'Incoming'|'Outgoing';
  status:MailView;
  unread?:boolean;
  ai_state?:AiState;
  linked_order?:string|null;
  intent?:MailIntent|null;
  needs_reply?:boolean|null;
  confidence?:number|null;
  draft_reply?:string|null;
}
interface IntentPolicy { intent:MailIntent; mode:PolicyMode; rule:string; }

@Component({
  selector:'app-email',
  standalone:true,
  imports:[ButtonModule,InputTextModule,TagModule],
  template:`
    <section class="email-page">
      <div class="page-head">
        <div>
          <div class="title-row"><h2>Email</h2><p-tag value="Prototype" severity="secondary" /></div>
          <p>Shared White Corner mail workspace.</p>
        </div>
        <div class="top-actions">
          <p-button label="Mail" icon="pi pi-envelope" [outlined]="section()!=='Mail'" (onClick)="section.set('Mail')" />
          <p-button label="AI Agent" icon="pi pi-sparkles" [outlined]="section()!=='AI Agent'" (onClick)="section.set('AI Agent')" />
        </div>
      </div>

      @if(section()==='Mail'){
        <div class="mail-app">
          <aside class="mail-nav">
            <p-button label="Compose" icon="pi pi-pencil" styleClass="compose" [disabled]="true" />

            <div class="nav-label">Mailboxes</div>
            <button class="mailbox-option" [class.active]="activeMailbox()==='all'" (click)="activeMailbox.set('all')">
              <span class="mailbox-dot all"></span><span>All mail</span><small>{{mailboxCount('all')}}</small>
            </button>
            <button class="mailbox-option" [class.active]="activeMailbox()==='info'" (click)="activeMailbox.set('info')">
              <span class="mailbox-dot info"></span><span>info@whitecorner.com.au</span><small>{{mailboxCount('info')}}</small>
            </button>
            <button class="mailbox-option" [class.active]="activeMailbox()==='support'" (click)="activeMailbox.set('support')">
              <span class="mailbox-dot support"></span><span>support@whitecorner.com.au</span><small>{{mailboxCount('support')}}</small>
            </button>

            <div class="nav-label folders-label">Folders</div>
            @for(view of views; track view){
              <button class="folder-option" [class.active]="activeView()===view" (click)="activeView.set(view)">
                <i [class]="folderIcon(view)"></i><span>{{view}}</span><small>{{countFor(view)}}</small>
              </button>
            }

            <div class="mail-status"><span></span><div><b>Mail not connected</b><small>UI prototype only</small></div></div>
          </aside>

          <section class="message-list">
            <div class="list-toolbar">
              <div><b>{{activeView()}}</b><span>{{visibleRows().length}} messages</span></div>
              <div class="search"><i class="pi pi-search"></i><input pInputText placeholder="Search mail" [value]="query()" (input)="query.set($any($event.target).value)" /></div>
            </div>

            <div class="mail-list-scroll">
              @for(mail of visibleRows(); track mail.id){
                <button class="mail-card" [class.selected]="selected()?.id===mail.id" [class.unread]="mail.unread" (click)="selected.set(mail)">
                  <div class="avatar">{{mail.initials}}</div>
                  <div class="mail-copy">
                    <div class="mail-from"><b>{{mail.correspondent}}</b><span>{{mail.time}}</span></div>
                    <div class="mail-subject">{{mail.subject}}</div>
                    <div class="mail-preview">{{mail.preview}}</div>
                    <div class="mail-meta">
                      <span class="account-chip">{{mailboxAddress(mail.mailbox)}}</span>
                      @if(mail.linked_order){<span class="order-chip">Order #{{mail.linked_order}}</span>}
                      @if(mail.needs_reply){<span class="reply-chip">Needs reply</span>}
                    </div>
                  </div>
                </button>
              } @empty {
                <div class="empty-list"><i class="pi pi-inbox"></i><b>No messages in this view</b><span>Choose another mailbox or folder.</span></div>
              }
            </div>
          </section>

          <section class="reading-pane">
            @if(selected(); as mail){
              <div class="reading-head">
                <div>
                  <div class="subject-row"><h3>{{mail.subject}}</h3>@if(mail.needs_reply){<p-tag value="Needs reply" severity="warn" />}</div>
                  <div class="thread-meta">{{mailboxAddress(mail.mailbox)}} · {{mail.received_at}}</div>
                </div>
                <div class="reading-actions">
                  <button title="Reply"><i class="pi pi-reply"></i></button>
                  <button title="More"><i class="pi pi-ellipsis-h"></i></button>
                </div>
              </div>

              <div class="message-thread">
                <div class="sender-row">
                  <div class="avatar large">{{mail.initials}}</div>
                  <div><b>{{mail.correspondent}}</b><span>{{mail.email}}</span></div>
                  <time>{{mail.time}}</time>
                </div>
                <div class="message-body">{{mail.body}}</div>
              </div>

              <div class="context-bar">
                <div><small>AI</small><p-tag [value]="mail.ai_state||'Not analysed'" [severity]="aiSeverity(mail.ai_state)" /></div>
                <div><small>Category</small><b>{{mail.intent||'Not analysed'}}</b></div>
                <div><small>Order</small><b>{{mail.linked_order ? '#'+mail.linked_order : 'Not matched'}}</b></div>
                <div><small>Confidence</small><b>{{mail.confidence==null?'—':confidenceLabel(mail.confidence)}}</b></div>
              </div>

              <div class="reply-box">
                <div class="reply-label"><i class="pi pi-reply"></i><b>Reply</b><span>from {{mailboxAddress(mail.mailbox)}}</span></div>
                <textarea [value]="mail.draft_reply||''" placeholder="Write a reply…" disabled></textarea>
                <div class="reply-actions"><span>Mailbox connection comes next.</span><p-button label="Send" icon="pi pi-send" [disabled]="true" /></div>
              </div>
            } @else {
              <div class="empty-reading"><div class="empty-mail-icon"><i class="pi pi-envelope"></i></div><b>Select an email</b><span>Choose a message from the list to read the conversation.</span></div>
            }
          </section>
        </div>
      } @else {
        <div class="agent-page">
          <div class="agent-summary"><div class="agent-icon">AI</div><div><div class="agent-title"><b>AI Email Agent policy</b><p-tag value="Review before send" severity="info" /></div><p>This tab describes how the agent analyses email and what it is allowed to do.</p></div></div>
          <section class="policy-section"><div class="policy-title">Decision flow</div><div class="flow-list">@for(step of decisionFlow; track $index){<div class="flow-step"><span class="step-no">{{$index+1}}</span><b>{{step}}</b></div>}</div></section>
          <section class="policy-section"><div class="policy-title">Data the agent may use</div><div class="source-grid">@for(source of dataSources; track source.title){<div><b>{{source.title}}</b><span>{{source.description}}</span></div>}</div></section>
          <section class="policy-section"><div class="policy-title">Intent rules</div><div class="policy-table-wrap"><table class="policy-table"><thead><tr><th>#</th><th>Category</th><th>Initial mode</th><th>Rule</th></tr></thead><tbody>@for(policy of intentPolicies; track policy.intent; let i=$index){<tr><td class="num">{{i+1}}</td><td><b>{{policy.intent}}</b></td><td><p-tag [value]="policy.mode" [severity]="policySeverity(policy.mode)" /></td><td>{{policy.rule}}</td></tr>}</tbody></table></div></section>
          <section class="policy-section two-col"><div><div class="policy-title">Confidence rules</div><div class="rule-list"><div><b>1. High confidence</b><span>Order/customer and facts are clearly matched. AI may prepare a complete draft.</span></div><div><b>2. Medium confidence</b><span>Prepare a draft but clearly flag what needs checking.</span></div><div><b>3. Low confidence</b><span>Do not guess. Send to Needs reply with a manual-review reason.</span></div></div></div><div><div class="policy-title">Never auto-send</div><div class="guardrails">@for(rule of guardrails; track rule; let i=$index){<span>{{i+1}}. {{rule}}</span>}</div></div></section>
          <section class="policy-section"><div class="policy-title">Reply rules</div><div class="rule-list">@for(rule of replyRules; track rule.title; let i=$index){<div><b>{{i+1}}. {{rule.title}}</b><span>{{rule.description}}</span></div>}</div></section>
          <div class="policy-note"><b>Current operating mode:</b> AI may analyse and prepare drafts, but every outgoing message must be reviewed and sent by a user.</div>
        </div>
      }
    </section>
  `,
  styles:[`
    .email-page{min-width:0}.page-head{display:flex;align-items:flex-start;gap:16px;margin-bottom:14px}.page-head>div:first-child{min-width:0}.title-row{display:flex;align-items:center;gap:9px}.title-row h2{margin:0;font-size:24px;font-weight:600;color:#101828}.page-head p{margin:4px 0 0;font-size:12px;color:#758198}.top-actions{margin-left:auto;display:flex;gap:6px}
    .mail-app{height:calc(100vh - 175px);min-height:600px;display:grid;grid-template-columns:220px 360px minmax(0,1fr);background:#fff;border:1px solid #dfe3e8;border-radius:12px;overflow:hidden}.mail-nav{display:flex;flex-direction:column;padding:14px 10px;border-right:1px solid #e4e7ec;background:#f8fafc}.mail-nav ::ng-deep .compose{width:100%;justify-content:center;margin-bottom:18px}.nav-label{padding:0 10px 7px;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#98a2b3;font-weight:700}.folders-label{margin-top:18px}.mailbox-option,.folder-option{width:100%;border:0;background:transparent;display:grid;grid-template-columns:18px minmax(0,1fr) auto;gap:7px;align-items:center;text-align:left;padding:8px 10px;border-radius:7px;color:#344054;cursor:pointer;font:inherit;font-size:12px}.mailbox-option:hover,.folder-option:hover{background:#eef2f6}.mailbox-option.active,.folder-option.active{background:#e8eef7;color:#172033;font-weight:600}.mailbox-option span:nth-child(2),.folder-option span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mailbox-option small,.folder-option small{color:#98a2b3}.mailbox-dot{width:9px;height:9px;border-radius:50%;display:block}.mailbox-dot.all{background:#667085}.mailbox-dot.info{background:#2459d3}.mailbox-dot.support{background:#6b47c8}.folder-option i{font-size:13px;color:#667085}.mail-status{margin-top:auto;border-top:1px solid #e4e7ec;padding:14px 8px 2px;display:flex;align-items:flex-start;gap:8px}.mail-status>span{width:8px;height:8px;border-radius:50%;background:#f59e0b;margin-top:4px}.mail-status div{display:flex;flex-direction:column}.mail-status b{font-size:11px;font-weight:600;color:#475467}.mail-status small{font-size:10px;color:#98a2b3}
    .message-list{min-width:0;display:flex;flex-direction:column;border-right:1px solid #e4e7ec;background:#fff}.list-toolbar{min-height:67px;padding:11px 14px;border-bottom:1px solid #e4e7ec;display:flex;align-items:center;gap:10px}.list-toolbar>div:first-child{display:flex;flex-direction:column;min-width:92px}.list-toolbar b{font-size:15px;color:#172033}.list-toolbar span{font-size:10px;color:#98a2b3;margin-top:2px}.search{position:relative;margin-left:auto;min-width:0}.search i{position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:12px;color:#98a2b3}.search input{width:180px;height:34px;padding-left:30px;font-size:12px}.mail-list-scroll{overflow:auto;min-height:0}.mail-card{display:grid;grid-template-columns:36px minmax(0,1fr);gap:10px;width:100%;border:0;border-bottom:1px solid #edf0f3;background:#fff;padding:13px 14px;text-align:left;cursor:pointer;color:inherit;font:inherit}.mail-card:hover{background:#f8fafc}.mail-card.selected{background:#edf4ff;box-shadow:inset 3px 0 #3b82f6}.mail-card.unread .mail-from b,.mail-card.unread .mail-subject{font-weight:700}.avatar{width:34px;height:34px;border-radius:50%;background:#eef2f6;color:#475467;display:grid;place-items:center;font-size:11px;font-weight:700}.mail-copy{min-width:0}.mail-from{display:flex;gap:10px;align-items:center}.mail-from b{font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mail-from span{margin-left:auto;font-size:10px;color:#98a2b3;white-space:nowrap}.mail-subject{font-size:12px;font-weight:600;color:#344054;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mail-preview{font-size:11px;color:#758198;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mail-meta{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}.mail-meta span{font-size:9px;border-radius:999px;padding:3px 6px}.account-chip{background:#f2f4f7;color:#667085}.order-chip{background:#eef4ff;color:#3056a0}.reply-chip{background:#fff4e5;color:#a35b00}.empty-list{min-height:300px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:6px;color:#98a2b3;text-align:center;padding:20px}.empty-list i{font-size:28px}.empty-list b{font-size:12px;color:#475467}.empty-list span{font-size:11px}
    .reading-pane{min-width:0;overflow:auto;background:#fff}.reading-head{min-height:88px;padding:18px 22px;border-bottom:1px solid #e4e7ec;display:flex;align-items:flex-start;gap:16px}.reading-head>div:first-child{min-width:0}.subject-row{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.subject-row h3{margin:0;font-size:18px;font-weight:600;color:#172033}.thread-meta{margin-top:6px;font-size:11px;color:#98a2b3}.reading-actions{display:flex;gap:5px;margin-left:auto}.reading-actions button{width:32px;height:32px;border:1px solid #e4e7ec;background:#fff;border-radius:7px;cursor:pointer;color:#667085}.message-thread{padding:22px}.sender-row{display:flex;align-items:center;gap:10px}.avatar.large{width:38px;height:38px}.sender-row>div:nth-child(2){display:flex;flex-direction:column}.sender-row b{font-size:13px;color:#172033}.sender-row span{font-size:11px;color:#758198;margin-top:2px}.sender-row time{margin-left:auto;font-size:10px;color:#98a2b3}.message-body{white-space:pre-line;line-height:1.55;font-size:13px;color:#344054;margin:22px 0 8px;max-width:760px}.context-bar{margin:0 22px 20px;padding:12px 14px;border:1px solid #e4e7ec;border-radius:9px;background:#fafbfc;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.context-bar>div{display:flex;flex-direction:column;gap:4px;min-width:0}.context-bar small{text-transform:uppercase;font-size:9px;color:#98a2b3;font-weight:700}.context-bar b{font-size:11px;color:#475467;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.reply-box{margin:0 22px 24px;border:1px solid #dfe3e8;border-radius:10px;overflow:hidden}.reply-label{padding:10px 12px;display:flex;align-items:center;gap:7px;border-bottom:1px solid #edf0f3;font-size:11px}.reply-label span{color:#98a2b3}.reply-box textarea{display:block;width:100%;height:110px;border:0;resize:none;padding:12px;font:inherit;font-size:12px;outline:none;box-sizing:border-box}.reply-actions{display:flex;align-items:center;gap:10px;border-top:1px solid #edf0f3;padding:9px 10px}.reply-actions span{font-size:10px;color:#98a2b3}.reply-actions p-button{margin-left:auto}.empty-reading{height:100%;min-height:450px;display:flex;align-items:center;justify-content:center;flex-direction:column;text-align:center;gap:7px;color:#98a2b3}.empty-reading b{color:#475467;font-size:14px}.empty-reading span{font-size:11px}.empty-mail-icon{width:56px;height:56px;border-radius:50%;background:#f4f6f8;display:grid;place-items:center;font-size:22px}
    .agent-page{background:#fff;border:1px solid #e4e7ec;border-radius:12px;padding:18px}.agent-summary{display:grid;grid-template-columns:auto 1fr;gap:14px;border:1px solid #d8e3f2;background:#f8fbff;border-radius:12px;padding:15px}.agent-icon{width:44px;height:44px;border-radius:10px;background:#172033;color:#fff;display:grid;place-items:center;font-weight:800}.agent-title{display:flex;align-items:center;gap:9px}.agent-summary p{margin:6px 0 0;color:#667085;font-size:12px}.policy-section{margin-top:22px}.policy-title{font-size:11px;text-transform:uppercase;color:#758198;font-weight:700;margin-bottom:9px}.flow-list{display:flex;gap:8px;flex-wrap:wrap}.flow-step{display:flex;align-items:center;gap:7px;border:1px solid #dce4ee;background:#fff;border-radius:999px;padding:5px 10px 5px 5px}.step-no{width:24px;height:24px;border-radius:50%;background:#172033;color:#fff;display:grid;place-items:center;font-size:11px;font-weight:700}.flow-step b{font-size:11px}.source-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.source-grid>div,.rule-list>div{border:1px solid #e4e7ec;border-radius:9px;padding:11px;background:#fbfcfd;display:flex;flex-direction:column;gap:5px}.source-grid span,.rule-list span{font-size:12px;color:#667085;line-height:1.4}.policy-table-wrap{overflow:auto;border:1px solid #e4e7ec;border-radius:9px}.policy-table{width:100%;border-collapse:collapse;min-width:820px}.policy-table th{background:#fafbfc;text-align:left;text-transform:uppercase;font-size:10px;color:#758198;padding:10px}.policy-table td{padding:10px;border-top:1px solid #edf0f3;font-size:12px;vertical-align:top}.policy-table .num{width:34px;font-weight:700;color:#667085}.two-col{display:grid;grid-template-columns:1fr 1fr;gap:16px}.rule-list{display:grid;gap:7px}.guardrails{display:flex;gap:6px;flex-wrap:wrap;border:1px solid #e4e7ec;border-radius:9px;padding:12px;background:#fbfcfd}.guardrails span{font-size:11px;background:#fff4ed;color:#9a3412;border-radius:999px;padding:5px 8px}.policy-note{margin-top:22px;border:1px solid #d8e3f2;background:#f8fbff;border-radius:9px;padding:12px;font-size:12px;color:#475467}
    @media(max-width:1100px){.mail-app{grid-template-columns:190px 330px minmax(0,1fr)}.context-bar{grid-template-columns:1fr 1fr}.mailbox-option{font-size:11px}}
    @media(max-width:850px){.mail-app{grid-template-columns:175px minmax(280px,1fr)}.reading-pane{display:none}.source-grid{grid-template-columns:1fr 1fr}.two-col{grid-template-columns:1fr}}
    @media(max-width:620px){.page-head{flex-direction:column}.top-actions{margin-left:0}.mail-app{grid-template-columns:1fr;height:auto;min-height:650px}.mail-nav{display:none}.message-list{border-right:0}.source-grid{grid-template-columns:1fr}}
  `]
})
export class EmailComponent {
  readonly section=signal<EmailTab>('Mail');
  readonly views:MailView[]=['Inbox','Needs reply','Sent'];
  readonly activeView=signal<MailView>('Inbox');
  readonly activeMailbox=signal<MailboxId>('all');
  readonly query=signal('');
  readonly rows=signal<MailRow[]>([
    {id:'m1',mailbox:'info',correspondent:'Mia Carter',email:'mia@example.com',initials:'MC',subject:'Pickup time for order #10831',preview:'Hi, would Friday afternoon work for pickup?',body:'Hi White Corner,\n\nWould Friday afternoon work for pickup? We can come after 2 pm if that suits you.\n\nThank you,\nMia',received_at:'1 Sep 2026, 3:42 PM',time:'3:42 PM',direction:'Incoming',status:'Inbox',unread:true,ai_state:'Review',linked_order:'10831',intent:'Pickup',needs_reply:true,confidence:.96,draft_reply:'Hi Mia,\n\nThank you for your message. I’ll confirm the available pickup window for Friday afternoon and get back to you shortly.\n\nKind regards,\nWhite Corner'},
    {id:'m2',mailbox:'support',correspondent:'James Wilson',email:'james@example.com',initials:'JW',subject:'Question about delivery',preview:'Can you please confirm whether delivery includes packaging?',body:'Hi team,\n\nCan you please confirm whether delivery includes packaging, and roughly how long shipping to Sydney normally takes?\n\nThanks,\nJames',received_at:'1 Sep 2026, 2:18 PM',time:'2:18 PM',direction:'Incoming',status:'Inbox',ai_state:'Draft ready',linked_order:null,intent:'Delivery / shipping',needs_reply:true,confidence:.83,draft_reply:'Hi James,\n\nThank you for your enquiry. Packaging and delivery are arranged separately depending on the product and destination. Once we have the delivery postcode and product details, we can confirm the freight arrangement.\n\nKind regards,\nWhite Corner'},
    {id:'m3',mailbox:'info',correspondent:'Sophie Lee',email:'sophie@example.com',initials:'SL',subject:'Custom colour enquiry',preview:'Is it possible to paint the cart in Dulux Sage Green?',body:'Hello,\n\nI love the Classic Cart. Is it possible to have it painted in a Dulux Sage Green colour instead of white?\n\nSophie',received_at:'1 Sep 2026, 11:07 AM',time:'11:07 AM',direction:'Incoming',status:'Needs reply',unread:true,ai_state:'Review',linked_order:null,intent:'Customisation',needs_reply:true,confidence:.91,draft_reply:''},
    {id:'m4',mailbox:'support',correspondent:'Daniel Brown',email:'daniel@example.com',initials:'DB',subject:'Re: Order #10820',preview:'Thanks for confirming. That works perfectly.',body:'Thanks for confirming. That works perfectly for us.\n\nRegards,\nDaniel',received_at:'31 Aug 2026, 4:26 PM',time:'Yesterday',direction:'Incoming',status:'Inbox',ai_state:'Not analysed',linked_order:'10820',intent:'Order question',needs_reply:false,confidence:.98,draft_reply:''},
    {id:'m5',mailbox:'info',correspondent:'Katrina Lott',email:'katrina.lott22@gmail.com',initials:'KL',subject:'Order #10816 confirmation',preview:'Your order details have been confirmed.',body:'Hi Katrina,\n\nThank you for your order. Your order details have been confirmed and your order is now in our production queue.\n\nKind regards,\nWhite Corner',received_at:'30 Aug 2026, 9:15 AM',time:'30 Aug',direction:'Outgoing',status:'Sent',ai_state:'Not analysed',linked_order:'10816',intent:'Order question',needs_reply:false,confidence:null,draft_reply:''}
  ]);
  readonly selected=signal<MailRow|null>(this.rows()[0]);

  readonly decisionFlow=['Read full thread','Identify customer','Match order','Classify intent','Collect facts','Assess risk','Draft / escalate'];
  readonly dataSources=[{title:'Orders',description:'Order number, customer, items, options, notes, payment and delivery method.'},{title:'Production',description:'Current production units and real production status.'},{title:'Fulfilment',description:'Pickup readiness, shipping preparation and booked shipping.'},{title:'Pickup calendar',description:'Available pickup windows and closed dates once connected.'},{title:'Shipping data',description:'Packages, dimensions, weights and later tracking.'},{title:'Business rules',description:'Lead times, claims, cancellations, payments and approved answers.'}];
  readonly intentPolicies:IntentPolicy[]=[{intent:'Order question',mode:'Draft + review',rule:'Answer using the actual linked order. Never invent status, dates or inclusions.'},{intent:'Customisation',mode:'Manual only',rule:'AI may summarise and draft, but custom design, feasibility and price require review.'},{intent:'Product question',mode:'Auto later',rule:'Factual catalogue questions may become automatic after approved product knowledge is connected.'},{intent:'Production / lead time',mode:'Auto later',rule:'Use current lead-time rules and actual order status. Do not promise unconfirmed completion dates.'},{intent:'Pickup',mode:'Auto later',rule:'Once calendar integration exists, factual pickup availability may be answered automatically.'},{intent:'Delivery / shipping',mode:'Draft + review',rule:'Use shipment/order data. Tracking can become automatic later; unusual freight remains reviewed.'},{intent:'Payment / invoice',mode:'Draft + review',rule:'Provide factual payment/invoice information only. Changes to money or payment terms require review.'},{intent:'Order change',mode:'Manual only',rule:'Any requested change may affect production, timing or price and must be approved.'},{intent:'Claim / damage',mode:'Manual only',rule:'Never auto-send. Surface timing, evidence and order details for human review.'},{intent:'Cancellation / refund',mode:'Manual only',rule:'Never auto-send. Consequences must be reviewed before any commitment.'},{intent:'General enquiry',mode:'Draft + review',rule:'Prepare a concise draft. Auto handling may be enabled later for approved low-risk FAQs.'}];
  readonly guardrails=['Claims / damage','Refunds / cancellations','Paid-order changes','Custom pricing or feasibility','Financial consequences','Legal / policy disputes','Low-confidence order match','Conflicting information'];
  readonly replyRules=[{title:'Use facts from Hub',description:'Order, production, fulfilment and policy data override assumptions.'},{title:'Do not make promises',description:'Never promise dates, discounts, refunds, custom work or freight outcomes unless data supports it.'},{title:'Read the thread',description:'Analyse the whole conversation, not only the latest message.'},{title:'Keep White Corner tone',description:'Professional, warm, concise and practical.'},{title:'Escalate uncertainty',description:'When customer, order, intent or answer is uncertain, move the thread to Needs reply.'}];

  readonly visibleRows=computed(()=>{
    const view=this.activeView();
    const box=this.activeMailbox();
    const q=this.query().trim().toLowerCase();
    return this.rows().filter(row=>row.status===view&&(box==='all'||row.mailbox===box)&&(!q||`${row.correspondent} ${row.email} ${row.subject} ${row.preview} ${row.linked_order||''}`.toLowerCase().includes(q)));
  });

  countFor(view:MailView){const box=this.activeMailbox();return this.rows().filter(row=>row.status===view&&(box==='all'||row.mailbox===box)).length;}
  mailboxCount(box:MailboxId){return this.rows().filter(row=>(box==='all'||row.mailbox===box)&&row.status!=='Sent').length;}
  mailboxAddress(box:'info'|'support'){return box==='info'?'info@whitecorner.com.au':'support@whitecorner.com.au';}
  folderIcon(view:MailView){if(view==='Inbox')return'pi pi-inbox';if(view==='Needs reply')return'pi pi-comment';return'pi pi-send';}
  confidenceLabel(value:number){return `${Math.round(value*100)}%`;}
  aiSeverity(state?:AiState):'success'|'info'|'warn'|'secondary'{if(state==='Auto handled')return'success';if(state==='Draft ready')return'info';if(state==='Review')return'warn';return'secondary';}
  policySeverity(mode:PolicyMode):'success'|'info'|'warn'{if(mode==='Auto later')return'success';if(mode==='Draft + review')return'info';return'warn';}
}
