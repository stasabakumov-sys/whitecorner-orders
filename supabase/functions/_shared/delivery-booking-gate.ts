import { reviewInputKey, reviewOutcome } from './delivery-review-domain.ts';
import { reviewContext } from './delivery-review-worker.ts';
export async function assertDeliveryBookingAllowed(db:any,courierOrderId:string){
 const {data:shipment,error}=await db.from('wc_shipments').select('order_id,status').eq('courier_order_id',courierOrderId).single();
 if(error||!shipment||shipment.status!=='Quote Selected')throw Error('A unique selected Hub shipment is required before booking.');
 const {data:exemption,error:exemptionError}=await db.from('wc_delivery_booking_exemptions').select('order_id').eq('order_id',shipment.order_id).maybeSingle();
 if(exemptionError)throw Error('Delivery cost approval could not be verified. Booking was not sent.');
 if(exemption)return; // Fixed migration snapshot, never current Ready status.
 const {data:review,error:reviewError}=await db.from('wc_delivery_reviews').select('*').eq('order_id',shipment.order_id).maybeSingle();
 if(reviewError||!review)throw Error('Delivery Cost Review is required before booking.');
 const {order,rules}=await reviewContext(db,shipment.order_id);
 const result=reviewOutcome(review,order,reviewInputKey(order,rules));
 if(!['within_target','approved_exception','approved_without_quote'].includes(result.status))throw Error('Booking blocked: resolve Delivery Cost Review or approve the current delivery price first.');
}
