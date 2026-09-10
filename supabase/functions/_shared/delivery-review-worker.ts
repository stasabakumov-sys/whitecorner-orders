import {resolveCourierContents} from './courier-contents.ts';
import { buildReviewRequest, componentNormal, eligibleOrder, evaluateQuotes, goodsCents, insuranceFor, packagingError, productId, restoreReviewPackages, reviewComponents, reviewInputKey, reviewItems, reviewSignature } from './delivery-review-domain.ts';
import {expandVariant, hasSizeOption, variantSignature, findPackagingProfile, canonicalPackagingSignature} from './delivery-review-domain.ts';

function checked(result:any){if(result.error)throw Error(result.error.message);return result.data;}
export async function reviewContext(db:any,orderId:string){
 const [order,rules]=await Promise.all([
  db.from('wc_orders').select('*,wc_order_items(*)').eq('id',orderId).single(),
  db.from('wc_shipping_rules').select('match_name,match_value,effect_type,active').eq('active',true).eq('effect_type','No effect'),
 ]);
 return {order:checked(order),rules:checked(rules)||[]};
}
export async function courierReviewCall(route:'quotes'|'insurance-list'|'package-contents-list',payload:any,apiKey:string,baseUrl:string,fetcher:typeof fetch=fetch){
 const response=await fetcher(`${baseUrl.replace(/\/$/,'')}/api/${route}`,{
  method:route==='quotes'?'POST':'GET',headers:{Accept:'application/json','Content-Type':'application/json','Secret-Key':apiKey},
  ...(route==='quotes'?{body:JSON.stringify(payload)}:{}),signal:AbortSignal.timeout(90000),
 });
 const raw=await response.text();let body:any;
 try{body=JSON.parse(raw);}catch{body={status:false,message:'Non-JSON courier response',raw};}
 return {http_status:response.status,body};
}

