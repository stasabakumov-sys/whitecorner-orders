import {Injectable,signal} from '@angular/core';
import {SupabaseService} from '../../core/services/supabase.service';
import {environment} from '../../../environments/environment';
import {OrderRow} from '../../core/models/order.models';

export function historyOrder(row:any):OrderRow{
  const o=row.raw_order, c=o.billingInfo?.contactDetails||o.shippingInfo?.logistics?.shippingDestination?.contactDetails||{};
  const money=(v:any)=>v?.amount!=null?Number(v.amount):null;
  const items=(o.lineItems||[]).map((li:any,i:number)=>({id:`history:${o.id}:${li.id||i}`,wix_line_item_id:li.id||String(i),product_name:li.productName?.original,quantity:Number(li.quantity??1),unit_price:money(li.price),catalog_reference:li.catalogReference,wix_options:li.catalogReference?.options?.options,custom_text_fields:li.catalogReference?.options?.customTextFields,description_lines:li.descriptionLines,image:li.media||li.image,raw_item:li}));
  const shipping=money(o.priceSummary?.shipping);
  const pickup=!!o.shippingInfo?.logistics?.pickupDetails||(!shipping&&items.some((i:any)=>/^(delivery|shipping)(\s+(fee|charge))?$/i.test(i.product_name||'')&&!i.unit_price));
  return{id:`history:${o.id}`,wix_order_id:o.id,is_history:true,order_number:String(o.number??''),wix_created_at:o.createdDate,wix_synced_at:row.synced_at,payment_status:o.paymentStatus,fulfillment_status:o.fulfillmentStatus,currency:o.currency,customer_name:[c.firstName,c.lastName].filter(Boolean).join(' '),buyer_email:o.buyerInfo?.email,company:c.company,phone:c.phone,delivery_type:pickup?'Pickup':'Delivery',delivery_title:o.shippingInfo?.title,delivery_address:o.shippingInfo?.logistics?.shippingDestination?.address||o.recipientInfo?.address,buyer_note:o.buyerNote,subtotal:money(o.priceSummary?.subtotal),shipping,tax:money(o.priceSummary?.tax),discount:money(o.priceSummary?.discount),total:money(o.priceSummary?.total),additional_fees:money(o.priceSummary?.totalAdditionalFees),activities:o.activities,raw_order:o,wc_order_items:items};
}
export function mergeOrderHistory(live:OrderRow[],history:OrderRow[]){
  const rows=new Map(history.map(o=>[o.wix_order_id||o.order_number,o]));
  for(const o of live)rows.set(o.wix_order_id||o.order_number,o);
  return [...rows.values()].sort((a,b)=>(Date.parse(b.wix_created_at||'')||0)-(Date.parse(a.wix_created_at||'')||0));
}
@Injectable({providedIn:'root'})
export class OrderHistoryService{
  readonly orders=signal<OrderRow[]>([]);readonly loading=signal(false);readonly importing=signal(false);readonly error=signal('');readonly progress=signal(0);readonly message=signal('');
  constructor(private readonly supabase:SupabaseService){}
  async load(){
    if(this.loading())return;this.loading.set(true);this.error.set('');
    const rows:OrderRow[]=[];
    try{for(let offset=0;;offset+=500){
      const {data,error}=await this.supabase.client.from('wc_wix_order_history').select('wix_order_id,order_number,wix_created_at,raw_order,synced_at').order('wix_order_id').range(offset,offset+499);
      if(error)throw new Error('Order history is unavailable. Please refresh after deployment.');
      rows.push(...(data||[]).map(historyOrder));if((data||[]).length<500)break;
    }this.orders.set(rows);}catch(error){this.error.set(error instanceof Error?error.message:'Could not load history');}finally{this.loading.set(false);}
  }
  async sync(){
    if(this.importing())return;this.importing.set(true);this.error.set('');this.message.set('');this.progress.set(0);
    let cursor:string|null=null;const seen=new Set<string>();
    try{while(true){
      const {data,error}=await this.supabase.client.functions.invoke(environment.wixSyncFunction,{body:{action:'importOrderHistory',cursor}});
      if(error){const detail=await error.context?.json?.().catch(()=>null);throw new Error(detail?.error||'Wix history import failed');}
      if(data?.ok!==true)throw new Error(data?.error||'History import was not confirmed');
      this.progress.update(n=>n+data.imported);
      if(data.complete===true&&data.nextCursor===null)break;
      if(typeof data.nextCursor!=='string'||seen.has(data.nextCursor))throw new Error('History pagination stalled');
      cursor=data.nextCursor;seen.add(cursor!);
    }
    await this.load();if(!this.error())this.message.set(`Wix history loaded: ${this.progress()} orders processed.`);
    }catch(error){
      const failure=(error instanceof Error?error.message:'History import failed')+'. Imported pages are saved; retrying is safe.';
      await this.load();
      this.error.set(failure+(this.error()?` ${this.error()}`:''));
    }
    finally{this.importing.set(false);}
  }
}
