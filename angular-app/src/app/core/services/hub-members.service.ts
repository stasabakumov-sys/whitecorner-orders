import {Injectable,signal} from '@angular/core';
import {SupabaseService} from './supabase.service';

export interface HubMember {user_id:string;email:string;display_name:string;role:'manager'|'worker';active:boolean}

@Injectable({providedIn:'root'})
export class HubMembersService {
 readonly members=signal<HubMember[]>([]);
 readonly manager=signal(false);
 readonly loading=signal(false);
 readonly error=signal('');
 constructor(private db:SupabaseService){}
 async load(){this.loading.set(true);this.error.set('');
  try{const {data,error}=await this.db.client.from('wc_hub_members').select('user_id,email,display_name,role,active').eq('active',true).order('display_name');
   if(error)throw error;this.members.set((data||[]) as HubMember[]);
   const {data:user,error:authError}=await this.db.client.auth.getUser();if(authError)throw authError;
   this.manager.set(!!user.user&&this.members().some(member=>member.user_id===user.user.id&&member.role==='manager'));
  }catch(e){this.error.set((e as Error)?.message||'Could not load employees. Retry.');this.manager.set(false);}
  finally{this.loading.set(false);}
 }
 clear(){this.members.set([]);this.manager.set(false);this.error.set('');}
}