// The durable attempted_at guard is committed BEFORE the one permitted POST.
// Even a timeout or failure to persist the response never reopens this guard.
export async function processDeliveryReview(db:any,orderId:string,call:(route:'quotes'|'insurance-list'|'package-contents-list',payload:any)=>Promise<any>){
 const token=crypto.randomUUID();
 const claimed=checked(await db.rpc('wc_claim_delivery_review',{p_order_id:orderId,p_token:token}));
 if(!claimed)return;
 const save=async(patch:any)=>checked(await db.from('wc_delivery_reviews').update({...patch,updated_at:new Date().toISOString()}).eq('order_id',orderId).eq('token',token).select('order_id').single());
 let attempted=false;
 try{
  const {order,rules}=await reviewContext(db,orderId);
  if(!eligibleOrder(order)){await save({state:'excluded',token:null});return;}
  if(order.currency!=='AUD'){await save({state:'failed',error:'Only AUD orders can be evaluated.',token:null});return;}
  const review=checked(await db.from('wc_delivery_reviews').select('*').eq('order_id',orderId).single());
  const components=reviewComponents(order,rules),signature=reviewSignature(order,rules);
  let packages=review.packages||[];
  if(!packages.length){
   const profile=checked(await findPackagingProfile(db,signature));
   if(profile)packages=restoreReviewPackages(profile.packages,components);
   else {
    const variantPackages:any[]=[];
    for(const item of reviewItems(order,rules)){
     const variant=checked(await findPackagingProfile(db,variantSignature(item)));
     if(variant)variantPackages.push(...expandVariant(variant.packages,item,rules));
    }
    if(!packagingError(variantPackages,components))packages=variantPackages;
    if(!packages.length){
    // Existing exact composition profiles created in Fulfilment are reusable.
    const templates=checked(await db.from('wc_shipping_packages').select('*').eq('active',true).eq('source_type','Base').order('package_no'))||[];
    const groups=new Map<string,any[]>();
    for(const p of templates)groups.set(p.shipping_product_id,[...(groups.get(p.shipping_product_id)||[]),p]);
    for(const group of groups.values()){
     if(group.every(p=>p.contents?.length&&p.contents.every((c:any)=>canonicalPackagingSignature(c.profile_signature||'')===signature))){
      const candidate=restoreReviewPackages(group,components);
      if(!packagingError(candidate,components)){packages=candidate;break;}
     }
    }
    // Legacy product-only templates are safe to expand only when the item has
    // no separately packable addons. Never guess which box holds an addon.
    if(!packages.length){
     const products=checked(await db.from('wc_shipping_products').select('id,wix_product_id,product_name').eq('active',true))||[];
     const candidate:any[]=[];
     for(const item of reviewItems(order,rules)){
      if(hasSizeOption(item))continue; // Never apply size-agnostic legacy boxes.
      const units=components.filter(c=>c.order_item_id===item.id);
      if(units.some(c=>c.component_key!=='main'))continue;
      const product=products.find((p:any)=>productId(item)?p.wix_product_id===productId(item):!p.wix_product_id&&componentNormal(p.product_name)===componentNormal(item.product_name||''));
      const base=product&&groups.get(product.id);
      if(!base?.length||base.some((p:any)=>p.contents?.some((c:any)=>c.profile_signature)))continue;
      for(const unit of units)for(const p of base)candidate.push({...p,contents:[unit]});
     }
     if(!packagingError(candidate,components))packages=candidate;
    }
    }
   }
  }
  const error=packagingError(packages,components);
  if(error){await save({state:'packaging_required',error,token:null});return;}
  let request:any;
  try{request=buildReviewRequest(order,packages);}catch{await save({state:'address_required',error:'Complete the Australian delivery address in Wix. No quote has been requested.',packages,token:null});return;}
  try {
   request=resolveCourierContents(request,await call('package-contents-list',null));
  } catch(error) {
   await save({state:'failed',error:error instanceof Error?error.message:'Fast Courier package content types unavailable. No quote requested.',token:null});return;
  }
  const insuranceResponse=await call('insurance-list',null);
  if(insuranceResponse.http_status<200||insuranceResponse.http_status>=300||insuranceResponse.body?.status!==true||!Array.isArray(insuranceResponse.body.data)){
   await save({state:'failed',error:'Insurance options unavailable. No quote requested.',insurance_response:insuranceResponse,token:null});return;
  }
  const insurance=insuranceFor(insuranceResponse.body.data,goodsCents(order));
  if(!insurance){await save({state:'failed',error:'No insurance tier covers the goods value. No quote requested.',insurance_response:insuranceResponse,token:null});return;}
  const snapshot={input_key:reviewInputKey(order,rules),signature,packages,insurance,goods_including_gst_cents:goodsCents(order),
   assumptions:{destination_building_type:'residential',pickup_tail_lift:false,dropoff_tail_lift:false,collection_date:'Not sent for this initial estimate; the existing quotes request has no collectionDate field.'}};
  const current=await reviewContext(db,orderId);
  if(reviewInputKey(current.order,current.rules)!==snapshot.input_key){await save({state:'packaging_required',error:'Order inputs changed during preparation. Confirm packaging for the updated order.',packages:[],token:null});return;}
  // Atomic compare-and-set also protects against accidental future call-site retries.
  checked(await db.from('wc_delivery_reviews').update({state:'calculating',quote_attempted_at:new Date().toISOString(),request,snapshot,input_key:snapshot.input_key,packages,insurance_response:insuranceResponse,error:null})
   .eq('order_id',orderId).eq('token',token).is('quote_attempted_at',null).select('order_id').single());
  attempted=true;
  const response=await call('quotes',request);
  // Persist the complete answer before interpreting any provider-specific data.
  await save({response,quoted_at:new Date().toISOString()});
  const success=response.http_status>=200&&response.http_status<300&&response.body?.status===true&&Array.isArray(response.body.data);
  await save({response,evaluated_quotes:evaluateQuotes(Array.isArray(response.body?.data)?response.body.data:[],insurance),
   state:success?'quoted':'failed',quoted_at:new Date().toISOString(),error:success?null:'Fast Courier rejected or could not complete the quote request. Saved response is available; no automatic retry.',token:null});
 }catch{
  // A stopped process leaves calculating + attempted_at. The UI treats an old
  // in-flight attempt as uncertain, never as permission to quote again.
  await save({state:attempted?'uncertain':'failed',error:attempted?'Quote response could not be confirmed or saved. No repeat request will be sent.':'Preparation failed before quote request. Review the source data.',token:null}).catch(()=>undefined);
 }
}

export async function processDeliveryQueue(db:any,call:(route:'quotes'|'insurance-list'|'package-contents-list',payload:any)=>Promise<any>){
 const rows=checked(await db.from('wc_delivery_reviews').select('order_id').in('state',['pending','packaging_required','address_required','calculating']).is('quote_attempted_at',null).order('updated_at').limit(5))||[];
 // Parallel independent orders; each has its own durable claim. A slow quote
 // cannot consume the entire worker lifetime before another order starts.
 await Promise.all(rows.map((r:any)=>processDeliveryReview(db,r.order_id,call)));
}
