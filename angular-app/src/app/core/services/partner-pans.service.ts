import { Injectable, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { partnerPans } from '../../../../../supabase/functions/_shared/delivery-review-domain';

@Injectable({providedIn:'root'})
export class PartnerPansService {
 readonly rows=signal<any[]>([]);
 readonly loading=signal(false);
 readonly busy=signal(false);
 readonly error=signal('');
 constructor(private supabase:SupabaseService){}
 async load(){
  if(this.loading()||this.busy())return;
  this.loading.set(true);this.error.set('');
  try{
   const rows:any[]=[];
   // Paginate items, rather than embedded order arrays, so no lines are truncated.
   for(let start=0;;start+=250){
    const {data,error}=await this.supabase.client.from('wc_order_items')
     .select('*,wc_orders!inner(id,order_number,customer_name,wix_created_at,is_hidden),wc_partner_pans(*)')
     .eq('wc_orders.is_hidden',false).neq('wc_orders.order_number','10242').order('id').range(start,start+249);
    if(error)throw Error('Pans report could not be loaded. Check that the Pans migration is installed.');
    for(const source of data||[]){
     const {wc_orders:order,wc_partner_pans:saved,...item}=source;
     const pans=partnerPans(item);if(!pans.choices.length)continue;
     const record=Array.isArray(saved)?saved[0]:saved;
     rows.push({order,item,pans,record,status:record?.selection_key===pans.key?record.status:'pending',changed:!!record&&record.selection_key!==pans.key});
    }
    if((data||[]).length<250)break;
   }
   this.rows.set(rows.sort((a,b)=>String(b.order.wix_created_at||'').localeCompare(String(a.order.wix_created_at||''))));
  }catch(e:any){this.error.set(e.message);}finally{this.loading.set(false);}
 }
 async setStatus(row:any,status:'pending'|'ordered_and_sent'){
  if(this.busy()||this.loading())return false;
  this.busy.set(true);this.error.set('');
  try{
   const {data,error}=await this.supabase.client.rpc('wc_set_partner_pans_status',{
    p_item_id:row.item.id,p_source:row.item,p_selection_key:row.pans.key,p_status:status,
   });
   if(error||!data)throw Error(error?.message||'Status was not confirmed. Refresh before retrying.');
   this.rows.update(rows=>rows.map(r=>r.item.id===row.item.id?{...r,record:data,status:data.status,changed:false}:r));
   return true;
  }catch(e:any){this.error.set(e.message);return false;}finally{this.busy.set(false);}
 }
}
