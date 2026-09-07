import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { productionDecision, setReviewedProductionStatus, unquotedApprovalStates } from '../_shared/delivery-production-gate.ts';
import { courierReviewCall, processDeliveryReview, reviewContext } from '../_shared/delivery-review-worker.ts';
import { deliveryCents, packagingError, reviewComponents, reviewInputKey, reviewOutcome, reviewSignature } from '../_shared/delivery-review-domain.ts';
import { variantSignature, productId } from '../_shared/delivery-review-domain.ts';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json'};
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 try{
  const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const db=createClient(url,key);
  const auth=req.headers.get('Authorization')||'';
  const {data:{user},error}=await db.auth.getUser(auth.replace(/^Bearer\s+/i,''));
  if(error||!user)return json({error:'Authentication required'},401);
  const body=await req.json();
  if(body.action==='save-packaging-variant'){
   const {data:product,error:productError}=await db.from('wc_shipping_products').select('id,product_name,wix_product_id').eq('id',body.productId).eq('active',true).single();
   if(productError||!product)return json({error:'Shipping product unavailable'},422);
   if(!Array.isArray(body.options)||body.options.length>40||body.options.some((o:any)=>typeof o.name!=='string'||!o.name.trim()||typeof o.value!=='string'||!o.value.trim()||o.name.length>100||o.value.length>500))return json({error:'Complete every option name and value'},422);
   if(new Set(body.options.map((o:any)=>o.name.trim().toLowerCase())).size!==body.options.length)return json({error:'Duplicate option names'},422);
   let catalogId=product.wix_product_id||'';
   if(!catalogId){
    const {data:source,error:sourceError}=await db.from('wc_order_items').select('id,product_name,catalog_reference,raw_item').eq('id',body.sourceItemId).single();
    if(sourceError||!source||source.product_name!==product.product_name)return json({error:'Choose an existing order composition for this product.'},422);
    catalogId=productId(source);
   }
   const item={id:product.id,source_item_id:body.sourceItemId||null,product_name:product.product_name,quantity:1,catalog_reference:catalogId?{catalogItemId:catalogId}:{},wix_options:Object.fromEntries(body.options.map((o:any)=>[o.name.trim(),o.value.trim()]))};
   const {data:rules,error:rulesError}=await db.from('wc_shipping_rules').select('match_name,match_value,effect_type,active').eq('active',true).eq('effect_type','No effect');
   if(rulesError)return json({error:'Packaging rules unavailable'},503);
   const components=reviewComponents({wc_order_items:[item]},rules||[]),issue=packagingError(body.packages,components);
   if(issue)return json({error:issue},422);
   const packages=body.packages.map((p:any)=>({package_name:String(p.package_name||'Package').slice(0,150),length_mm:Number(p.length_mm),width_mm:Number(p.width_mm),height_mm:Number(p.height_mm),weight_kg:Number(p.weight_kg),contents:p.contents.map((c:any)=>components.find(x=>x.order_item_id===c.order_item_id&&x.component_key===(c.component_key||'main')&&x.unit_index===(c.unit_index||1)))}));
   const {error}=await db.from('wc_delivery_packaging_profiles').upsert({signature:variantSignature(item),shipping_product_id:product.id,template_item:item,packages,created_by:user.id,updated_at:new Date().toISOString()});
   return error?json({error:'Variant could not be saved. Check the variant migration.'},409):json({ok:true});
  }
  if(!/^[\da-f-]{36}$/i.test(body.orderId||''))return json({error:'Valid order ID required'},422);
  const {order,rules}=await reviewContext(db,body.orderId);
  const {data:review,error:reviewError}=await db.from('wc_delivery_reviews').select('*').eq('order_id',body.orderId).maybeSingle();
  if(reviewError)return json({error:'Delivery review unavailable'},503);
  if(body.action==='production-check')return json(await productionDecision(db,order,rules,review));
  if(body.action==='production-status'){
   try{return json({ok:true,activity:await setReviewedProductionStatus(db,order,rules,review,body,user.id)});}
   catch(e){return json({error:(e as Error).message},409);}
  }
  if(!review)return json({error:'Delivery review unavailable'},404);
  if(body.action==='approve-without-quote'){
   if(review.quote_attempted_at||review.token||!unquotedApprovalStates.includes(review.state))return json({error:'An unquoted, idle delivery review is required.'},409);
   if(typeof body.reason!=='string'||body.reason.trim().length<3||body.reason.length>2000)return json({error:'Enter an approval reason (3–2000 characters).'},422);
   const {error}=await db.rpc('wc_approve_delivery_without_quote',{
    p_order_id:order.id,p_actor:user.id,p_reason:body.reason,p_input_key:reviewInputKey(order,rules),p_invoice_cents:deliveryCents(order),
    p_order_version:order.updated_at,p_items:order.wc_order_items,p_rules:rules,p_review_version:review.updated_at,
   });
   return error?json({error:'Review changed or approval is unavailable. Reload before approving.'},409):json({ok:true});
  }
  if(body.action==='packages'){
   if(Deno.env.get('DELIVERY_REVIEW_ENABLED')!=='true')return json({error:'Delivery estimates are not enabled yet.'},503);
   if(review.quote_attempted_at)return json({error:'The one-time quote has already been requested. Saved packaging is locked.'},409);
   const issue=packagingError(body.packages,reviewComponents(order,rules));
   if(issue)return json({error:issue},422);
   // Canonical component records prevent client-supplied labels or identities
   // from being persisted as authoritative product data.
   const components=reviewComponents(order,rules);
   const packages=body.packages.map((p:any)=>({package_name:String(p.package_name||'Package').slice(0,150),length_mm:Number(p.length_mm),width_mm:Number(p.width_mm),height_mm:Number(p.height_mm),weight_kg:Number(p.weight_kg),
    contents:p.contents.map((c:any)=>components.find(x=>x.order_item_id===c.order_item_id&&x.component_key===(c.component_key||'main')&&x.unit_index===(c.unit_index||1)))}));
   const {error}=await db.rpc('wc_save_delivery_packages',{p_order_id:body.orderId,p_packages:packages,p_signature:reviewSignature(order,rules),p_actor:user.id,p_save_profile:body.saveProfile===true,p_order_updated_at:order.updated_at,p_items:order.wc_order_items});
   if(error)return json({error:'Packaging could not be saved; reload the review.'},409);
   const apiKey=Deno.env.get('FAST_COURIER_API_KEY');
   if(!apiKey)return json({error:'Packaging saved. Fast Courier credentials are not configured; the automatic worker will process this later.'},503);
   await processDeliveryReview(db,body.orderId,(route,payload)=>courierReviewCall(route,payload,apiKey,Deno.env.get('FAST_COURIER_API_BASE_URL')||'https://enterprise-api.fastcourier.com.au'));
   return json({ok:true});
  }
  if(body.action==='approve'){
   const inputKey=reviewInputKey(order,rules),outcome=reviewOutcome(review,order,inputKey);
   if(outcome.status!=='price_review_required')return json({error:'Only an unchanged, priced review can be approved.'},409);
   if(typeof body.reason!=='string'||body.reason.trim().length<3||body.reason.length>2000)return json({error:'Enter an approval reason (3–2000 characters).'},422);
   const {error}=await db.rpc('wc_approve_delivery_review',{p_order_id:body.orderId,p_actor:user.id,p_reason:body.reason,p_input_key:inputKey,p_invoice_cents:deliveryCents(order),p_order_updated_at:order.updated_at,p_items:order.wc_order_items});
   return error?json({error:'Review changed; reload before approving.'},409):json({ok:true});
  }
  return json({error:'Unsupported action'},400);
 }catch{return json({error:'Delivery review failed. Reload to check its saved state; no automatic quote retry.'},500);}
});
