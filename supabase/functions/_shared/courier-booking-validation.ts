import { goodsCents, insuranceFor, packagingError, reviewComponents } from './delivery-review-domain.ts';
import { reviewContext } from './delivery-review-worker.ts';

export async function shipmentPacking(db: any, column: string, id: string) {
  const {data:shipment,error}=await db.from('wc_shipments').select('*').eq(column,id).single();
  if(error||!shipment||!shipment.packages_approved_at||!['Ready to Quote','Quoted','Quote Selected'].includes(shipment.status))
    throw Error('Approve the current packing list before requesting quotes or booking.');
  const {data:packages,error:packageError}=await db.from('wc_shipment_packages').select('*').eq('shipment_id',shipment.id).order('package_no');
  if(packageError)throw Error('Packing list could not be verified.');
  const {order,rules}=await reviewContext(db,shipment.order_id);
  if(order.currency!=='AUD')throw Error('Only AUD shipments can be booked.');
  const issue=packagingError(packages||[],reviewComponents(order,rules));
  if(issue)throw Error(issue);
  return {shipment,packages,order};
}

export function assertQuotedPackages(request: any, packages: any[]) {
  const shape=(p:any)=>[Number(p.weight),Number(p.length),Number(p.width),Number(p.height),Number(p.quantity)];
  const expected=packages.map(p=>[Number(p.weight_kg),Number(p.length_mm)/10,Number(p.width_mm)/10,Number(p.height_mm)/10,1]);
  if(!Array.isArray(request?.items)||JSON.stringify(request.items.map(shape))!==JSON.stringify(expected))
    throw Error('Quote packages differ from the approved packing list. Request a new quote.');
}

export function validateBookingDetails(details: any, quote: any, order: any, labels: unknown[], confirmedTotalCents: unknown, now = new Date()) {
  if(!details||details.quoteId!==String(quote.id)||details.senderType!=='sender')throw Error('The selected quote must match the booking form.');
  const required=['pickupFirstName','pickupLastName','pickupEmail','pickupAddress1','pickupPhone','destinationFirstName','destinationLastName','destinationEmail','destinationAddress1','destinationPhone','pickupTimeWindow','parcelContent','emailForDocuments'];
  if(required.some(k=>typeof details[k]!=='string'||!details[k].trim()))throw Error('Complete the booking form.');
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Brisbane',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(details.collectionDate)||!Number.isFinite(Date.parse(details.collectionDate))||new Date(details.collectionDate).toISOString().slice(0,10)!==details.collectionDate||details.collectionDate<today)
    throw Error('Choose today or a future collection date.');
  if(['acceptInsuranceConditions','acceptTermConditions','acceptAttachment','acceptNoDangerousGoods','acceptReadFinancialServiceGuide'].some(k=>details[k]!==true))
    throw Error('Confirm the booking terms, insurance and absence of dangerous goods.');
  const goods=goodsCents(order),insurance=insuranceFor(labels,goods);
  if(!insurance)throw Error('Insurance cannot cover the goods value. Manual review required.');
  if(Math.round(Number(details.valueOfContent)*100)!==goods)throw Error('Declared goods value changed. Reopen the booking form.');
  const requiredInsurance=Math.round(goods/1.1)>45000;
  if(requiredInsurance && (details.extendedLiability!==String(insurance.tier)||details.insuranceValue!==`$${insurance.cover_cents/100}`||details.insuranceFee!==`$${(insurance.fee_cents/100).toFixed(2)}`))
    throw Error('Insurance changed. Review the current insurance tier.');
  if(!requiredInsurance && ['extendedLiability','insuranceValue','insuranceFee'].some(k=>details[k]!==undefined))throw Error('Review the free insurance selection.');
  if(quote.priceIncludingGst==null||!Number.isFinite(Number(quote.priceIncludingGst))||Number(quote.priceIncludingGst)<0)throw Error('Quote price unavailable.');
  const total=Math.round(Number(quote.priceIncludingGst)*100)+insurance.fee_cents;
  if(!Number.isSafeInteger(confirmedTotalCents)||confirmedTotalCents!==total)throw Error('Confirm the current total charge before booking.');
  return total;
}
