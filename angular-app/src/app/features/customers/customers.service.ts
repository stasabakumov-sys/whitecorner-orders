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
  readonly progress=signal(0);readonly expected=signal<number|null>(null);
  constructor(private readonly supabase:SupabaseService){}
  async load(){
    if(this.loading())return;
    this.loading.set(true);this.error.set('');this.progress.set(0);this.expected.set(null);
    const contacts=new Map<string,WixContact>();let offset=0;
    try{
      while(true){
        const {data,error}=await this.supabase.client.functions.invoke(environment.wixSyncFunction,{body:{action:'queryContacts',offset}});
        if(error){const detail=await error.context?.json?.().catch(()=>null);throw new Error(detail?.error||'Could not load Wix contacts. Please try again.');}
        if(data?.error)throw new Error(data.error);
        if(!Array.isArray(data?.contacts))throw new Error('Invalid contacts response.');
        const before=contacts.size;
        for(const contact of data.contacts){if(!contact.id)throw new Error('Contact ID is missing.');contacts.set(contact.id,contact);}
        this.progress.set(contacts.size);this.expected.set(data.total??null);
        if(data.nextOffset===null){
          if(data.total!=null&&contacts.size!==data.total)throw new Error('The contact list changed during loading. Refresh to retrieve the complete list.');
          break;
        }
        if(!Number.isSafeInteger(data.nextOffset)||data.nextOffset<=offset||contacts.size===before)throw new Error('Contact pagination stopped. Refresh to try again.');
        offset=data.nextOffset;
      }
      this.contacts.set([...contacts.values()]);this.loaded.set(true);
    }catch(error){this.error.set(error instanceof Error?error.message:'Could not load contacts.');}
    finally{this.loading.set(false);}
  }
}
