import { Component, HostListener, computed, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { EmailService, GmailMessageRow } from '../../core/services/email.service';

type EmailTab='Mail'|'AI Agent';
type MailView='Inbox'|'Needs reply'|'Sent';
type AiState='Not analysed'|'Review'|'Draft ready'|'Auto handled';
type MailIntent='Order question'|'Customisation'|'Product question'|'Production / lead time'|'Pickup'|'Delivery / shipping'|'Payment / invoice'|'Order change'|'Claim / damage'|'Cancellation / refund'|'General enquiry';
type PolicyMode='Auto later'|'Draft + review'|'Manual only';
type MailboxId='all'|'info'|'support';

interface MailRow{id:string;mailbox:'info'|'support';correspondent:string;email:string;initials:string;subject:string;preview:string;body:string;received_at:string;time:string;direction:'Incoming'|'Outgoing';status:'Inbox'|'Sent';unread?:boolean;starred?:boolean;ai_state?:AiState;linked_order?:string|null;intent?:MailIntent|null;needs_reply?:boolean|null;confidence?:number|null;draft_reply?:string|null;}
interface IntentPolicy{intent:MailIntent;mode:PolicyMode;rule:string;}

@Component({
  selector:'app-email',
  standalone:true,
  imports:[ButtonModule,InputTextModule,TagModule],
  template:`
  <section class="email-page">
    <div class="page-head">
      <div><h2>Email</h2><p>Shared White Corner mail workspace.</p></div>
      <div class="top-actions"><p-button label="Mail" icon="pi pi-envelope" [outlined]="section()!=='Mail'" (onClick)="section.set('Mail')"/>@if(section()==='Mail'){<div class="top-search"><i class="pi pi-search"></i><input pInputText placeholder="Search mail" [value]="query()" (input)="query.set($any($event.target).value);ensureSelection()"/></div>}<p-button label="AI Agent" icon="pi pi-sparkles" [outlined]="section()!=='AI Agent'" (onClick)="section.set('AI Agent')"/></div>
    </div>

    @if(section()==='Mail'){
      <div class="mail-app">
        <aside class="mail-nav">
          <p-button label="Compose" icon="pi pi-pencil" styleClass="compose" [disabled]="true"/>
          <div class="nav-label">Mailboxes</div>
          <button class="mailbox-option" [class.active]="activeMailbox()==='all'" (click)="setMailbox('all')"><span class="mailbox-dot all"></span><span>All mail</span><small>{{countsReady()?mailboxCount('all'):'—'}}</small></button>
          <button class="mailbox-option" [class.active]="activeMailbox()==='info'" (click)="setMailbox('info')"><span class="mailbox-dot info"></span><span>info@whitecorner.com.au</span><small>{{countsReady()?mailboxCount('info'):'—'}}</small></button>
          <button class="mailbox-option" [class.active]="activeMailbox()==='support'" (click)="setMailbox('support')"><span class="mailbox-dot support"></span><span>support@whitecorner.com.au</span><small>{{countsReady()?mailboxCount('support'):'—'}}</small></button>
          <div class="nav-label folders-label">Folders</div>
          @for(view of views;track view){<button class="folder-option" [class.active]="activeView()===view" (click)="setView(view)"><i [class]="folderIcon(view)"></i><span>{{view}}</span><small>{{mailReady()?countFor(view):'—'}}</small></button>}
          <div class="mail-status live"><span></span><div><b>Gmail connected</b><small>Live Inbox / Sent</small></div></div>
        </aside>

        <section class="message-list">
          <div class="list-toolbar"><div class="list-title"><b>{{activeView()}}</b><span>@if(mailReady()){{{activeMailboxLabel()}} · {{visibleRows().length}} messages}@else{Loading mail…}</span></div></div>
          <div class="mail-list-scroll">
            @if(!mailReady()){<div class="mail-loading"><i class="pi pi-spin pi-spinner"></i><span>Loading mail…</span></div>} @else {
              @for(mail of visibleRows();track mail.id){<button class="mail-card" [class.selected]="selected()?.id===mail.id" [class.unread]="mail.unread" (click)="openMail(mail)"><div class="avatar">{{mail.initials}}</div><div class="mail-copy"><div class="mail-from"><b>{{mail.correspondent}}</b><span>{{mail.time}}</span></div><div class="mail-subject">{{mail.subject}}</div><div class="mail-preview">{{mail.preview}}</div><div class="mail-meta"><span class="account-chip">{{mailboxShort(mail.mailbox)}}</span>@if(mail.linked_order){<span class="order-chip">#{{mail.linked_order}}</span>}@if(mail.needs_reply){<span class="reply-chip">Needs reply</span>}</div></div></button>} @empty {<div class="empty-list"><i class="pi pi-inbox"></i><b>No messages in this view</b><span>Choose another mailbox or folder.</span></div>}
            }
          </div>
        </section>

        <section class="reading-placeholder"><div class="empty-reading"><div class="empty-mail-icon"><i class="pi pi-envelope"></i></div><b>Select an email</b><span>Open a message to read it full screen.</span></div></section>
      </div>

      @if(selected();as mail){
        <section class="mail-reader">
          <div class="reader-toolbar">
            <button class="back-button" title="Back to inbox" (click)="closeMail()"><i class="pi pi-arrow-left"></i></button>
            <div class="reader-toolbar-spacer"></div>
            <button class="reader-icon" title="Reply" (click)="startReply(mail)"><i class="pi pi-reply"></i></button>
            <button class="reader-icon" title="Forward" (click)="startForward(mail)"><i class="pi pi-forward"></i></button>
          </div>
          <div class="reader-scroll">
            <div class="reader-content">
              <div class="reader-subject"><h2>{{mail.subject}}</h2>@if(mail.needs_reply){<p-tag value="Needs reply" severity="warn"/>}</div>
              <div class="reader-sender">
                <div class="avatar reader-avatar">{{mail.initials}}</div>
                <div class="reader-sender-copy"><b>{{mail.correspondent}}</b><span>{{mail.email}}</span></div>
                <time>{{mail.time}}</time>
              </div>
              <article class="reader-body">{{mail.body || mail.preview}}</article>
              <div class="reader-ai">
                <div><small>AI</small><p-tag [value]="mail.ai_state||'Not analysed'" [severity]="aiSeverity(mail.ai_state)"/></div>
                <div><small>Category</small><b>{{mail.intent||'Not analysed'}}</b></div>
                <div><small>Order</small><b>{{mail.linked_order?'#'+mail.linked_order:'—'}}</b></div>
                <div><small>Confidence</small><b>{{mail.confidence==null?'—':confidenceLabel(mail.confidence)}}</b></div>
              </div>
              @if(replyMode()==='none'){
                <div class="gmail-actions">
                  <button (click)="startReply(mail)"><i class="pi pi-reply"></i><span>Reply</span></button>
                  <button class="disabled-action" disabled title="Requires Gmail modify / thread metadata"><i class="pi pi-reply"></i><span>Reply all</span></button>
                  <button (click)="startForward(mail)"><i class="pi pi-forward"></i><span>Forward</span></button>
                </div>
              } @else {
                <div class="reader-reply active">
                  <div class="reply-label"><i [class]="replyMode()==='forward'?'pi pi-forward':'pi pi-reply'"></i><b>{{replyMode()==='forward'?'Forward':'Reply'}}</b><span>from {{mailboxAddress(mail.mailbox)}}</span><button class="close-compose" (click)="cancelReply()">×</button></div>
                  @if(replyMode()==='forward'){<div class="forward-to"><span>To</span><input pInputText [value]="forwardTo()" (input)="forwardTo.set($any($event.target).value)" placeholder="recipient@example.com"/></div>}
                  <textarea [value]="replyText()" (input)="replyText.set($any($event.target).value)" [placeholder]="replyMode()==='forward'?'Add a message…':'Write a reply…'" [disabled]="sending()"></textarea>
                  <div class="reply-actions">
                    @if(sendStatus()){<span [class.send-error]="sendStatus().startsWith('Error')">{{sendStatus()}}</span>} @else {<span>{{replyMode()==='forward'?'Forward this message':'Reply to '+mail.email}}</span>}
                    <p-button label="Send" icon="pi pi-send" (onClick)="sendCurrent(mail)" [disabled]="sending() || !canSend(mail)"/>
                  </div>
                </div>
              }
            </div>
          </div>
        </section>
      }
    } @else {
      <div class="agent-page">
        <div class="agent-hero">
          <div class="hero-left"><div class="agent-icon">AI</div><div><div class="agent-title"><h3>Email Agent</h3><p-tag value="Draft + review" severity="info"/></div><p>Reads incoming email, finds the right business context and prepares a reply for review.</p></div></div>
          <div class="hero-status"><span class="state-dot"></span><div><small>Runtime</small><b>Not connected yet</b></div></div>
        </div>

        <section class="setup-section">
          <div class="section-head"><div><div class="policy-title">Setup status</div><p>Everything required before the agent can work on real email.</p></div></div>
          <div class="setup-grid">
            <div class="setup-row ready"><i class="pi pi-check"></i><div><b>Hub business data</b><span>Orders, production and fulfilment are available.</span></div><strong>Ready</strong></div>
            <div class="setup-row ready"><i class="pi pi-check"></i><div><b>Knowledge & policy</b><span>Business rules and response guardrails are prepared.</span></div><strong>Ready</strong></div>
            <div class="setup-row pending"><i class="pi pi-clock"></i><div><b>Mailbox connection</b><span>info@ and support@ still need Gmail OAuth.</span></div><strong>Pending</strong></div>
            <div class="setup-row pending"><i class="pi pi-clock"></i><div><b>AI runtime</b><span>Analysis and draft generation are not connected yet.</span></div><strong>Pending</strong></div>
          </div>
        </section>

        <section class="policy-section">
          <div class="section-head"><div><div class="policy-title">Operating policy</div><p>Three handling levels keep the agent predictable.</p></div></div>
          <div class="mode-grid">
            <div class="mode-card manual"><span>1</span><div><b>Manual only</b><p>AI may summarise, but a person decides the response.</p></div><small>{{modeCount('Manual only')}} categories</small></div>
            <div class="mode-card review"><span>2</span><div><b>Draft + review</b><p>AI prepares the reply. A person checks and sends it.</p></div><small>{{modeCount('Draft + review')}} categories</small></div>
            <div class="mode-card later"><span>3</span><div><b>Auto later</b><p>Low-risk factual replies may become automatic after testing.</p></div><small>{{modeCount('Auto later')}} categories</small></div>
          </div>
        </section>

        <section class="policy-section">
          <div class="section-head"><div><div class="policy-title">Decision flow</div><p>Every incoming thread follows the same path.</p></div></div>
          <div class="workflow-grid">@for(step of decisionFlow;track $index){<div class="workflow-step"><span>{{$index+1}}</span><b>{{step}}</b></div>}</div>
        </section>

        <section class="policy-section capability-grid">
          <div class="capability-card good"><div class="cap-title"><i class="pi pi-sparkles"></i><b>Agent responsibilities</b></div><div class="cap-list"><span>Read the full thread</span><span>Identify customer</span><span>Match order</span><span>Classify intent</span><span>Collect Hub facts</span><span>Draft a reply</span><span>Flag uncertainty</span></div></div>
          <div class="capability-card protect"><div class="cap-title"><i class="pi pi-shield"></i><b>Escalation triggers</b></div><div class="cap-list">@for(rule of guardrails;track rule){<span>{{rule}}</span>}</div></div>
        </section>

        <section class="policy-section">
          <div class="section-head"><div><div class="policy-title">Intent policy</div><p>How each type of customer enquiry should be handled.</p></div></div>
          <div class="intent-list">@for(policy of intentPolicies;track policy.intent;let i=$index){<div class="intent-row"><span class="intent-no">{{i+1}}</span><div class="intent-name"><b>{{policy.intent}}</b><span>{{policy.rule}}</span></div><p-tag [value]="policy.mode" [severity]="policySeverity(policy.mode)"/></div>}</div>
        </section>

        <section class="policy-section two-col">
          <div><div class="policy-title">Confidence rules</div><div class="rule-list"><div><b>High confidence</b><span>Customer, order and facts are clearly matched. Prepare a complete draft.</span></div><div><b>Medium confidence</b><span>Prepare a draft and flag exactly what needs checking.</span></div><div><b>Low confidence</b><span>Do not guess. Route the thread to Needs reply.</span></div></div></div>
          <div><div class="policy-title">Data priority</div><div class="source-list">@for(source of dataSources;track source.title){<div><i class="pi pi-database"></i><div><b>{{source.title}}</b><span>{{source.description}}</span></div></div>}</div></div>
        </section>

        <div class="policy-note"><i class="pi pi-lock"></i><div><b>Auto-send remains locked in v1</b><span>No outgoing customer email can be sent automatically until the workflow has been tested on real mail and explicitly enabled later.</span></div></div>
      </div>
    }
  </section>`,
  styles:[`
  .email-page{min-width:0;height:100%;min-height:0;display:flex;flex-direction:column;overflow:hidden}.page-head{display:flex;align-items:center;gap:10px;margin:0 0 5px;flex:0 0 32px}.page-head>div:first-child{min-width:0}.page-head h2{margin:0;font-size:18px;font-weight:600;color:#101828;line-height:1}.page-head p{display:none}.top-actions{margin-left:auto;display:flex;align-items:center;gap:6px}.top-actions ::ng-deep .p-button{padding:.35rem .65rem;font-size:11px}.top-search{position:relative;width:min(360px,32vw)}.top-search i{position:absolute;left:11px;top:50%;transform:translateY(-50%);font-size:11px;color:#98a2b3;pointer-events:none}.top-search input{width:100%;height:32px;padding-left:31px;border-radius:18px;font-size:11px;background:#f7f8fa}
  .mail-app{flex:1;min-height:0;height:100%;max-height:100%;display:grid;grid-template-columns:176px minmax(0,1fr);grid-template-rows:minmax(0,1fr);background:#fff;border:1px solid #dfe3e8;border-radius:11px;overflow:hidden}.mail-nav{display:flex;flex-direction:column;padding:12px 8px;border-right:1px solid #e4e7ec;background:#f8fafc}.mail-nav ::ng-deep .compose{width:100%;justify-content:center;margin-bottom:15px}.nav-label{padding:0 8px 6px;font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#98a2b3;font-weight:700}.folders-label{margin-top:14px}.mailbox-option,.folder-option{width:100%;border:0;background:transparent;display:grid;grid-template-columns:16px minmax(0,1fr) auto;gap:6px;align-items:center;text-align:left;padding:7px 8px;border-radius:7px;color:#344054;cursor:pointer;font:inherit;font-size:11px}.mailbox-option:hover,.folder-option:hover{background:#eef2f6}.mailbox-option.active,.folder-option.active{background:#e8eef7;color:#172033;font-weight:600}.mailbox-option span:nth-child(2),.folder-option span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mailbox-option small,.folder-option small{color:#98a2b3;font-size:10px}.mailbox-dot{width:8px;height:8px;border-radius:50%;display:block}.mailbox-dot.all{background:#667085}.mailbox-dot.info{background:#2459d3}.mailbox-dot.support{background:#6b47c8}.folder-option i{font-size:12px;color:#667085}.mail-status{margin-top:auto;border-top:1px solid #e4e7ec;padding:12px 7px 1px;display:flex;align-items:flex-start;gap:7px}.mail-status>span{width:7px;height:7px;border-radius:50%;background:#12b76a;margin-top:4px}.mail-status div{display:flex;flex-direction:column}.mail-status b{font-size:10px;font-weight:600;color:#475467}.mail-status small{font-size:9px;color:#98a2b3}
  .message-list{min-width:0;min-height:0;height:100%;max-height:100%;display:flex;flex-direction:column;overflow:hidden;border-right:1px solid #e4e7ec;background:#fff}.list-toolbar{height:52px;min-height:52px;padding:7px 10px;border-bottom:1px solid #e4e7ec;display:flex;align-items:center;gap:10px}.list-title{display:flex;flex-direction:column;min-width:120px}.list-title b{font-size:14px;color:#172033}.list-title span{font-size:9px;color:#98a2b3;margin-top:2px}.search{position:relative;margin-left:auto;min-width:0}.search i{position:absolute;left:9px;top:50%;transform:translateY(-50%);font-size:11px;color:#98a2b3}.search input{width:190px;height:32px;padding-left:28px;font-size:11px}.mail-list-scroll{overflow-y:auto!important;overflow-x:hidden;min-height:0;height:0;flex:1 1 auto;overscroll-behavior:contain;scrollbar-gutter:stable}.mail-card{display:grid;grid-template-columns:32px minmax(0,1fr);gap:9px;width:100%;border:0;border-bottom:1px solid #edf0f3;background:#fff;padding:11px 12px;text-align:left;cursor:pointer;color:inherit;font:inherit}.mail-card:hover{background:#f8fafc}.mail-card.selected{background:#edf4ff;box-shadow:inset 3px 0 #3b82f6}.mail-card.unread .mail-from b,.mail-card.unread .mail-subject{font-weight:700}.avatar{width:31px;height:31px;border-radius:50%;background:#eef2f6;color:#475467;display:grid;place-items:center;font-size:10px;font-weight:700}.mail-copy{min-width:0}.mail-from{display:flex;gap:9px;align-items:center}.mail-from b{font-size:11px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mail-from span{margin-left:auto;font-size:9px;color:#98a2b3;white-space:nowrap}.mail-subject{font-size:11px;font-weight:600;color:#344054;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mail-preview{font-size:10px;color:#758198;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mail-meta{display:flex;gap:4px;flex-wrap:wrap;margin-top:6px}.mail-meta span{font-size:8px;border-radius:999px;padding:2px 5px}.account-chip{background:#f2f4f7;color:#667085}.order-chip{background:#eef4ff;color:#3056a0}.reply-chip{background:#fff4e5;color:#a35b00}.mail-loading{height:100%;min-height:220px;display:flex;align-items:center;justify-content:center;gap:8px;color:#98a2b3;font-size:11px}.mail-loading i{font-size:14px}.empty-list{min-height:300px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:6px;color:#98a2b3;text-align:center;padding:20px}.empty-list i{font-size:26px}.empty-list b{font-size:12px;color:#475467}.empty-list span{font-size:10px}
  .reading-placeholder{display:none}.reading-head{min-height:78px;padding:15px 20px;border-bottom:1px solid #e4e7ec;display:flex;align-items:flex-start;gap:14px}.reading-head>div:first-child{min-width:0}.subject-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.subject-row h3{margin:0;font-size:17px;font-weight:600;color:#172033}.thread-meta{margin-top:5px;font-size:10px;color:#98a2b3}.reading-actions{display:flex;gap:5px;margin-left:auto}.reading-actions button{width:30px;height:30px;border:1px solid #e4e7ec;background:#fff;border-radius:7px;cursor:pointer;color:#667085}.message-thread{padding:19px 20px}.sender-row{display:flex;align-items:center;gap:9px}.avatar.large{width:36px;height:36px}.sender-row>div:nth-child(2){display:flex;flex-direction:column}.sender-row b{font-size:12px;color:#172033}.sender-row span{font-size:10px;color:#758198;margin-top:2px}.sender-row time{margin-left:auto;font-size:9px;color:#98a2b3}.message-body{white-space:pre-line;line-height:1.55;font-size:12px;color:#344054;margin:19px 0 4px;max-width:760px}.context-bar{margin:0 20px 16px;padding:9px 11px;border:1px solid #e8ebef;border-radius:8px;background:#fbfcfd;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.context-bar>div{display:flex;flex-direction:column;gap:3px;min-width:0}.context-bar small{text-transform:uppercase;font-size:8px;color:#98a2b3;font-weight:700}.context-bar b{font-size:10px;color:#475467;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.reply-box{margin:0 20px 22px;border:1px solid #dfe3e8;border-radius:9px;overflow:hidden}.reply-label{padding:8px 10px;display:flex;align-items:center;gap:6px;border-bottom:1px solid #edf0f3;font-size:10px}.reply-label span{color:#98a2b3}.reply-box textarea{display:block;width:100%;height:92px;border:0;resize:none;padding:10px;font:inherit;font-size:11px;outline:none;box-sizing:border-box}.reply-actions{display:flex;align-items:center;gap:9px;border-top:1px solid #edf0f3;padding:7px 9px}.reply-actions span{font-size:9px;color:#98a2b3}.reply-actions p-button{margin-left:auto}.empty-reading{height:100%;min-height:450px;display:flex;align-items:center;justify-content:center;flex-direction:column;text-align:center;gap:7px;color:#98a2b3}.empty-reading b{color:#475467;font-size:14px}.empty-reading span{font-size:11px}.empty-mail-icon{width:52px;height:52px;border-radius:50%;background:#f4f6f8;display:grid;place-items:center;font-size:20px}
  .mail-reader{position:fixed;z-index:1200;top:0;left:205px;right:0;bottom:0;background:#fff;display:flex;flex-direction:column}.reader-toolbar{height:54px;flex:0 0 54px;border-bottom:1px solid #e4e7ec;display:flex;align-items:center;padding:0 22px;gap:7px;background:#fff}.back-button,.reader-icon{width:36px;height:36px;border:0;background:transparent;border-radius:50%;display:grid;place-items:center;color:#475467;cursor:pointer}.back-button:hover,.reader-icon:hover{background:#f2f4f7}.back-button i{font-size:16px}.reader-toolbar-spacer{flex:1}.reader-scroll{overflow:auto;min-height:0;flex:1}.reader-content{max-width:1120px;margin:0 auto;padding:24px 38px 48px}.reader-subject{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.reader-subject h2{font-size:23px;font-weight:500;color:#202124;margin:0}.reader-mailbox{display:none}.reader-sender{display:flex;align-items:center;gap:12px;margin-top:22px}.reader-avatar{width:42px;height:42px;font-size:12px}.reader-sender-copy{display:flex;flex-direction:column;gap:3px}.reader-sender-copy b{font-size:13px;color:#202124}.reader-sender-copy span{font-size:11px;color:#667085}.reader-sender time{margin-left:auto;color:#98a2b3;font-size:10px}.reader-body{white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px;line-height:1.65;color:#202124;margin-top:24px;min-height:48px;max-width:920px}.reader-ai{margin-top:26px;padding:12px 14px;border:1px solid #e4e7ec;border-radius:10px;background:#fbfcfd;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.reader-ai>div{display:flex;flex-direction:column;gap:4px;min-width:0}.reader-ai small{text-transform:uppercase;font-size:8px;color:#98a2b3;font-weight:700}.reader-ai b{font-size:10px;color:#475467}.reader-reply{margin-top:22px;border:1px solid #dfe3e8;border-radius:10px;overflow:hidden}.reader-reply textarea{display:block;width:100%;min-height:130px;border:0;resize:vertical;padding:14px;font:inherit;font-size:12px;outline:none;box-sizing:border-box}.reader-reply .reply-actions{padding:9px 12px}@media(max-width:880px){.mail-reader{left:0;top:0}.reader-content{padding:24px 20px}.reader-ai{grid-template-columns:1fr 1fr}}
  .gmail-actions{display:flex;gap:9px;margin-top:20px;flex-wrap:wrap}.gmail-actions button{display:flex;align-items:center;gap:8px;height:38px;padding:0 16px;border:1px solid #c9cdd3;border-radius:19px;background:#fff;color:#3c4043;font:inherit;font-size:12px;cursor:pointer}.gmail-actions button:hover:not(:disabled){background:#f7f8fa}.gmail-actions .disabled-action{opacity:.45;cursor:not-allowed}.reader-reply.active{margin-top:22px}.reader-reply.active textarea{display:block;width:100%;min-height:150px;border:0;resize:vertical;padding:14px;font:inherit;font-size:12px;outline:none;box-sizing:border-box}.close-compose{margin-left:auto;border:0;background:transparent;font-size:18px;line-height:1;color:#667085;cursor:pointer}.forward-to{display:flex;align-items:center;gap:10px;border-bottom:1px solid #edf0f3;padding:8px 12px}.forward-to span{font-size:10px;color:#667085}.forward-to input{flex:1;height:30px;font-size:11px;border:0;box-shadow:none}.send-error{color:#b42318!important}
  .agent-page{background:#fff;border:1px solid #e4e7ec;border-radius:12px;padding:18px}.agent-hero{display:flex;align-items:center;gap:18px;border:1px solid #dce5f2;background:#f8fbff;border-radius:12px;padding:16px 18px}.hero-left{display:flex;align-items:center;gap:13px;min-width:0}.agent-icon{width:44px;height:44px;border-radius:10px;background:#172033;color:#fff;display:grid;place-items:center;font-weight:800;flex:0 0 auto}.agent-title{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.agent-title h3{margin:0;font-size:18px;color:#101828}.agent-hero p{margin:5px 0 0;color:#667085;font-size:12px;line-height:1.4}.hero-status{margin-left:auto;display:flex;align-items:center;gap:9px;border-left:1px solid #dce5f2;padding-left:18px}.state-dot{width:9px;height:9px;border-radius:50%;background:#f59e0b}.hero-status div{display:flex;flex-direction:column}.hero-status small{font-size:9px;text-transform:uppercase;color:#98a2b3;font-weight:700}.hero-status b{font-size:11px;color:#475467;margin-top:2px}.setup-section,.policy-section{margin-top:20px}.section-head{display:flex;align-items:flex-end;gap:14px;margin-bottom:9px}.section-head p{margin:3px 0 0;color:#98a2b3;font-size:10px}.policy-title{font-size:10px;text-transform:uppercase;color:#758198;font-weight:700}.setup-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.setup-row{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:9px;align-items:center;border:1px solid #e4e7ec;border-radius:9px;padding:10px 11px}.setup-row>i{width:25px;height:25px;border-radius:50%;display:grid;place-items:center;font-size:10px}.setup-row.ready>i{background:#ecfdf3;color:#067647}.setup-row.pending>i{background:#fff4e5;color:#b54708}.setup-row div{display:flex;flex-direction:column}.setup-row b{font-size:11px;color:#344054}.setup-row span{font-size:9px;color:#758198;margin-top:2px}.setup-row strong{font-size:9px;font-weight:700}.setup-row.ready strong{color:#067647}.setup-row.pending strong{color:#b54708}.mode-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.mode-card{border:1px solid #e4e7ec;border-radius:10px;padding:12px;display:grid;grid-template-columns:26px minmax(0,1fr);gap:9px;position:relative}.mode-card>span{width:24px;height:24px;border-radius:7px;display:grid;place-items:center;font-size:9px;font-weight:700}.mode-card b{font-size:11px;color:#344054}.mode-card p{font-size:9px;color:#758198;margin:3px 0 0;line-height:1.35}.mode-card small{grid-column:2;font-size:9px;font-weight:700}.mode-card.manual>span{background:#fff4e5;color:#b54708}.mode-card.review>span{background:#eff8ff;color:#175cd3}.mode-card.later>span{background:#ecfdf3;color:#067647}.mode-card.manual small{color:#b54708}.mode-card.review small{color:#175cd3}.mode-card.later small{color:#067647}.workflow-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}.workflow-step{border:1px solid #e4e7ec;border-radius:9px;padding:9px 8px;background:#fbfcfd;display:flex;align-items:center;gap:6px}.workflow-step span{width:21px;height:21px;border-radius:50%;background:#172033;color:#fff;display:grid;place-items:center;font-size:9px;font-weight:700;flex:0 0 auto}.workflow-step b{font-size:9px;color:#475467;line-height:1.25}.capability-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.capability-card{border:1px solid #e4e7ec;border-radius:10px;padding:13px 14px}.capability-card.good{background:#f8fcfa;border-color:#d8eee3}.capability-card.protect{background:#fffaf5;border-color:#f3e2cc}.cap-title{display:flex;align-items:center;gap:8px;margin-bottom:10px}.cap-title b{font-size:12px;color:#344054}.cap-list{display:flex;gap:6px;flex-wrap:wrap}.cap-list span{font-size:10px;border:1px solid rgba(0,0,0,.06);background:#fff;border-radius:999px;padding:4px 7px;color:#475467}.intent-list{border:1px solid #e4e7ec;border-radius:9px;overflow:hidden}.intent-row{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:9px;align-items:center;padding:9px 11px;border-bottom:1px solid #edf0f3}.intent-row:last-child{border-bottom:0}.intent-no{width:22px;height:22px;border-radius:6px;background:#f2f4f7;color:#667085;display:grid;place-items:center;font-size:9px;font-weight:700}.intent-name{display:flex;flex-direction:column}.intent-name b{font-size:11px;color:#344054}.intent-name span{font-size:9px;color:#758198;margin-top:2px;line-height:1.35}.two-col{display:grid;grid-template-columns:1fr 1fr;gap:12px}.rule-list,.source-list{display:grid;gap:6px}.rule-list>div,.source-list>div{border:1px solid #e4e7ec;border-radius:8px;padding:9px 10px;background:#fbfcfd}.rule-list>div{display:flex;flex-direction:column;gap:3px}.rule-list b,.source-list b{font-size:10px;color:#344054}.rule-list span,.source-list span{font-size:9px;color:#758198;line-height:1.35}.source-list>div{display:grid;grid-template-columns:18px 1fr;gap:7px}.source-list i{font-size:10px;color:#98a2b3;margin-top:2px}.source-list div div{display:flex;flex-direction:column;gap:2px}.policy-note{margin-top:20px;border:1px solid #dce5f2;background:#f8fbff;border-radius:9px;padding:11px 12px;display:flex;align-items:flex-start;gap:9px;color:#475467}.policy-note div{display:flex;flex-direction:column;gap:3px}.policy-note b{font-size:11px}.policy-note span{font-size:10px;line-height:1.4}
  @media(max-width:1120px){.mail-app{grid-template-columns:165px 365px minmax(0,1fr)}.context-bar{grid-template-columns:1fr 1fr}.search input{width:150px}.workflow-grid{grid-template-columns:repeat(4,1fr)}.setup-grid,.mode-grid{grid-template-columns:1fr 1fr}}
  @media(max-width:880px){.mail-app{grid-template-columns:165px minmax(300px,1fr)}.reading-pane{display:none}.capability-grid,.two-col{grid-template-columns:1fr}.agent-hero{align-items:flex-start}.hero-status{border-left:0;padding-left:0}.workflow-grid{grid-template-columns:repeat(2,1fr)}}
  @media(max-width:620px){.page-head{flex-direction:column}.top-actions{margin-left:0}.mail-app{grid-template-columns:1fr;height:auto;min-height:650px}.mail-nav{display:none}.message-list{border-right:0}.agent-hero{flex-direction:column}.hero-status{margin-left:0}.setup-grid,.mode-grid,.workflow-grid{grid-template-columns:1fr}}
  `]
})
export class EmailComponent{
  readonly section=signal<EmailTab>('Mail');readonly views:MailView[]=['Inbox','Needs reply','Sent'];readonly activeView=signal<MailView>('Inbox');readonly activeMailbox=signal<MailboxId>('all');readonly query=signal('');
  readonly rows=signal<MailRow[]>([]);
  readonly selected=signal<MailRow|null>(null);
  readonly mailLoading=signal(false);
  readonly mailReady=signal(false);
  readonly countsReady=signal(false);
  readonly mailError=signal('');
  readonly replyMode=signal<'none'|'reply'|'forward'>('none');
  readonly replyText=signal('');
  readonly forwardTo=signal('');
  readonly sending=signal(false);
  readonly sendStatus=signal('');
  private readerHistoryPushed=false;
  readonly mailboxInboxCounts=signal<{info:number;support:number}>({info:0,support:0});

  constructor(private readonly email:EmailService){void this.refreshMailboxCounts();void this.loadMail();}

  readonly decisionFlow=['Read thread','Identify customer','Match order','Classify intent','Collect facts','Assess risk','Draft / escalate'];
  readonly dataSources=[{title:'Orders',description:'Customer, items, options, notes, payment and delivery method.'},{title:'Production',description:'Current production units and live production status.'},{title:'Fulfilment',description:'Pickup readiness, shipping preparation and booked shipping.'},{title:'Pickup calendar',description:'Available pickup windows and closed dates once connected.'},{title:'Shipping data',description:'Packages, dimensions, weights and later tracking.'},{title:'Business rules',description:'Lead times, claims, cancellations, payments and approved answers.'}];
  readonly intentPolicies:IntentPolicy[]=[{intent:'Order question',mode:'Draft + review',rule:'Use the actual linked order. Never invent status, dates or inclusions.'},{intent:'Customisation',mode:'Manual only',rule:'Custom design, feasibility and pricing require review.'},{intent:'Product question',mode:'Auto later',rule:'Factual catalogue questions may become automatic after approved product knowledge is connected.'},{intent:'Production / lead time',mode:'Auto later',rule:'Use current lead-time rules and actual order status; never promise an unconfirmed date.'},{intent:'Pickup',mode:'Auto later',rule:'Once calendar integration exists, factual pickup availability may be answered automatically.'},{intent:'Delivery / shipping',mode:'Draft + review',rule:'Use shipment and order data. Unusual freight remains reviewed.'},{intent:'Payment / invoice',mode:'Draft + review',rule:'Provide factual payment information only; money or term changes require review.'},{intent:'Order change',mode:'Manual only',rule:'Any requested change may affect production, timing or price and must be approved.'},{intent:'Claim / damage',mode:'Manual only',rule:'Never auto-send. Surface timing, evidence and order details for human review.'},{intent:'Cancellation / refund',mode:'Manual only',rule:'Never auto-send. Consequences must be reviewed before any commitment.'},{intent:'General enquiry',mode:'Draft + review',rule:'Prepare a concise draft; low-risk FAQs may become automatic later.'}];
  readonly guardrails=['Claims / damage','Refunds / cancellations','Paid-order changes','Custom pricing or feasibility','Financial consequences','Legal / policy disputes','Low-confidence order match','Conflicting information'];
  readonly visibleRows=computed(()=>{const view=this.activeView(),box=this.activeMailbox(),q=this.query().trim().toLowerCase();return this.rows().filter(row=>this.belongsToView(row,view)&&(box==='all'||row.mailbox===box)&&(!q||`${row.correspondent} ${row.email} ${row.subject} ${row.preview} ${row.linked_order||''}`.toLowerCase().includes(q)));});
  belongsToView(row:MailRow,view:MailView){if(view==='Sent')return row.status==='Sent';if(view==='Needs reply')return row.status==='Inbox'&&row.needs_reply===true;return row.status==='Inbox';}
  setMailbox(box:MailboxId){this.activeMailbox.set(box);void this.loadMail();}
  setView(view:MailView){this.activeView.set(view);void this.loadMail();}
  ensureSelection(){queueMicrotask(()=>{const visible=this.visibleRows();if(!visible.some(row=>row.id===this.selected()?.id))this.selected.set(visible[0]??null);});}
  private async refreshMailboxCounts(){
    try{
      const [info,support]=await Promise.all([this.email.list('info','Inbox'),this.email.list('support','Inbox')]);
      this.mailboxInboxCounts.set({info:info.length,support:support.length});
      this.countsReady.set(true);
    }catch(e){this.mailError.set(String((e as Error)?.message||e));}
  }
  private async loadMail(){
    const view=this.activeView();
    if(view==='Needs reply'){this.rows.set([]);this.selected.set(null);return;}
    this.mailLoading.set(true);this.mailError.set('');
    try{
      const box=this.activeMailbox();
      const keys:('info'|'support')[]=box==='all'?['info','support']:[box];
      const batches=await Promise.all(keys.map(key=>this.email.list(key,view)));
      const rows=batches.flat().map(row=>this.toMailRow(row)).sort((a,b)=>this.dateValue(b.received_at)-this.dateValue(a.received_at));
      this.rows.set(rows);
      this.mailReady.set(true);
      if(view==='Inbox'){const c=this.mailboxInboxCounts();if(box==='info')this.mailboxInboxCounts.set({...c,info:rows.length});else if(box==='support')this.mailboxInboxCounts.set({...c,support:rows.length});else this.mailboxInboxCounts.set({info:rows.filter(r=>r.mailbox==='info').length,support:rows.filter(r=>r.mailbox==='support').length});}
      this.selected.set(null);
    }catch(e){if(!this.mailReady())this.rows.set([]);this.selected.set(null);this.mailError.set(String((e as Error)?.message||e));}
    finally{this.mailLoading.set(false);}
  }
  private toMailRow(row:GmailMessageRow):MailRow{
    return {...row,body:'',ai_state:'Not analysed',linked_order:null,intent:null,needs_reply:false,confidence:null,draft_reply:'',time:this.formatMailTime(row.received_at)};
  }
  closeMail(){
    if(this.readerHistoryPushed){history.back();return;}
    this.cancelReply();this.selected.set(null);
  }
  async openMail(mail:MailRow){
    if(!this.selected()){
      history.pushState({wcMailReader:true,id:mail.id,mailbox:mail.mailbox},'',window.location.href);
      this.readerHistoryPushed=true;
    }
    await this.showMail(mail);
  }
  private async showMail(mail:MailRow){
    this.cancelReply();this.selected.set(mail);
    if(mail.body)return;
    try{const full=await this.email.getMessage(mail.mailbox,mail.id);const updated={...mail,body:full.body||mail.preview,received_at:full.date||mail.received_at,time:this.formatMailTime(full.date||mail.received_at),unread:full.unread??false,starred:full.starred??mail.starred};this.rows.update(rows=>rows.map(row=>row.id===mail.id&&row.mailbox===mail.mailbox?updated:row));this.selected.set(updated);}
    catch(e){this.mailError.set(String((e as Error)?.message||e));}
  }
  @HostListener('window:popstate',['$event'])
  onBrowserHistory(event:PopStateEvent){
    const state=event.state as {wcMailReader?:boolean;id?:string;mailbox?:'info'|'support'}|null;
    if(state?.wcMailReader&&state.id&&state.mailbox){
      const mail=this.rows().find(row=>row.id===state.id&&row.mailbox===state.mailbox);
      if(mail){this.readerHistoryPushed=true;void this.showMail(mail);return;}
    }
    this.readerHistoryPushed=false;this.cancelReply();this.selected.set(null);
  }
  startReply(mail:MailRow){
    this.replyMode.set('reply');this.forwardTo.set('');this.sendStatus.set('');this.replyText.set('');
  }
  startForward(mail:MailRow){
    this.replyMode.set('forward');this.forwardTo.set('');this.sendStatus.set('');
    const body=mail.body||mail.preview||'';
    this.replyText.set(`\n\n---------- Forwarded message ----------\nFrom: ${mail.correspondent} <${mail.email}>\nDate: ${mail.received_at}\nSubject: ${mail.subject}\n\n${body}`);
  }
  cancelReply(){this.replyMode.set('none');this.replyText.set('');this.forwardTo.set('');this.sendStatus.set('');this.sending.set(false);}
  canSend(mail:MailRow){const text=this.replyText().trim();if(!text)return false;return this.replyMode()==='forward'?this.forwardTo().trim().includes('@'):!!mail.email;}
  async sendCurrent(mail:MailRow){
    if(!this.canSend(mail)||this.sending())return;
    this.sending.set(true);this.sendStatus.set('Sending…');
    try{
      const forward=this.replyMode()==='forward';
      const to=forward?this.forwardTo().trim():mail.email;
      const subject=forward?(mail.subject.toLowerCase().startsWith('fwd:')?mail.subject:`Fwd: ${mail.subject}`):(mail.subject.toLowerCase().startsWith('re:')?mail.subject:`Re: ${mail.subject}`);
      await this.email.send(mail.mailbox,to,subject,this.replyText());
      this.sendStatus.set('Sent');
      this.replyText.set('');this.forwardTo.set('');
      setTimeout(()=>{this.replyMode.set('none');this.sendStatus.set('');},900);
    }catch(e){this.sendStatus.set(`Error: ${String((e as Error)?.message||e)}`);}
    finally{this.sending.set(false);}
  }
  private dateValue(value:string){const n=Date.parse(value);return Number.isFinite(n)?n:0;}
  private formatMailTime(value:string){const d=new Date(value);if(Number.isNaN(d.getTime()))return value;const now=new Date();if(d.toDateString()===now.toDateString())return d.toLocaleTimeString('en-AU',{hour:'numeric',minute:'2-digit'});return d.toLocaleDateString('en-AU',{day:'numeric',month:'short'});}
  countFor(view:MailView){const box=this.activeMailbox();return this.rows().filter(row=>this.belongsToView(row,view)&&(box==='all'||row.mailbox===box)).length;}
  mailboxCount(box:MailboxId){const c=this.mailboxInboxCounts();if(box==='info')return c.info;if(box==='support')return c.support;return c.info+c.support;}
  mailboxAddress(box:'info'|'support'){return box==='info'?'info@whitecorner.com.au':'support@whitecorner.com.au';}
  mailboxShort(box:'info'|'support'){return box==='info'?'info@':'support@';}
  activeMailboxLabel(){const box=this.activeMailbox();return box==='all'?'All mail':this.mailboxAddress(box);}
  folderIcon(view:MailView){if(view==='Inbox')return'pi pi-inbox';if(view==='Needs reply')return'pi pi-comment';return'pi pi-send';}
  confidenceLabel(value:number){return`${Math.round(value*100)}%`;}
  aiSeverity(state?:AiState):'success'|'info'|'warn'|'secondary'{if(state==='Auto handled')return'success';if(state==='Draft ready')return'info';if(state==='Review')return'warn';return'secondary';}
  policySeverity(mode:PolicyMode):'success'|'info'|'warn'{if(mode==='Auto later')return'success';if(mode==='Draft + review')return'info';return'warn';}
  modeCount(mode:PolicyMode){return this.intentPolicies.filter(policy=>policy.mode===mode).length;}
}
