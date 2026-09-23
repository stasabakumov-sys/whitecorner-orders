import {Component,OnInit} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {HubMembersService} from '../../core/services/hub-members.service';
import {SupabaseService} from '../../core/services/supabase.service';

@Component({selector:'app-users',standalone:true,imports:[FormsModule],template:`
 <section class="users-page"><h1>Users</h1><p class="sub">Invite employees and review Hub access.</p>
 @if(members.loading()){<p role="status">Loading users…</p>}
 @if(members.error()){<p class="error" role="alert">{{members.error()}} <button type="button" (click)="members.load()">Retry</button></p>}
 @if(members.manager()){
  <form (submit)="invite($event)" class="invite">
   <label>Name<input name="name" [(ngModel)]="name" maxlength="100" required [disabled]="busy" autocomplete="name"></label>
   <label>Email<input name="email" [(ngModel)]="email" type="email" maxlength="254" required [disabled]="busy" autocomplete="email"></label>
   <button type="submit" [disabled]="busy">{{busy?'Sending invitation…':'Invite employee'}}</button>
  </form>
  @if(error){<p class="error" role="alert">{{error}}</p>}
  @if(success){<p class="success" role="status">{{success}}</p>}
  <div class="list"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead><tbody>
   @for(member of members.members();track member.user_id){<tr><td>{{member.display_name}}</td><td>{{member.email}}</td><td>{{member.role==='manager'?'Manager':'Employee'}}</td></tr>}
  </tbody></table></div>
 }@else if(!members.loading()&&!members.error()){<p class="error" role="alert">Manager access is required to add users.</p>}
 </section>`,styles:[`
 :host{display:block}.users-page{max-width:920px}.users-page h1{margin:0}.sub{color:var(--wc-muted);margin:4px 0 18px}.invite{display:flex;flex-wrap:wrap;align-items:end;gap:10px;margin-bottom:14px}.invite label{display:flex;flex-direction:column;gap:4px;font-size:.85rem}.invite input{min-height:36px;box-sizing:border-box;border:1px solid var(--wc-border);border-radius:8px;padding:6px 9px;background:#fff}.invite button{min-height:36px;border:1px solid var(--wc-border);border-radius:8px;padding:6px 12px;background:#fff;cursor:pointer}.list{border:1px solid var(--wc-border);border-radius:12px;background:#fff;overflow:auto}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:10px;border-bottom:1px solid var(--wc-border)}tr:last-child td{border-bottom:0}.error{color:#991b1b;background:#fff1f1;border:1px solid #fecaca;border-radius:6px;padding:9px}.success{color:#166534}
 `]})
export class UsersComponent implements OnInit {
 name='';email='';busy=false;error='';success='';
 constructor(readonly members:HubMembersService,private db:SupabaseService){}
 ngOnInit(){void this.members.load();}
 async invite(event:Event){event.preventDefault();if(this.busy||!this.members.manager())return;
  this.error='';this.success='';const name=this.name.trim(),email=this.email.trim().toLowerCase();
  if(!name||!/^\S+@\S+\.\S+$/.test(email)){this.error='Enter the employee name and a valid email, then retry.';return;}
  this.busy=true;try{const {data,error}=await this.db.client.functions.invoke('hub-users',{body:{action:'invite',name,email}});
   if(error||!data?.ok){const detail=await error?.context?.json?.().catch(()=>null);throw Error(detail?.error||data?.error||error?.message||'Invitation was not confirmed.');}
   this.success=`Invitation sent to ${email}. The employee can open the email to set up access.`;this.name='';this.email='';await this.members.load();
  }catch(e){this.error=`Could not invite ${email}. ${(e as Error)?.message||'Check the connection and retry.'}`;}
  finally{this.busy=false;}
 }
}
