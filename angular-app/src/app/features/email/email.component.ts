import { Component, HostListener, computed, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { EmailService, GmailAttachment, GmailMessageRow } from '../../core/services/email.service';
import { EmailAiService } from '../../core/services/email-ai.service';
import { OrdersService } from '../../core/services/orders.service';

type EmailTab='Mail'|'AI Agent';
type MailView='Inbox'|'Unread'|'Needs reply'|'Starred'|'Sent';
type AiState='Not analysed'|'Review'|'Draft ready'|'Auto handled';
type MailIntent='Order question'|'Customisation'|'Product question'|'Production / lead time'|'Pickup'|'Delivery / shipping'|'Payment / invoice'|'Order change'|'Claim / damage'|'Cancellation / refund'|'General enquiry';
type PolicyMode='Auto later'|'Draft + review'|'Manual only';
type MailboxId='all'|'info'|'support';

interface MailRow{id:string;mailbox:'info'|'support';correspondent:string;email:string;initials:string;subject:string;preview:string;body:string;html_body?:string;images_blocked?:boolean;attachments?:GmailAttachment[];received_at:string;time:string;direction:'Incoming'|'Outgoing';status:'Inbox'|'Sent';unread?:boolean;starred?:boolean;ai_state?:AiState;linked_order?:string|null;intent?:MailIntent|null;needs_reply?:boolean|null;confidence?:number|null;draft_reply?:string|null;ai_summary?:string|null;review_reason?:string|null;}
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
          <p-button label="Compose" icon="pi pi-pencil" styleClass="compose" (onClick)="startCompose()"/>
          <div class="nav-label">Mailboxes</div>
          <button class="mailbox-option" [class.active]="activeMailbox()==='all'" (click)="setMailbox('all')"><span class="mailbox-dot all"></span><span>All mail</span><small>{{countsReady()?mailboxCount('all'):'—'}}</small></button>
          <button class="mailbox-option" [class.active]="activeMailbox()==='info'" (click)="setMailbox('info')"><span class="mailbox-dot info"></span><span>info@whitecorner.com.au</span><small>{{countsReady()?mailboxCount('info'):'—'}}</small></button>
          <button class="mailbox-option" [class.active]="activeMailbox()==='support'" (click)="setMailbox('support')"><span class="mailbox-dot support"></span><span>support@whitecorner.com.au</span><small>{{countsReady()?mailboxCount('support'):'—'}}</small></button>
          <div class="nav-label folders-label">Folders</div>
          @for(view of views;track view){<button class="folder-option" [class.active]="activeView()===view" (click)="setView(view)"><span class="folder-glyph" aria-hidden="true">{{folderGlyph(view)}}</span><span>{{view}}</span><small>{{mailReady()?countFor(view):'—'}}</small></button>}
          <div class="mail-status live"><span></span><div><b>Gmail connected</b><small>Live Inbox / Sent</small></div></div>
        </aside>

        <section class="message-list">
          <div class="list-toolbar"><div class="list-title"><b>{{activeView()}}</b><span>@if(mailReady()){{{activeMailboxLabel()}} · {{visibleRows().length}} messages@if(mailLoading()){ · Syncing…}}@else{Loading mail…}</span></div><button class="reader-icon" style="margin-left:auto" title="Check for new mail" aria-label="Check for new mail" (click)="refreshMail()" [disabled]="mailLoading()"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6v5h-5M4 18v-5h5"/><path d="M6.1 9a7 7 0 0 1 11.7-2.6L20 11M4 13l2.2 4.6A7 7 0 0 0 17.9 15"/></svg></button></div>
          <div class="mail-list-scroll">
            @if(!mailReady()){<div class="mail-loading"><i class="pi pi-spin pi-spinner"></i><span>Loading mail…</span></div>} @else {
              @for(mail of visibleRows();track mail.id){<button class="mail-card" [class.selected]="selected()?.id===mail.id" [class.unread]="mail.unread" (click)="openMail(mail)"><span class="unread-marker" aria-hidden="true"></span><span class="mail-star" [class.active]="mail.starred">{{mail.starred?'★':'☆'}}</span><b class="mail-sender">{{mail.correspondent}}</b><span class="mail-line"><strong>{{mail.subject}}</strong><span class="mail-snippet"> — {{mail.preview}}</span></span><span class="mail-row-meta"><span class="account-chip">{{mailboxShort(mail.mailbox)}}</span>@if(mail.linked_order){<span class="order-chip">#{{mail.linked_order}}</span>}@if(mail.needs_reply){<span class="reply-chip">Needs reply</span>}</span><time>{{mail.time}}</time></button>} @empty {@if(mailLoading()){<div class="mail-loading compact"><span>Loading messages…</span></div>}@else{<div class="empty-list"><b>No messages in this view</b><span>Choose another mailbox or folder.</span></div>}}
            }
          </div>
        </section>

        <section class="reading-placeholder"><div class="empty-reading"><div class="empty-mail-icon"><i class="pi pi-envelope"></i></div><b>Select an email</b><span>Open a message to read it full screen.</span></div></section>
      </div>

      @if(composeOpen()){
        <section class="compose-window" aria-label="New message">
          <div class="compose-head"><b>New message</b><button title="Close" (click)="cancelCompose()">×</button></div>
          <div class="compose-field"><span>From</span><select [value]="composeMailbox()" (change)="composeMailbox.set($any($event.target).value)"><option value="info">info@whitecorner.com.au</option><option value="support">support@whitecorner.com.au</option></select></div>
          <div class="compose-field"><span>To</span><input pInputText type="email" autocomplete="off" [value]="composeTo()" (input)="composeTo.set($any($event.target).value)" placeholder="recipient@example.com"/></div>
          <div class="compose-field subject"><span>Subject</span><input pInputText [value]="composeSubject()" (input)="composeSubject.set($any($event.target).value)" placeholder="Subject"/></div>
          <textarea [value]="composeText()" (input)="composeText.set($any($event.target).value)" placeholder="Write a message…" [disabled]="composeSending()"></textarea>
          <div class="compose-field"><span>Files</span><input type="file" multiple (change)="selectComposeFiles($event)" [disabled]="composeSending()"/></div>
          <div class="compose-actions">
            @if(composeStatus()){<span [class.send-error]="composeStatus().startsWith('Error')">{{composeStatus()}}</span>}@else if(composeAttachments().length){<span>{{composeAttachments().length}} file(s) · {{composeAttachmentSize()}}</span>}@else{<span>Sent through Gmail</span>}
            <button class="discard-compose" title="Discard" (click)="cancelCompose()" [disabled]="composeSending()"><i class="pi pi-trash"></i></button>
            <p-button label="Send" icon="pi pi-send" (onClick)="sendCompose()" [disabled]="composeSending() || !canSendCompose()"/>
          </div>
        </section>
      }

      @if(selected();as mail){
        <section class="mail-reader">
          <div class="reader-toolbar">
            <button class="back-button" title="Back to email list" aria-label="Back to email list" (click)="closeMail()"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/><path d="M9 12h11"/></svg></button>
            @if(mail.status==='Inbox'){<button class="reader-icon" title="Archive" aria-label="Archive" (click)="modifyMessage(mail,'archive')" [disabled]="messageActionBusy()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16v13H4zM3 3h18v4H3z"/><path d="m9 13 3 3 3-3M12 9v7"/></svg></button>}
            <button class="reader-icon" title="{{mail.unread?'Mark as read':'Mark as unread'}}" aria-label="{{mail.unread?'Mark as read':'Mark as unread'}}" (click)="modifyMessage(mail,mail.unread?'markRead':'markUnread')" [disabled]="messageActionBusy()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 5h18v14H3z"/><path d="m3 6 9 7 9-7"/></svg></button>
            <button class="reader-icon star-action" [class.active]="mail.starred" title="{{mail.starred?'Remove star':'Add star'}}" aria-label="{{mail.starred?'Remove star':'Add star'}}" (click)="modifyMessage(mail,mail.starred?'unstar':'star')" [disabled]="messageActionBusy()"><svg width="19" height="19" viewBox="0 0 24 24" [attr.fill]="mail.starred?'currentColor':'none'" stroke="currentColor" stroke-width="2"><path d="m12 2.8 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3-4.6-4.5 6.3-.9z"/></svg></button>
            <button class="reader-icon danger-action" title="Move to trash" aria-label="Move to trash" (click)="modifyMessage(mail,'trash')" [disabled]="messageActionBusy()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14"/><path d="M10 11v6M14 11v6"/></svg></button>
            @if(messageActionStatus()){<span class="reader-action-status" [class.error]="messageActionStatus().startsWith('Error')">{{messageActionStatus()}}</span>}
            <div class="reader-toolbar-spacer"></div>
            <span class="reader-toolbar-divider"></span>
            <button class="reader-icon" title="Reply" aria-label="Reply" (click)="startReply(mail)" [disabled]="messageActionBusy()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 17-6-5 6-5v3c7 0 10 3 12 7-3-2-6-3-12-2z"/></svg></button>
            <button class="reader-icon" title="Forward" aria-label="Forward" (click)="startForward(mail)" [disabled]="messageActionBusy()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 17 6-5-6-5v3C8 10 5 13 3 17c3-2 6-3 12-2z"/></svg></button>
          </div>
          <div class="reader-scroll">
            <div class="reader-content">
              <div class="reader-subject"><h2>{{mail.subject}}</h2>@if(mail.needs_reply){<p-tag value="Needs reply" severity="warn"/>}</div>
              <div class="reader-sender">
                <div class="avatar reader-avatar">{{mail.initials}}</div>
                <div class="reader-sender-copy"><b>{{mail.correspondent}}</b><span>{{mail.email}}</span></div>
                <time>{{mail.time}}</time>
              </div>
              @if(bodyLoading()===mail.mailbox+':'+mail.id){<div class="reader-body" style="color:#98a2b3">Loading full message…</div>}@else if(mail.html_body){<article class="reader-body reader-html" [innerHTML]="mail.html_body"></article>}@else{<article class="reader-body">{{mail.body || mail.preview}}</article>}
              @if(mail.images_blocked){<div class="email-media-notice"><span>External images are blocked for privacy.</span><button (click)="displayExternalImages(mail)" [disabled]="bodyLoading()!==''">Display images</button></div>}
              @if(mail.attachments?.length){<div class="email-attachments"><b>Attachments</b><div>@for(attachment of mail.attachments;track attachment.attachmentId){<button (click)="downloadAttachment(mail,attachment)"><span>{{attachment.filename}}</span><small>{{attachmentSize(attachment.size)}}</small></button>}</div></div>}
              <div class="reader-ai">
                <div><small>AI</small><p-tag [value]="mail.ai_state||'Not analysed'" [severity]="aiSeverity(mail.ai_state)"/></div>
                <div><small>Category</small><b>{{mail.intent||'Not analysed'}}</b></div>
                <div><small>Order</small><b>{{mail.linked_order?'#'+mail.linked_order:'—'}}</b></div>
                <div><small>Confidence</small><b>{{mail.confidence==null?'—':confidenceLabel(mail.confidence)}}</b></div>
              </div>
              @if(mail.ai_summary){<div class="ai-summary"><div><i class="pi pi-sparkles"></i><b>AI Summary</b></div><p>{{mail.ai_summary}}</p>@if(mail.review_reason){<span><i class="pi pi-exclamation-triangle"></i>{{mail.review_reason}}</span>}</div>}
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
:host{display:block;height:100%;min-height:0;overflow:hidden}  .email-page{min-width:0;height:100%;min-height:0;display:flex;flex-direction:column;overflow:hidden}.page-head{display:flex;align-items:center;gap:10px;margin:0 0 5px;flex:0 0 32px}.page-head>div:first-child{min-width:0}.page-head h2{margin:0;font-size:18px;font-weight:600;color:#101828;line-height:1}.page-head p{display:none}.top-actions{margin-left:auto;display:flex;align-items:center;gap:6px}.top-actions ::ng-deep .p-button{padding:.35rem .65rem;font-size:11px}.top-search{position:relative;width:min(360px,32vw)}.top-search i{position:absolute;left:11px;top:50%;transform:translateY(-50%);font-size:11px;color:#98a2b3;pointer-events:none}.top-search input{width:100%;height:32px;padding-left:31px;border-radius:18px;font-size:11px;background:#f7f8fa}
  .mail-app{flex:1 1 auto;min-height:0;height:auto;max-height:none;display:grid;grid-template-columns:176px minmax(0,1fr);grid-template-rows:minmax(0,1fr);background:#fff;border:1px solid #dfe3e8;border-radius:11px;overflow:hidden}.mail-nav{display:flex;flex-direction:column;padding:12px 8px;border-right:1px solid #e4e7ec;background:#f8fafc}.mail-nav ::ng-deep .compose{width:100%;justify-content:center;margin-bottom:15px}.nav-label{padding:0 8px 6px;font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#98a2b3;font-weight:700}.folders-label{margin-top:14px}.mailbox-option,.folder-option{width:100%;border:0;background:transparent;display:grid;grid-template-columns:16px minmax(0,1fr) auto;gap:6px;align-items:center;text-align:left;padding:7px 8px;border-radius:7px;color:#344054;cursor:pointer;font:inherit;font-size:11px}.mailbox-option:hover,.folder-option:hover{background:#eef2f6}.mailbox-option.active,.folder-option.active{background:#e8eef7;color:#172033;font-weight:600}.mailbox-option span:nth-child(2),.folder-option span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mailbox-option small,.folder-option small{color:#98a2b3;font-size:10px}.mailbox-dot{width:8px;height:8px;border-radius:50%;display:block}.mailbox-dot.all{background:#667085}.mailbox-dot.info{background:#2459d3}.mailbox-dot.support{background:#6b47c8}.folder-option i{font-size:12px;color:#667085}.mail-status{margin-top:auto;border-top:1px solid #e4e7ec;padding:12px 7px 1px;display:flex;align-items:flex-start;gap:7px}.mail-status>span{width:7px;height:7px;border-radius:50%;background:#12b76a;margin-top:4px}.mail-status div{display:flex;flex-direction:column}.mail-status b{font-size:10px;font-weight:600;color:#475467}.mail-status small{font-size:9px;color:#98a2b3}
  .message-list{min-width:0;min-height:0;height:100%;max-height:100%;display:flex;flex-direction:column;overflow:hidden;border-right:1px solid #e4e7ec;background:#fff}.list-toolbar{height:46px;min-height:46px;padding:6px 12px;border-bottom:1px solid #e4e7ec;display:flex;align-items:center;gap:10px;background:#fff;z-index:2}.list-title{display:flex;align-items:baseline;gap:9px;min-width:0}.list-title b{font-size:14px;color:#172033;white-space:nowrap}.list-title span{font-size:9px;color:#98a2b3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.search{position:relative;margin-left:auto;min-width:0}.search i{position:absolute;left:9px;top:50%;transform:translateY(-50%);font-size:11px;color:#98a2b3}.search input{width:190px;height:32px;padding-left:28px;font-size:11px}.mail-list-scroll{overflow-y:auto!important;overflow-x:hidden;min-height:0;height:0;flex:1 1 auto;overscroll-behavior:contain;scrollbar-gutter:stable;background:#fff}.mail-card{width:100%;min-height:42px;display:grid;grid-template-columns:7px 22px minmax(105px,150px) minmax(140px,1fr) auto 54px;gap:8px;align-items:center;border:0;border-bottom:1px solid #edf0f3;background:#fff;padding:0 12px 0 9px;text-align:left;cursor:pointer;color:#344054;font:inherit;contain:layout paint}.mail-card:hover{background:#f7f9fc;box-shadow:inset 0 1px #e4e7ec,inset 0 -1px #e4e7ec}.mail-card.selected{background:#edf4ff;box-shadow:inset 3px 0 #3b82f6}.mail-card.unread{background:#f8fbff}.mail-card.unread:hover{background:#f3f7fd}.unread-marker{width:6px;height:6px;border-radius:50%;background:transparent}.mail-card.unread .unread-marker{background:#2563eb}.mail-star{width:22px;height:28px;display:grid;place-items:center;color:#c2c8d0}.mail-star i{font-size:12px}.mail-star.active{color:#d39a00}.mail-sender{font-size:11px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#475467}.mail-card.unread .mail-sender,.mail-card.unread .mail-line strong{font-weight:700;color:#172033}.mail-line{min-width:0;display:flex;overflow:hidden;white-space:nowrap;font-size:11px}.mail-line strong{font-weight:600;color:#344054;overflow:hidden;text-overflow:ellipsis;flex:0 1 auto}.mail-snippet{min-width:24px;color:#7b8798;overflow:hidden;text-overflow:ellipsis;font-weight:400}.mail-row-meta{display:flex;gap:4px;align-items:center;min-width:0;white-space:nowrap}.mail-row-meta>span{font-size:8px;border-radius:999px;padding:2px 5px}.mail-card time{font-size:9px;color:#98a2b3;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.account-chip{background:#f2f4f7;color:#667085}.order-chip{background:#eef4ff;color:#3056a0}.reply-chip{background:#fff4e5;color:#a35b00}@media(max-width:1180px){.mail-card{grid-template-columns:7px 20px minmax(95px,125px) minmax(120px,1fr) auto 48px}.mail-row-meta .account-chip{display:none}}@media(max-width:900px){.mail-card{grid-template-columns:7px 20px minmax(85px,110px) minmax(100px,1fr) 48px}.mail-row-meta{display:none}}.mail-loading{height:100%;min-height:220px;display:flex;align-items:center;justify-content:center;gap:8px;color:#98a2b3;font-size:11px}.mail-loading.compact{height:auto;min-height:120px}.mail-loading i{font-size:14px}.empty-list{min-height:300px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:6px;color:#98a2b3;text-align:center;padding:20px}.empty-list i{font-size:26px}.empty-list b{font-size:12px;color:#475467}.empty-list span{font-size:10px}
  .reading-placeholder{display:none}.reading-head{min-height:78px;padding:15px 20px;border-bottom:1px solid #e4e7ec;display:flex;align-items:flex-start;gap:14px}.reading-head>div:first-child{min-width:0}.subject-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.subject-row h3{margin:0;font-size:17px;font-weight:600;color:#172033}.thread-meta{margin-top:5px;font-size:10px;color:#98a2b3}.reading-actions{display:flex;gap:5px;margin-left:auto}.reading-actions button{width:30px;height:30px;border:1px solid #e4e7ec;background:#fff;border-radius:7px;cursor:pointer;color:#667085}.message-thread{padding:19px 20px}.sender-row{display:flex;align-items:center;gap:9px}.avatar.large{width:36px;height:36px}.sender-row>div:nth-child(2){display:flex;flex-direction:column}.sender-row b{font-size:12px;color:#172033}.sender-row span{font-size:10px;color:#758198;margin-top:2px}.sender-row time{margin-left:auto;font-size:9px;color:#98a2b3}.message-body{white-space:pre-line;line-height:1.55;font-size:12px;color:#344054;margin:19px 0 4px;max-width:760px}.context-bar{margin:0 20px 16px;padding:9px 11px;border:1px solid #e8ebef;border-radius:8px;background:#fbfcfd;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.context-bar>div{display:flex;flex-direction:column;gap:3px;min-width:0}.context-bar small{text-transform:uppercase;font-size:8px;color:#98a2b3;font-weight:700}.context-bar b{font-size:10px;color:#475467;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.reply-box{margin:0 20px 22px;border:1px solid #dfe3e8;border-radius:9px;overflow:hidden}.reply-label{padding:8px 10px;display:flex;align-items:center;gap:6px;border-bottom:1px solid #edf0f3;font-size:10px}.reply-label span{color:#98a2b3}.reply-box textarea{display:block;width:100%;height:92px;border:0;resize:none;padding:10px;font:inherit;font-size:11px;outline:none;box-sizing:border-box}.reply-actions{display:flex;align-items:center;gap:9px;border-top:1px solid #edf0f3;padding:7px 9px}.reply-actions span{font-size:9px;color:#98a2b3}.reply-actions p-button{margin-left:auto}.empty-reading{height:100%;min-height:450px;display:flex;align-items:center;justify-content:center;flex-direction:column;text-align:center;gap:7px;color:#98a2b3}.empty-reading b{color:#475467;font-size:14px}.empty-reading span{font-size:11px}.empty-mail-icon{width:52px;height:52px;border-radius:50%;background:#f4f6f8;display:grid;place-items:center;font-size:20px}
  .mail-reader{position:fixed;z-index:1200;top:0;left:205px;right:0;bottom:0;background:#fff;display:flex;flex-direction:column}.reader-toolbar{height:54px;flex:0 0 54px;border-bottom:1px solid #e4e7ec;display:flex;align-items:center;padding:0 22px;gap:7px;background:#fff}.back-button,.reader-icon{width:36px;height:36px;border:0;background:transparent;border-radius:50%;display:grid;place-items:center;color:#475467;cursor:pointer}.back-button:hover:not(:disabled),.reader-icon:hover:not(:disabled){background:#f2f4f7}.back-button:disabled,.reader-icon:disabled{opacity:.42;cursor:default}.back-button i{font-size:16px}.reader-icon.star-action.active{color:#d39a00}.reader-icon.danger-action:hover:not(:disabled){background:#fff1f1;color:#b42318}.reader-action-status{font-size:10px;color:#667085;margin-left:4px;white-space:nowrap}.reader-action-status.error{color:#b42318}.reader-toolbar-spacer{flex:1}.reader-toolbar-divider{width:1px;height:22px;background:#e4e7ec;margin:0 2px}.reader-scroll{overflow:auto;min-height:0;flex:1}.reader-content{max-width:1120px;margin:0 auto;padding:24px 38px 48px}.reader-subject{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.reader-subject h2{font-size:23px;font-weight:500;color:#202124;margin:0}.reader-mailbox{display:none}.reader-sender{display:flex;align-items:center;gap:12px;margin-top:22px}.reader-avatar{width:42px;height:42px;font-size:12px}.reader-sender-copy{display:flex;flex-direction:column;gap:3px}.reader-sender-copy b{font-size:13px;color:#202124}.reader-sender-copy span{font-size:11px;color:#667085}.reader-sender time{margin-left:auto;color:#98a2b3;font-size:10px}.reader-body{white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px;line-height:1.65;color:#202124;margin-top:24px;min-height:48px;max-width:920px}.reader-ai{margin-top:26px;padding:12px 14px;border:1px solid #e4e7ec;border-radius:10px;background:#fbfcfd;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.reader-ai>div{display:flex;flex-direction:column;gap:4px;min-width:0}.reader-ai small{text-transform:uppercase;font-size:8px;color:#98a2b3;font-weight:700}.reader-ai b{font-size:10px;color:#475467}.reader-reply{margin-top:22px;border:1px solid #dfe3e8;border-radius:10px;overflow:hidden}.reader-reply textarea{display:block;width:100%;min-height:130px;border:0;resize:vertical;padding:14px;font:inherit;font-size:12px;outline:none;box-sizing:border-box}.reader-reply .reply-actions{padding:9px 12px}@media(max-width:880px){.mail-reader{left:0;top:0}.reader-content{padding:24px 20px}.reader-ai{grid-template-columns:1fr 1fr}}
  .compose-window{position:fixed;z-index:1250;right:24px;bottom:18px;width:min(620px,calc(100vw - 250px));height:min(620px,76vh);display:flex;flex-direction:column;background:#fff;border:1px solid #d0d5dd;border-radius:12px 12px 8px 8px;overflow:hidden;box-shadow:0 14px 42px rgba(16,24,40,.2)}.compose-head{height:42px;flex:0 0 42px;padding:0 13px;display:flex;align-items:center;background:#f2f6fc;color:#344054}.compose-head b{font-size:12px}.compose-head button{margin-left:auto;border:0;background:transparent;color:#667085;font-size:20px;cursor:pointer}.compose-field{height:40px;flex:0 0 40px;display:flex;align-items:center;gap:9px;border-bottom:1px solid #edf0f3;padding:0 13px}.compose-field span{width:42px;font-size:10px;color:#667085}.compose-field input,.compose-field select{flex:1;min-width:0;height:30px;border:0;background:#fff;box-shadow:none;font:inherit;font-size:11px;color:#344054;outline:none}.compose-field select{cursor:pointer}.compose-field.subject input{font-weight:500}.compose-window>textarea{flex:1;min-height:150px;width:100%;resize:none;border:0;outline:none;padding:15px;font:inherit;font-size:12px;line-height:1.55;box-sizing:border-box}.compose-actions{height:54px;flex:0 0 54px;border-top:1px solid #edf0f3;padding:8px 11px;display:flex;align-items:center;gap:8px}.compose-actions>span{font-size:9px;color:#98a2b3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.compose-actions p-button{margin-left:auto}.discard-compose{width:34px;height:34px;border:0;background:transparent;border-radius:50%;display:grid;place-items:center;color:#667085;cursor:pointer}.discard-compose:hover:not(:disabled){background:#f2f4f7}.discard-compose:disabled{opacity:.45}@media(max-width:880px){.compose-window{left:12px;right:12px;bottom:12px;width:auto;height:min(620px,82vh)}}
  .ai-summary{margin-top:12px;padding:12px 14px;border:1px solid #dce5f2;border-radius:10px;background:#f8fbff}.ai-summary>div{display:flex;align-items:center;gap:7px;color:#344054}.ai-summary>div i{color:#175cd3}.ai-summary b{font-size:11px}.ai-summary p{margin:7px 0 0;font-size:11px;line-height:1.45;color:#475467}.ai-summary span{display:flex;align-items:center;gap:6px;margin-top:8px;font-size:10px;color:#b54708}.gmail-actions{display:flex;gap:9px;margin-top:20px;flex-wrap:wrap}.gmail-actions button{display:flex;align-items:center;gap:8px;height:38px;padding:0 16px;border:1px solid #c9cdd3;border-radius:19px;background:#fff;color:#3c4043;font:inherit;font-size:12px;cursor:pointer}.gmail-actions button:hover:not(:disabled){background:#f7f8fa}.gmail-actions .disabled-action{opacity:.45;cursor:not-allowed}.reader-reply.active{margin-top:22px}.reader-reply.active textarea{display:block;width:100%;min-height:150px;border:0;resize:vertical;padding:14px;font:inherit;font-size:12px;outline:none;box-sizing:border-box}.close-compose{margin-left:auto;border:0;background:transparent;font-size:18px;line-height:1;color:#667085;cursor:pointer}.forward-to{display:flex;align-items:center;gap:10px;border-bottom:1px solid #edf0f3;padding:8px 12px}.forward-to span{font-size:10px;color:#667085}.forward-to input{flex:1;height:30px;font-size:11px;border:0;box-shadow:none}.send-error{color:#b42318!important}
  .agent-page{background:#fff;border:1px solid #e4e7ec;border-radius:12px;padding:18px}.agent-hero{display:flex;align-items:center;gap:18px;border:1px solid #dce5f2;background:#f8fbff;border-radius:12px;padding:16px 18px}.hero-left{display:flex;align-items:center;gap:13px;min-width:0}.agent-icon{width:44px;height:44px;border-radius:10px;background:#172033;color:#fff;display:grid;place-items:center;font-weight:800;flex:0 0 auto}.agent-title{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.agent-title h3{margin:0;font-size:18px;color:#101828}.agent-hero p{margin:5px 0 0;color:#667085;font-size:12px;line-height:1.4}.hero-status{margin-left:auto;display:flex;align-items:center;gap:9px;border-left:1px solid #dce5f2;padding-left:18px}.state-dot{width:9px;height:9px;border-radius:50%;background:#f59e0b}.hero-status div{display:flex;flex-direction:column}.hero-status small{font-size:9px;text-transform:uppercase;color:#98a2b3;font-weight:700}.hero-status b{font-size:11px;color:#475467;margin-top:2px}.setup-section,.policy-section{margin-top:20px}.section-head{display:flex;align-items:flex-end;gap:14px;margin-bottom:9px}.section-head p{margin:3px 0 0;color:#98a2b3;font-size:10px}.policy-title{font-size:10px;text-transform:uppercase;color:#758198;font-weight:700}.setup-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.setup-row{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:9px;align-items:center;border:1px solid #e4e7ec;border-radius:9px;padding:10px 11px}.setup-row>i{width:25px;height:25px;border-radius:50%;display:grid;place-items:center;font-size:10px}.setup-row.ready>i{background:#ecfdf3;color:#067647}.setup-row.pending>i{background:#fff4e5;color:#b54708}.setup-row div{display:flex;flex-direction:column}.setup-row b{font-size:11px;color:#344054}.setup-row span{font-size:9px;color:#758198;margin-top:2px}.setup-row strong{font-size:9px;font-weight:700}.setup-row.ready strong{color:#067647}.setup-row.pending strong{color:#b54708}.mode-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.mode-card{border:1px solid #e4e7ec;border-radius:10px;padding:12px;display:grid;grid-template-columns:26px minmax(0,1fr);gap:9px;position:relative}.mode-card>span{width:24px;height:24px;border-radius:7px;display:grid;place-items:center;font-size:9px;font-weight:700}.mode-card b{font-size:11px;color:#344054}.mode-card p{font-size:9px;color:#758198;margin:3px 0 0;line-height:1.35}.mode-card small{grid-column:2;font-size:9px;font-weight:700}.mode-card.manual>span{background:#fff4e5;color:#b54708}.mode-card.review>span{background:#eff8ff;color:#175cd3}.mode-card.later>span{background:#ecfdf3;color:#067647}.mode-card.manual small{color:#b54708}.mode-card.review small{color:#175cd3}.mode-card.later small{color:#067647}.workflow-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}.workflow-step{border:1px solid #e4e7ec;border-radius:9px;padding:9px 8px;background:#fbfcfd;display:flex;align-items:center;gap:6px}.workflow-step span{width:21px;height:21px;border-radius:50%;background:#172033;color:#fff;display:grid;place-items:center;font-size:9px;font-weight:700;flex:0 0 auto}.workflow-step b{font-size:9px;color:#475467;line-height:1.25}.capability-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.capability-card{border:1px solid #e4e7ec;border-radius:10px;padding:13px 14px}.capability-card.good{background:#f8fcfa;border-color:#d8eee3}.capability-card.protect{background:#fffaf5;border-color:#f3e2cc}.cap-title{display:flex;align-items:center;gap:8px;margin-bottom:10px}.cap-title b{font-size:12px;color:#344054}.cap-list{display:flex;gap:6px;flex-wrap:wrap}.cap-list span{font-size:10px;border:1px solid rgba(0,0,0,.06);background:#fff;border-radius:999px;padding:4px 7px;color:#475467}.intent-list{border:1px solid #e4e7ec;border-radius:9px;overflow:hidden}.intent-row{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:9px;align-items:center;padding:9px 11px;border-bottom:1px solid #edf0f3}.intent-row:last-child{border-bottom:0}.intent-no{width:22px;height:22px;border-radius:6px;background:#f2f4f7;color:#667085;display:grid;place-items:center;font-size:9px;font-weight:700}.intent-name{display:flex;flex-direction:column}.intent-name b{font-size:11px;color:#344054}.intent-name span{font-size:9px;color:#758198;margin-top:2px;line-height:1.35}.two-col{display:grid;grid-template-columns:1fr 1fr;gap:12px}.rule-list,.source-list{display:grid;gap:6px}.rule-list>div,.source-list>div{border:1px solid #e4e7ec;border-radius:8px;padding:9px 10px;background:#fbfcfd}.rule-list>div{display:flex;flex-direction:column;gap:3px}.rule-list b,.source-list b{font-size:10px;color:#344054}.rule-list span,.source-list span{font-size:9px;color:#758198;line-height:1.35}.source-list>div{display:grid;grid-template-columns:18px 1fr;gap:7px}.source-list i{font-size:10px;color:#98a2b3;margin-top:2px}.source-list div div{display:flex;flex-direction:column;gap:2px}.policy-note{margin-top:20px;border:1px solid #dce5f2;background:#f8fbff;border-radius:9px;padding:11px 12px;display:flex;align-items:flex-start;gap:9px;color:#475467}.policy-note div{display:flex;flex-direction:column;gap:3px}.policy-note b{font-size:11px}.policy-note span{font-size:10px;line-height:1.4}
  @media(max-width:1120px){.mail-app{grid-template-columns:165px 365px minmax(0,1fr)}.context-bar{grid-template-columns:1fr 1fr}.search input{width:150px}.workflow-grid{grid-template-columns:repeat(4,1fr)}.setup-grid,.mode-grid{grid-template-columns:1fr 1fr}}
  @media(max-width:880px){.mail-app{grid-template-columns:165px minmax(300px,1fr)}.reading-pane{display:none}.capability-grid,.two-col{grid-template-columns:1fr}.agent-hero{align-items:flex-start}.hero-status{border-left:0;padding-left:0}.workflow-grid{grid-template-columns:repeat(2,1fr)}}
  @media(max-width:620px){.page-head{flex-direction:column}.top-actions{margin-left:0}.mail-app{grid-template-columns:1fr;height:auto;min-height:650px}.mail-nav{display:none}.message-list{border-right:0}.agent-hero{flex-direction:column}.hero-status{margin-left:0}.setup-grid,.mode-grid,.workflow-grid{grid-template-columns:1fr}}
  `]
})
export class EmailComponent{
  readonly section=signal<EmailTab>('Mail');readonly views:MailView[]=['Inbox','Unread','Needs reply','Starred','Sent'];readonly activeView=signal<MailView>('Inbox');readonly activeMailbox=signal<MailboxId>('all');readonly query=signal('');
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
  readonly composeOpen=signal(false);
  readonly composeMailbox=signal<'info'|'support'>('info');
  readonly composeTo=signal('');
  readonly composeSubject=signal('');
  readonly composeText=signal('');
  readonly composeAttachments=signal<File[]>([]);
  readonly composeSending=signal(false);
  readonly composeStatus=signal('');
  readonly messageAction=signal('');
  readonly messageActionStatus=signal('');
  readonly bodyLoading=signal('');
  private readerHistoryPushed=false;
  private selectionVersion=0;
  readonly mailboxInboxCounts=signal<{info:number;support:number}>({info:0,support:0});
  private readonly loadedViews=new Set<string>();
  private readonly viewLoads=new Map<string,Promise<void>>();

  constructor(private readonly email:EmailService,private readonly emailAi:EmailAiService,private readonly orders:OrdersService){this.hydrateMailCache();void this.initializeMail();}

  readonly decisionFlow=['Read thread','Identify customer','Match order','Classify intent','Collect facts','Assess risk','Draft / escalate'];
  readonly dataSources=[{title:'Orders',description:'Customer, items, options, notes, payment and delivery method.'},{title:'Production',description:'Current production units and live production status.'},{title:'Fulfilment',description:'Pickup readiness, shipping preparation and booked shipping.'},{title:'Pickup calendar',description:'Available pickup windows and closed dates once connected.'},{title:'Shipping data',description:'Packages, dimensions, weights and later tracking.'},{title:'Business rules',description:'Lead times, claims, cancellations, payments and approved answers.'}];
  readonly intentPolicies:IntentPolicy[]=[{intent:'Order question',mode:'Draft + review',rule:'Use the actual linked order. Never invent status, dates or inclusions.'},{intent:'Customisation',mode:'Manual only',rule:'Custom design, feasibility and pricing require review.'},{intent:'Product question',mode:'Auto later',rule:'Factual catalogue questions may become automatic after approved product knowledge is connected.'},{intent:'Production / lead time',mode:'Auto later',rule:'Use current lead-time rules and actual order status; never promise an unconfirmed date.'},{intent:'Pickup',mode:'Auto later',rule:'Once calendar integration exists, factual pickup availability may be answered automatically.'},{intent:'Delivery / shipping',mode:'Draft + review',rule:'Use shipment and order data. Unusual freight remains reviewed.'},{intent:'Payment / invoice',mode:'Draft + review',rule:'Provide factual payment information only; money or term changes require review.'},{intent:'Order change',mode:'Manual only',rule:'Any requested change may affect production, timing or price and must be approved.'},{intent:'Claim / damage',mode:'Manual only',rule:'Never auto-send. Surface timing, evidence and order details for human review.'},{intent:'Cancellation / refund',mode:'Manual only',rule:'Never auto-send. Consequences must be reviewed before any commitment.'},{intent:'General enquiry',mode:'Draft + review',rule:'Prepare a concise draft; low-risk FAQs may become automatic later.'}];
  readonly guardrails=['Claims / damage','Refunds / cancellations','Paid-order changes','Custom pricing or feasibility','Financial consequences','Legal / policy disputes','Low-confidence order match','Conflicting information'];
  readonly visibleRows=computed(()=>{const view=this.activeView(),box=this.activeMailbox(),q=this.query().trim().toLowerCase();return this.rows().filter(row=>this.belongsToView(row,view)&&(box==='all'||row.mailbox===box)&&(!q||`${row.correspondent} ${row.email} ${row.subject} ${row.preview} ${row.linked_order||''}`.toLowerCase().includes(q)));});
  belongsToView(row:MailRow,view:MailView){if(view==='Sent')return row.status==='Sent';if(view==='Unread')return row.status==='Inbox'&&row.unread===true;if(view==='Needs reply')return row.status==='Inbox'&&row.needs_reply===true;if(view==='Starred')return row.starred===true;return row.status==='Inbox';}
  private sourceViews(view:MailView):('Inbox'|'Sent')[]{return view==='Starred'?['Inbox','Sent']:view==='Sent'?['Sent']:['Inbox'];}
  private viewKey(mailbox:'info'|'support',view:'Inbox'|'Sent'){return`${mailbox}:${view}`;}
  setMailbox(box:MailboxId){if(this.activeMailbox()===box)return;this.activeMailbox.set(box);this.selected.set(null);void this.loadMail();}
  setView(view:MailView){if(this.activeView()===view)return;this.activeView.set(view);this.selected.set(null);void this.loadMail();}
  ensureSelection(){queueMicrotask(()=>{const selected=this.selected();if(selected&&!this.visibleRows().some(row=>row.id===selected.id&&row.mailbox===selected.mailbox))this.closeMail();});}
  private hydrateMailCache(){
    let hydrated=false;
    for(const mailbox of ['info','support'] as const){
      for(const view of ['Inbox','Sent'] as const){
        const messages=this.email.peekList(mailbox,view);
        if(messages===null)continue;
        this.absorbBatch(mailbox,view,messages);this.loadedViews.add(this.viewKey(mailbox,view));hydrated=true;
      }
    }
    if(hydrated){this.updateInboxCounts();this.countsReady.set(true);this.mailReady.set(true);}
  }
  private async initializeMail(){
    this.mailLoading.set(true);this.mailError.set('');
    try{
      await Promise.all([this.fetchView('info','Inbox',true),this.fetchView('support','Inbox',true)]);
      this.updateInboxCounts();
      this.countsReady.set(true);this.mailReady.set(true);
      void Promise.allSettled([this.fetchView('info','Sent',this.email.isListStale('info','Sent')),this.fetchView('support','Sent',this.email.isListStale('support','Sent'))]);
    }catch(e){this.mailError.set(String((e as Error)?.message||e));this.mailReady.set(true);}
    finally{this.mailLoading.set(false);}
  }
  private fetchView(mailbox:'info'|'support',view:'Inbox'|'Sent',refresh=false):Promise<void>{
    const key=this.viewKey(mailbox,view);
    if(this.loadedViews.has(key)&&!refresh)return Promise.resolve();
    const pending=this.viewLoads.get(key);if(pending)return pending;
    const request=this.email.list(mailbox,view,refresh).then(messages=>{this.absorbBatch(mailbox,view,messages);this.loadedViews.add(key);if(!this.mailReady())this.mailReady.set(true);if(view==='Inbox')this.updateInboxCounts();}).finally(()=>this.viewLoads.delete(key));
    this.viewLoads.set(key,request);return request;
  }
  private absorbBatch(mailbox:'info'|'support',view:'Inbox'|'Sent',messages:GmailMessageRow[]){
    const current=this.rows();const existing=new Map(current.map(row=>[`${row.mailbox}:${row.id}`,row]));
    const incoming=messages.map(message=>{const base=this.toMailRow(message);const old=existing.get(`${mailbox}:${message.id}`);return old?{...base,body:old.body,html_body:old.html_body,images_blocked:old.images_blocked,attachments:old.attachments,ai_state:old.ai_state,linked_order:old.linked_order,intent:old.intent,needs_reply:old.needs_reply,confidence:old.confidence,draft_reply:old.draft_reply,ai_summary:old.ai_summary,review_reason:old.review_reason}:base;});
    const status=view==='Sent'?'Sent':'Inbox';
    const kept=current.filter(row=>!(row.mailbox===mailbox&&row.status===status));
    this.rows.set([...kept,...incoming].sort((a,b)=>this.dateValue(b.received_at)-this.dateValue(a.received_at)));
  }
  private updateInboxCounts(){const rows=this.rows();this.mailboxInboxCounts.set({info:rows.filter(row=>row.mailbox==='info'&&row.status==='Inbox').length,support:rows.filter(row=>row.mailbox==='support'&&row.status==='Inbox').length});}
  private async loadMail(){
    const view=this.activeView();
    const box=this.activeMailbox();const keys:('info'|'support')[]=box==='all'?['info','support']:[box];
    const sources=this.sourceViews(view);
    const missing=keys.some(key=>sources.some(source=>!this.loadedViews.has(this.viewKey(key,source))));
    if(!missing){if(keys.some(key=>sources.some(source=>this.email.isListStale(key,source))))void this.refreshMail();return;}
    this.mailLoading.set(true);this.mailError.set('');
    try{await Promise.all(keys.flatMap(key=>sources.map(source=>this.fetchView(key,source))));this.mailReady.set(true);if(sources.includes('Inbox'))this.countsReady.set(true);}
    catch(e){this.mailError.set(String((e as Error)?.message||e));}
    finally{this.mailLoading.set(false);}
  }
  async refreshMail(){
    if(this.mailLoading())return;
    const sources=this.sourceViews(this.activeView());
    const box=this.activeMailbox();const keys:('info'|'support')[]=box==='all'?['info','support']:[box];
    this.mailLoading.set(true);this.mailError.set('');
    try{await Promise.all(keys.flatMap(key=>sources.map(source=>this.fetchView(key,source,true))));this.mailReady.set(true);if(sources.includes('Inbox')){this.updateInboxCounts();this.countsReady.set(true);}}
    catch(e){this.mailError.set(String((e as Error)?.message||e));}
    finally{this.mailLoading.set(false);}
  }
  private toMailRow(row:GmailMessageRow):MailRow{
    return {...row,body:'',ai_state:'Not analysed',linked_order:null,intent:null,needs_reply:false,confidence:null,draft_reply:'',time:this.formatMailTime(row.received_at)};
  }
  closeMail(){
    const shouldPopHistory=this.readerHistoryPushed&&history.state?.wcMailReader===true;
    this.selectionVersion++;this.bodyLoading.set('');this.readerHistoryPushed=false;this.cancelReply();this.selected.set(null);
    if(shouldPopHistory)history.back();
  }
  async openMail(mail:MailRow){
    if(!this.selected()){
      history.pushState({wcMailReader:true,id:mail.id,mailbox:mail.mailbox},'',window.location.href);
      this.readerHistoryPushed=true;
    }
    await this.showMail(mail);
  }
  private async showMail(mail:MailRow){
    const version=++this.selectionVersion;const loadingKey=`${mail.mailbox}:${mail.id}`;
    this.cancelReply();this.bodyLoading.set(mail.body?'':loadingKey);this.selected.set(mail);
    let current=mail;
    try{
      if(!mail.body){const full=await this.email.getMessage(mail.mailbox,mail.id);current={...mail,body:this.normalizeMessageBody(full.body,mail.preview),html_body:full.html||'',images_blocked:full.imagesBlocked===true,attachments:full.attachments||[],received_at:full.date||mail.received_at,time:this.formatMailTime(full.date||mail.received_at),unread:full.unread??mail.unread,starred:full.starred??mail.starred};this.rows.update(rows=>rows.map(row=>row.id===mail.id&&row.mailbox===mail.mailbox?current:row));}
      if(version!==this.selectionVersion||this.selected()?.id!==mail.id||this.selected()?.mailbox!==mail.mailbox)return;
      this.bodyLoading.set('');this.selected.set(current);
      if(current.status==='Inbox'&&current.unread){current=this.patchMail(current,{unread:false});try{await this.email.modify(current.mailbox,current.id,'markRead');}catch(e){current=this.patchMail(current,{unread:true});throw e;}}
      if(version!==this.selectionVersion||this.selected()?.id!==mail.id||this.selected()?.mailbox!==mail.mailbox)return;
      if(current.status==='Inbox'&&current.ai_state==='Not analysed')void this.analyseMail(current);
    }catch(e){if(version===this.selectionVersion)this.mailError.set(String((e as Error)?.message||e));}
    finally{if(version===this.selectionVersion&&this.bodyLoading()===loadingKey)this.bodyLoading.set('');}
  }
  private async analyseMail(mail:MailRow){
    try{
      const candidates=this.orderCandidates(mail);
      const result=await this.emailAi.analyse({mailbox:mail.mailbox,correspondent:mail.correspondent,email:mail.email,subject:mail.subject,body:mail.body||mail.preview},candidates);
      const state:AiState=result.review_required?'Review':(result.needs_reply?'Draft ready':'Auto handled');
      const updated:MailRow={...mail,ai_state:state,intent:result.intent as MailIntent,linked_order:result.linked_order,confidence:result.confidence,needs_reply:result.needs_reply,draft_reply:result.draft_reply,ai_summary:result.summary,review_reason:result.review_reason||null};
      this.rows.update(rows=>rows.map(row=>row.id===mail.id&&row.mailbox===mail.mailbox?updated:row));if(this.selected()?.id===mail.id&&this.selected()?.mailbox===mail.mailbox)this.selected.set(updated);
    }catch(e){console.warn('Email AI analysis failed',e);}
  }
  private orderCandidates(mail:MailRow){
    const email=mail.email.toLowerCase();const name=mail.correspondent.toLowerCase();const subject=(mail.subject+' '+mail.body+' '+mail.preview).toLowerCase();
    return this.orders.orders().map(order=>{let score=0;if((order.buyer_email||'').toLowerCase()===email)score+=100;if(name&&((order.customer_name||'').toLowerCase().includes(name)||name.includes((order.customer_name||'').toLowerCase())))score+=20;if(subject.includes(String(order.order_number).toLowerCase()))score+=200;return{score,order};}).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,8).map(({order})=>({order_number:order.order_number,customer_name:order.customer_name,buyer_email:order.buyer_email,payment_status:order.payment_status,fulfillment_status:order.fulfillment_status,delivery_type:order.delivery_type,delivery_title:order.delivery_title,buyer_note:order.buyer_note,total:order.total,items:(order.wc_order_items||[]).map(item=>({product_name:item.product_name,quantity:item.quantity,options:item.wix_options,production:(item.wc_production_units||[]).map(unit=>unit.production_status)}))}));
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
  messageActionBusy(){return this.messageAction()!=='';}
  private patchMail(mail:MailRow,patch:Partial<MailRow>){
    const updated={...mail,...patch};
    this.rows.update(rows=>rows.map(row=>row.id===mail.id&&row.mailbox===mail.mailbox?{...row,...patch}:row));
    if(this.selected()?.id===mail.id&&this.selected()?.mailbox===mail.mailbox)this.selected.set({...this.selected()!,...patch});
    return updated;
  }
  async modifyMessage(mail:MailRow,action:'markRead'|'markUnread'|'archive'|'trash'|'star'|'unstar'){
    if(this.messageActionBusy())return;
    this.messageAction.set(action);this.messageActionStatus.set('');
    const previous={unread:mail.unread,starred:mail.starred};
    let optimistic:Partial<MailRow>|null=null;
    if(action==='markRead')optimistic={unread:false};
    if(action==='markUnread')optimistic={unread:true};
    if(action==='star')optimistic={starred:true};
    if(action==='unstar')optimistic={starred:false};
    if(optimistic)this.patchMail(mail,optimistic);
    try{
      await this.email.modify(mail.mailbox,mail.id,action);
      if(action==='archive'||action==='trash'){
        this.rows.update(rows=>rows.filter(row=>!(row.id===mail.id&&row.mailbox===mail.mailbox)));
        this.updateInboxCounts();
        this.closeMail();
      }else{
        this.messageActionStatus.set(action==='star'?'Starred':action==='unstar'?'Star removed':action==='markUnread'?'Marked unread':'Marked read');
        setTimeout(()=>{if(!this.messageActionBusy())this.messageActionStatus.set('');},1200);
      }
    }catch(e){
      if(optimistic)this.patchMail(mail,previous);
      this.messageActionStatus.set(`Error: ${String((e as Error)?.message||e)}`);
    }finally{this.messageAction.set('');}
  }
  async displayExternalImages(mail:MailRow){
    const version=++this.selectionVersion;const key=`${mail.mailbox}:${mail.id}`;this.bodyLoading.set(key);this.mailError.set('');
    try{
      const full=await this.email.getMessage(mail.mailbox,mail.id,true);
      const patch:Partial<MailRow>={body:this.normalizeMessageBody(full.body,mail.preview),html_body:full.html||'',images_blocked:false,attachments:full.attachments||mail.attachments||[]};
      this.rows.update(rows=>rows.map(row=>row.id===mail.id&&row.mailbox===mail.mailbox?{...row,...patch}:row));
      if(version===this.selectionVersion&&this.selected()?.id===mail.id&&this.selected()?.mailbox===mail.mailbox)this.selected.set({...this.selected()!,...patch});
    }catch(e){if(version===this.selectionVersion)this.mailError.set(String((e as Error)?.message||e));}
    finally{if(version===this.selectionVersion)this.bodyLoading.set('');}
  }
  async downloadAttachment(mail:MailRow,attachment:GmailAttachment){
    this.messageActionStatus.set(`Downloading ${attachment.filename}…`);
    try{const blob=await this.email.downloadAttachment(mail.mailbox,mail.id,attachment);const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=attachment.filename||'attachment';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);this.messageActionStatus.set('Downloaded');}
    catch(e){this.messageActionStatus.set(`Error: ${String((e as Error)?.message||e)}`);}
  }
  selectComposeFiles(event:Event){
    const files=Array.from((event.target as HTMLInputElement).files||[]).slice(0,10);const total=files.reduce((sum,file)=>sum+file.size,0);
    if(total>15*1024*1024){this.composeAttachments.set([]);this.composeStatus.set('Error: attachments must be under 15 MB total');(event.target as HTMLInputElement).value='';return;}
    this.composeStatus.set('');this.composeAttachments.set(files);
  }
  composeAttachmentSize(){return this.attachmentSize(this.composeAttachments().reduce((sum,file)=>sum+file.size,0));}
  attachmentSize(size:number){if(size<1024)return`${size} B`;if(size<1024*1024)return`${Math.round(size/1024)} KB`;return`${(size/1024/1024).toFixed(1)} MB`;}
  startCompose(){
    const box=this.activeMailbox();
    this.composeMailbox.set(box==='support'?'support':'info');
    this.composeTo.set('');this.composeSubject.set('');this.composeText.set('');this.composeAttachments.set([]);this.composeStatus.set('');this.composeOpen.set(true);
  }
  cancelCompose(){
    if(this.composeSending())return;
    this.composeOpen.set(false);this.composeTo.set('');this.composeSubject.set('');this.composeText.set('');this.composeAttachments.set([]);this.composeStatus.set('');
  }
  canSendCompose(){return this.composeTo().trim().includes('@')&&!!this.composeSubject().trim()&&!!this.composeText().trim();}
  async sendCompose(){
    if(!this.canSendCompose()||this.composeSending())return;
    const mailbox=this.composeMailbox();
    this.composeSending.set(true);this.composeStatus.set('Sending…');
    try{
      await this.email.send(mailbox,this.composeTo().trim(),this.composeSubject().trim(),this.composeText(),this.composeAttachments());
      this.composeStatus.set('Sent');
      this.loadedViews.delete(this.viewKey(mailbox,'Sent'));
      void this.fetchView(mailbox,'Sent').catch(e=>console.warn('Sent refresh failed',e));
      setTimeout(()=>{this.composeOpen.set(false);this.composeTo.set('');this.composeSubject.set('');this.composeText.set('');this.composeAttachments.set([]);this.composeStatus.set('');},700);
    }catch(e){this.composeStatus.set(`Error: ${String((e as Error)?.message||e)}`);}
    finally{this.composeSending.set(false);}
  }
  startReply(mail:MailRow){
    this.replyMode.set('reply');this.forwardTo.set('');this.sendStatus.set('');this.replyText.set(mail.draft_reply||'');
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
      this.loadedViews.delete(this.viewKey(mail.mailbox,'Sent'));
      void this.fetchView(mail.mailbox,'Sent').catch(e=>console.warn('Sent refresh failed',e));
      this.sendStatus.set('Sent');
      this.replyText.set('');this.forwardTo.set('');
      setTimeout(()=>{this.replyMode.set('none');this.sendStatus.set('');},900);
    }catch(e){this.sendStatus.set(`Error: ${String((e as Error)?.message||e)}`);}
    finally{this.sending.set(false);}
  }
  private dateValue(value:string){const n=Date.parse(value);return Number.isFinite(n)?n:0;}
  private normalizeMessageBody(value:string|undefined,fallback:string){
    const source=(value||'').replace(/&(#\d+|#x[0-9a-f]+|nbsp|amp|lt|gt|quot|apos|rsquo|lsquo|rdquo|ldquo|ndash|mdash|hellip);/gi,entity=>this.decodeMailEntity(entity)).replace(/\u00a0/g,' ').replace(/\r/g,'');
    const lines=source.split('\n').map(line=>line.replace(/[\u2000-\u200f\u2028-\u202f\u205f\u3000]/g,' ').replace(/[ \t]+/g,' ').trim()).filter(Boolean);
    const numericLines=lines.filter(line=>/^\d{1,2}$/.test(line)).length;
    const cleaned=(numericLines>=4?lines.filter(line=>!/^\d{1,2}$/.test(line)):lines).join('\n').trim();
    const letters=(cleaned.match(/[a-z]/gi)||[]).length;
    return cleaned&&letters>=Math.min(12,Math.max(3,cleaned.length/10))?cleaned:(fallback||cleaned||'Message content is unavailable.');
  }
  private decodeMailEntity(entity:string){
    const value=entity.slice(1,-1).toLowerCase();if(value.startsWith('#x'))return String.fromCodePoint(parseInt(value.slice(2),16));if(value.startsWith('#'))return String.fromCodePoint(parseInt(value.slice(1),10));
    return({nbsp:' ',amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",rsquo:'’',lsquo:'‘',rdquo:'”',ldquo:'“',ndash:'–',mdash:'—',hellip:'…'} as Record<string,string>)[value]||entity;
  }
  private formatMailTime(value:string){const d=new Date(value);if(Number.isNaN(d.getTime()))return value;const now=new Date();if(d.toDateString()===now.toDateString())return d.toLocaleTimeString('en-AU',{hour:'numeric',minute:'2-digit'});return d.toLocaleDateString('en-AU',{day:'numeric',month:'short'});}
  countFor(view:MailView){const box=this.activeMailbox();return this.rows().filter(row=>this.belongsToView(row,view)&&(box==='all'||row.mailbox===box)).length;}
  mailboxCount(box:MailboxId){const c=this.mailboxInboxCounts();if(box==='info')return c.info;if(box==='support')return c.support;return c.info+c.support;}
  mailboxAddress(box:'info'|'support'){return box==='info'?'info@whitecorner.com.au':'support@whitecorner.com.au';}
  mailboxShort(box:'info'|'support'){return box==='info'?'info@':'support@';}
  activeMailboxLabel(){const box=this.activeMailbox();return box==='all'?'All mail':this.mailboxAddress(box);}
  folderGlyph(view:MailView){if(view==='Inbox')return'▣';if(view==='Unread')return'●';if(view==='Needs reply')return'↩';if(view==='Starred')return'★';return'➤';}
  confidenceLabel(value:number){return`${Math.round(value*100)}%`;}
  aiSeverity(state?:AiState):'success'|'info'|'warn'|'secondary'{if(state==='Auto handled')return'success';if(state==='Draft ready')return'info';if(state==='Review')return'warn';return'secondary';}
  policySeverity(mode:PolicyMode):'success'|'info'|'warn'{if(mode==='Auto later')return'success';if(mode==='Draft + review')return'info';return'warn';}
  modeCount(mode:PolicyMode){return this.intentPolicies.filter(policy=>policy.mode===mode).length;}
}
