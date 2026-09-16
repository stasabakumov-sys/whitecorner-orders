import { Injectable, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import {composeModularPackages,expandVariant,packagingError,variantSignature,findPackagingProfile} from '../../../../../supabase/functions/_shared/delivery-review-domain';
import { ReviewPackage, reviewComponents, reviewInputKey, reviewOutcome, reviewSignature } from '../../../../../supabase/functions/_shared/delivery-review-domain';

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
 async variantTarget(item:any,order?:any){
  let signature='',profile:any=null;
  for(const candidate of new Set([variantSignature(item),reviewSignature(order||{wc_order_items:[item]},this.rules())])){
   const {data,error}=await findPackagingProfile(this.supabase.client,candidate);
   if(error)throw Error('Could not check saved packaging. Please try again.');
   if(data){profile=data;signature=data.signature||candidate;break;}
  }
  if(!profile)throw Error('No packaging variant for this product and its options is saved in Shipping Data. Add boxes here to prepare this order.');
  if(!profile.shipping_product_id)return {productName:item.product_name,signature};
  const {data:product,error:productError}=await this.supabase.client.from('wc_shipping_products').select('id').eq('id',profile.shipping_product_id).eq('active',true).maybeSingle();
  if(productError)throw Error('Could not check the shipping product. Please try again.');
  if(!product)throw Error('The shipping product is unavailable. Add boxes here to prepare this order.');
  return {productId:product.id,signature};
 }
 async variantPackages(item:any,order:any={wc_order_items:[item]}){
  const composition={wc_order_items:Array.isArray(order?.wc_order_items)&&order.wc_order_items.length?order.wc_order_items:[item]};
  const target=reviewComponents(composition,this.rules());
  const {data,error}=await findPackagingProfile(this.supabase.client,variantSignature(item));
  if(error)throw Error('Could not load packaging variant.');
  let boxes=data?expandVariant(data.packages,item,this.rules()):[];
  if(packagingError(boxes,target))boxes=[];
  if(!boxes.length){
   const [products,templates,rules,mainVariants]=await Promise.all([
    this.supabase.client.from('wc_shipping_products').select('id,wix_product_id,product_name,product_type,manual_sizes,active').eq('active',true),
    this.supabase.client.from('wc_shipping_packages').select('*').eq('active',true).order('package_no'),
    this.supabase.client.from('wc_shipping_rules').select('*').eq('active',true).eq('effect_type','Add package'),
    this.supabase.client.from('wc_delivery_packaging_profiles').select('*').eq('template_item->>profile_scope','cart-main'),
   ]);
   if(products.error||templates.error||rules.error||mainVariants.error)throw Error('Could not load modular Cart packaging. Please try again.');
   boxes=composeModularPackages(composition,products.data||[],templates.data||[],rules.data||[],this.rules(),mainVariants.data||[]);
  }
  if(!boxes.length)throw Error('No complete profile or modular Cart packaging matches this product. Configure it in Shipping Data.');
  const issue=packagingError(boxes,target);
  if(issue)throw Error(`Cart packaging is incomplete: ${issue} Complete the missing Base or option box once in Shipping Data.`);
  return boxes;
 }
 async requotePackages(row:any,packages:ReviewPackage[],saveProfile:boolean){return this.perform({action:'requote-packages',orderId:row.order_id,expectedVersion:row.updated_at,confirmRequote:true,packages,saveProfile});}
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
