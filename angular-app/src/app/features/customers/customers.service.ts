import {Injectable,signal} from '@angular/core';
import {SupabaseService} from '../../core/services/supabase.service';
import {environment} from '../../../environments/environment';

export interface WixContact {
  id:string; createdDate?:string; updatedDate?:string;
  primaryInfo?:{email?:string;phone?:string};
  primaryEmail?:{email?:string;subscriptionStatus?:string};
  primaryPhone?:{phone?:string;formattedPhone?:string;subscriptionStatus?:string};
  lastActivity?:{activityDate?:string;activityType?:string};
  info?:{name?:{first?:string;last?:string};company?:string;labelKeys?:{items?:string[]};extendedFields?:{items?:Record<string,unknown>}};
}
@Injectable({providedIn:'root'})
export class CustomersService {
  readonly contacts=signal<WixContact[]>([]);
  readonly loading=signal(false);readonly error=signal('');readonly loaded=signal(false);
  readonly syncing=signal(false);readonly syncedAt=signal<string|null>(null);
  constructor(private readonly supabase:SupabaseService){}
  async load(refresh=false){
    if(this.loading())return;
    this.loading.set(true);this.error.set('');this.syncing.set(false);
    try{
      const {data:state,error:stateError}=await this.supabase.client.from('wc_wix_contacts_sync').select('total,synced_at').maybeSingle();
      if(stateError)throw new Error('Could not read saved contact status. Check the database migration and retry.');
      if(refresh||!state){
        this.syncing.set(true);
        const {data,error}=await this.supabase.client.functions.invoke(environment.wixSyncFunction,{body:{action:'syncContacts'}});
        if(error){const detail=await error.context?.json?.().catch(()=>null);throw new Error(detail?.error||'Could not update contacts from Wix. Try again.');}
        if(data?.error||!data?.ok)throw new Error(data?.error||'Wix contact update was not confirmed. Try again.');
      }
      const {data:current,error:currentError}=await this.supabase.client.from('wc_wix_contacts_sync').select('total,synced_at').maybeSingle();
      if(currentError||!current)throw new Error('Saved contact status is unavailable. Try again.');
      const contacts:WixContact[]=[];
      for(let start=0;start<current.total;start+=500){
        const {data,error}=await this.supabase.client.from('wc_wix_contacts').select('wix_contact_id,contact').order('wix_contact_id').range(start,start+499);
        if(error||!data)throw new Error('Could not read saved contacts. Try again.');
        contacts.push(...data.map(row=>row.contact as WixContact));
      }
      if(contacts.length!==current.total||new Set(contacts.map(c=>c.id)).size!==current.total)throw new Error('Saved contacts are incomplete. Try again.');
      const {data:after,error:afterError}=await this.supabase.client.from('wc_wix_contacts_sync').select('total,synced_at').maybeSingle();
      if(afterError||after?.synced_at!==current.synced_at||after?.total!==current.total)throw new Error('Contacts changed while loading. Try again.');
      this.contacts.set(contacts);this.syncedAt.set(current.synced_at);this.loaded.set(true);
    }catch(error){this.error.set(error instanceof Error?error.message:'Could not load contacts.');}
    finally{this.loading.set(false);this.syncing.set(false);}
  }
}
