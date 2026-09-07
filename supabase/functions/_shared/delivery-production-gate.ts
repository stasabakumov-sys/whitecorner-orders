import { eligibleOrder, reviewInputKey, reviewOutcome } from './delivery-review-domain.ts';

export const releasedDeliveryStatuses=['within_target','approved_exception','approved_without_quote'];
export const unquotedApprovalStates=['pending','packaging_required','legacy_packaging_required','address_required','failed','approved_without_quote'];

export async function productionDecision(db:any,order:any,rules:any[],review:any){
 if(!eligibleOrder(order))return {allowed:true,status:'not_required'};
 const {data,error}=await db.from('wc_delivery_booking_exemptions').select('order_id').eq('order_id',order.id).maybeSingle();
 if(error)throw Error('Delivery approval could not be verified.');
 if(data)return {allowed:true,status:'ready_exemption'};
 let status='review_required';
 try {if(review)status=reviewOutcome(review,order,reviewInputKey(order,rules)).status;}catch{status='data_changed';}
 return {allowed:releasedDeliveryStatuses.includes(status),status};
}

export async function setReviewedProductionStatus(db:any,order:any,rules:any[],review:any,body:any,actor:string){
 if(!['New','CNC','Assembly','Painting','Packing','Ready'].includes(body.next)||!/^[\da-f-]{36}$/i.test(body.unitId||''))throw Error('Valid production unit and status required.');
 const decision=await productionDecision(db,order,rules,review);
 if(!decision.allowed)throw Error('Production blocked: add packaging and resolve Delivery Cost Review, or approve without a quote.');
 const {data,error}=await db.rpc('wc_set_reviewed_production_status',{
  p_order_id:order.id,p_unit_id:body.unitId,p_next:body.next,p_actor:actor,p_decision:decision.status,
  p_order_version:order.updated_at,p_items:order.wc_order_items,p_rules:rules,p_review_version:review?.updated_at||null,
 });
 if(error)throw Error('Order or delivery review changed. Reload before changing production status.');
 return data;
}
