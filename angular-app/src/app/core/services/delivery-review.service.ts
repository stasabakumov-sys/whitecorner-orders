import { Injectable, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import {expandVariant,variantSignature} from '../../../../../supabase/functions/_shared/delivery-review-domain';
import { ReviewPackage, reviewComponents, reviewInputKey, reviewOutcome } from '../../../../../supabase/functions/_shared/delivery-review-domain';

@Injectable({providedIn:'root'})
export class DeliveryReviewService {
 readonly rows=signal<any[]>([]);
 readonly rules=signal<any[]>([]);
 readonly loading=signal(false);
 readonly busy=signal(false);
 readonly error=signal('');
 constructor(private supabase:SupabaseService){}
 async load(){
  this.loading.set(true);
  try{
   const [reviews,rules]=await Promise.all([
    this.savedReviews(),
    this.supabase.client.from('wc_shipping_rules').select('match_name,match_value,effect_type,active').eq('active',true).eq('effect_type','No effect'),
   ]);
   if(reviews.error||rules.error)throw Error('Delivery Cost Review could not be loaded. Check that its migration is installed.');
   this.rows.set(reviews.data||[]);this.rules.set(rules.data||[]);
  }catch(e:any){this.error.set(e.message);}finally{this.loading.set(false);}
 }
 private async savedReviews(){
  const rows:any[]=[];
  for(let start=0;;start+=250){
   const page=await this.supabase.client.from('wc_delivery_reviews').select('*,wc_orders(*,wc_order_items(*))').neq('state','excluded').order('created_at',{ascending:false}).order('order_id').range(start,start+249);
   if(page.error)return page;
   rows.push(...(page.data||[]));
   if((page.data||[]).length<250)return {data:[...new Map(rows.map(r=>[r.order_id,r])).values()],error:null};
  }
 }
 outcome(row:any){
  if(row.state==='calculating'&&Date.now()-Date.parse(row.quote_attempted_at)>180000)return {status:'uncertain',best:null,minimum_invoice_cents:null};
  try{return reviewOutcome(row,row.wc_orders,reviewInputKey(row.wc_orders,this.rules()));}
  catch{return {status:'data_changed',best:null,minimum_invoice_cents:null};}
 }
 components(row:any){return reviewComponents(row.wc_orders,this.rules());}
 async variantPackages(item:any){
  const {data,error}=await this.supabase.client.from('wc_delivery_packaging_profiles').select('packages').eq('signature',variantSignature(item)).maybeSingle();
  if(error)throw Error('Could not load packaging variant.');
  const boxes=data?expandVariant(data.packages,item,this.rules()):[];
  if(!boxes.length)throw Error('No complete profile matches this Size and the other options. Configure it in Shipping Data.');
  return boxes;
 }
 async savePackages(orderId:string,packages:ReviewPackage[],saveProfile:boolean){return this.perform({action:'packages',orderId,packages,saveProfile});}
 async approve(orderId:string,reason:string){return this.perform({action:'approve',orderId,reason});}
 async approveWithoutQuote(orderId:string,reason:string){return this.perform({action:'approve-without-quote',orderId,reason});}
 private async perform(body:any){
  if(this.busy())return false;
  this.busy.set(true);this.error.set('');
  try{
   const {data,error}=await this.supabase.client.functions.invoke('delivery-cost-review',{body});
   if(error){const detail=await error.context?.json?.().catch(()=>null);throw Error(detail?.error||'Request could not be confirmed. Reload to see the saved state.');}
   if(data?.error)throw Error(data.error);
   return true;
  }catch(e:any){this.error.set(e.message);return false;}
  finally{await this.load();this.busy.set(false);}
 }
}
