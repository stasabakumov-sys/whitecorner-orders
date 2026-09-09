import {DatePipe} from '@angular/common';
import {Component,computed,signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {DialogModule} from 'primeng/dialog';
import {CustomersService,WixContact} from './customers.service';

@Component({selector:'app-customers',standalone:true,imports:[DatePipe,FormsModule,DialogModule],template:`
  <header><div><h1>Customers</h1><p>All Wix contacts, including people without orders.</p></div><button (click)="customers.load()" [disabled]="customers.loading()">Refresh Wix</button></header>
  @if(customers.error()){<p class="notice error" role="alert">{{customers.error()}}</p>}
  @if(customers.loading()){<p class="notice" role="status">Loading contacts from Wix… {{customers.progress()}}@if(customers.expected()!==null){ / {{customers.expected()}}}</p>}
  <div class="filters">
    <select aria-label="Contact filter" [ngModel]="filter()" (ngModelChange)="filter.set($event);page.set(0)"><option value="all">All contacts ({{customers.contacts().length}})</option><option value="subscribed">Email subscribers</option><option value="member">Site members</option></select>
    <button disabled title="Not available yet">Manage View</button>
    <input aria-label="Search contacts" placeholder="Search name, email or phone…" [ngModel]="query()" (ngModelChange)="query.set($event);page.set(0)">
    <button disabled title="Import and export are not enabled">Import / Export</button>
  </div>
  <div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Member status</th><th>Labels</th><th><button class="sort" (click)="descending.set(!descending());page.set(0)">Last activity {{descending()?'↓':'↑'}}</button></th><th>Date created</th><th></th></tr></thead>
    <tbody>@for(c of rows();track c.id){<tr><td><button class="person" (click)="selected.set(c)"><span class="avatar">{{initials(c)}}</span>{{name(c)}}</button></td><td>{{email(c)||'—'}}@if(subscription(c)){<small>{{label(subscription(c))}}</small>}</td><td>{{phone(c)||'—'}}@if(c.primaryPhone?.subscriptionStatus){<small>{{label(c.primaryPhone!.subscriptionStatus!)}}</small>}</td><td>{{label(member(c))||'—'}}</td><td><span title="Label keys supplied by Wix">{{labels(c)||'—'}}</span></td><td>{{c.lastActivity?.activityDate?(c.lastActivity!.activityDate|date:'MMM d, yyyy':'+1000'):'—'}}</td><td>{{c.createdDate?(c.createdDate|date:'MMM d, yyyy':'+1000'):'—'}}</td><td><button (click)="selected.set(c)">View</button></td></tr>}
    @empty{<tr><td colspan="8">{{customers.loading()?'Loading…':customers.error()?'Contacts could not be loaded.':customers.loaded()?'No matching contacts.':'Contacts have not been loaded.'}}</td></tr>}
    </tbody></table></div>
  <footer><span>{{filtered().length}} contacts · Dates and statuses supplied by Wix</span><button [disabled]="page()===0" (click)="page.set(page()-1)">Previous</button><span>{{page()+1}} / {{pages()}}</span><button [disabled]="page()+1>=pages()" (click)="page.set(page()+1)">Next</button></footer>
  @if(selected();as c){<p-dialog [visible]="true" (visibleChange)="!$event&&selected.set(null)" [modal]="true" [header]="name(c)" [style]="{width:'560px',maxWidth:'95vw'}"><p class="notice">Read-only Wix contact.</p><dl><dt>Email</dt><dd>{{email(c)||'—'}}</dd><dt>Phone</dt><dd>{{phone(c)||'—'}}</dd><dt>Company</dt><dd>{{c.info?.company||'—'}}</dd><dt>Member status</dt><dd>{{label(member(c))||'Not supplied'}}</dd><dt>Email subscription</dt><dd>{{label(subscription(c))||'Not supplied'}}</dd><dt>Last activity</dt><dd>{{label(c.lastActivity?.activityType||'')||'Not supplied'}}</dd><dt>Contact ID</dt><dd>{{c.id}}</dd></dl></p-dialog>}
`,styles:[`h1{margin:0;font-size:22px;font-weight:600}header{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px}header p{color:#758198;font-size:13px}.filters{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:14px}button,input,select{font:inherit;font-size:13px;border:1px solid #dce5ef;border-radius:8px;padding:8px 12px;background:#fff;color:#344054}button{cursor:pointer}button:disabled{opacity:.5;cursor:not-allowed}.filters input{margin-left:auto;min-width:240px}.table-wrap{border:1px solid #e0e6ef;border-radius:12px;overflow:auto;background:#fff}table{border-collapse:collapse;width:100%;min-width:1100px;font-size:13px}th,td{text-align:left;border-bottom:1px solid #e7edf5;padding:15px 14px;max-width:240px;overflow-wrap:anywhere}th{background:#f6f8fa;font-weight:500}tr:last-child td{border:0}tbody tr:hover{background:#eef5ff}small{display:block;width:fit-content;border:1px solid #e3e8ef;color:#667085;font-size:10px;margin-top:3px;padding:1px 3px}.person{display:flex;gap:12px;align-items:center;text-align:left;border:0;background:transparent;padding:0}.avatar{border-radius:50%;width:34px;height:34px;flex-shrink:0;display:grid;place-items:center;background:#339ca5;color:#fff;font-size:11px}.sort{padding:0;border:0;background:transparent;white-space:nowrap}footer{display:flex;gap:12px;align-items:center;margin-top:14px;color:#758198;font-size:12px}footer>span:first-child{margin-right:auto}.notice{padding:12px;background:#edf5ff;border:1px solid #d7e6fa;border-radius:8px;font-size:13px}.error{background:#fff0ee;color:#a12622}dl{display:grid;grid-template-columns:140px 1fr;gap:14px;font-size:13px}dd{margin:0;overflow-wrap:anywhere}dt{color:#758198}`]})
export class CustomersComponent {
  readonly query=signal('');readonly filter=signal('all');readonly descending=signal(true);readonly page=signal(0);readonly selected=signal<WixContact|null>(null);
  readonly filtered=computed(()=>{const q=this.query().trim().toLowerCase();return this.customers.contacts().filter(c=>(!q||[this.name(c),this.email(c),this.phone(c)].join(' ').toLowerCase().includes(q))&&(this.filter()==='all'||this.filter()==='subscribed'&&this.subscription(c)==='SUBSCRIBED'||this.filter()==='member'&&['APPROVED','PENDING','BLOCKED','ACTIVE'].includes(this.member(c)))).sort((a,b)=>{const x=Date.parse(a.lastActivity?.activityDate||'')||0,y=Date.parse(b.lastActivity?.activityDate||'')||0;return(this.descending()?y-x:x-y)||a.id.localeCompare(b.id);});});
  readonly pages=computed(()=>Math.max(1,Math.ceil(this.filtered().length/50)));
  readonly rows=computed(()=>this.filtered().slice(Math.min(this.page(),this.pages()-1)*50,(Math.min(this.page(),this.pages()-1)+1)*50));
  constructor(readonly customers:CustomersService){if(!customers.loaded())void customers.load();}
  name(c:WixContact){return[c.info?.name?.first,c.info?.name?.last].filter(Boolean).join(' ')||this.email(c)||this.phone(c)||'Unnamed contact';}
  initials(c:WixContact){return this.name(c).split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase();}
  email(c:WixContact){return c.primaryEmail?.email||c.primaryInfo?.email||'';}
  phone(c:WixContact){return c.primaryPhone?.formattedPhone||c.primaryPhone?.phone||c.primaryInfo?.phone||'';}
  member(c:WixContact){return String(c.info?.extendedFields?.items?.['members.membershipStatus']||'');}
  subscription(c:WixContact){return c.primaryEmail?.subscriptionStatus||String(c.info?.extendedFields?.items?.['emailSubscriptions.subscriptionStatus']||'');}
  labels(c:WixContact){return c.info?.labelKeys?.items?.join(', ')||'';}
  label(s:string){return s.replace(/_/g,' ');}
}
