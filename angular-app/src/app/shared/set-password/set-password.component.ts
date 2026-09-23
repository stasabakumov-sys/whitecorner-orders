import {Component,signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {SupabaseService} from '../../core/services/supabase.service';

@Component({selector:'app-set-password',standalone:true,imports:[FormsModule],template:`
 <div class="setup"><form (submit)="save($event)"><h1>Set your Hub password</h1><p>Choose a password to finish setting up your account.</p>
  <label>Password<input type="password" name="password" [(ngModel)]="password" minlength="12" required autocomplete="new-password" [disabled]="busy()"></label>
  <label>Confirm password<input type="password" name="confirm" [(ngModel)]="confirm" minlength="12" required autocomplete="new-password" [disabled]="busy()"></label>
  <button type="submit" [disabled]="busy()">{{busy()?'Saving password…':'Save password'}}</button>
  @if(error()){<p class="error" role="alert">{{error()}}</p>}
  @if(success()){<p role="status">{{success()}}</p>}
 </form></div>`,styles:[`
 .setup{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;background:#eef1f5;padding:16px}.setup form{box-sizing:border-box;width:min(100%,420px);background:#fff;border:1px solid #e4e7ec;border-radius:14px;padding:28px}.setup h1{margin:0 0 8px;font-size:1.35rem}.setup p{color:#475467}.setup label{display:flex;flex-direction:column;gap:5px;margin:12px 0}.setup input{padding:10px;border:1px solid #d4d9e2;border-radius:8px}.setup button{padding:9px 14px;border:0;border-radius:8px;background:#116dff;color:#fff;cursor:pointer}.error{color:#991b1b!important}
 `]})
export class SetPasswordComponent {
 password='';confirm='';readonly busy=signal(false);readonly error=signal('');readonly success=signal('');
 constructor(private db:SupabaseService){}
 async save(event:Event){event.preventDefault();this.error.set('');this.success.set('');
  if(this.password.length<12){this.error.set('Use at least 12 characters.');return;}
  if(this.password!==this.confirm){this.error.set('Passwords do not match.');return;}
  this.busy.set(true);
  try{const {error}=await this.db.client.auth.updateUser({password:this.password});if(error)throw error;
   this.password='';this.confirm='';this.success.set('Password saved. Your Hub account is ready.');
   const url=new URL(window.location.href);url.searchParams.delete('setup');url.hash='';window.history.replaceState(null,'',url.pathname+url.search);
   window.location.reload();
  }catch(e){this.error.set(`Could not save password. ${(e as Error)?.message||'Check the connection and retry.'}`);}
  finally{this.busy.set(false);}
 }
}
