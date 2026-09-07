// Shared by Hub and Edge Functions; no Angular or external runtime dependencies.
export interface OrderItemRow {
 id:string; product_name?:string|null; quantity?:number|null; unit_price?:number|null;
 wix_options?:Record<string,unknown>|null; custom_text_fields?:Record<string,unknown>|null;
 description_lines?:unknown[]|null; catalog_reference?:Record<string,unknown>|null; raw_item?:Record<string,unknown>|null;
}

const TECHNICAL_KEYS = /^(?:id|_id|appId|catalogItemId|variantId|productId|lineItemId|subscriptionOptionId)$/i;

function scalar(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  if (typeof value !== 'object') return '';
  const obj = value as Record<string, unknown>;
  for (const key of ['original','translated','value','name','description','text','plainText','plainTextValue','label','title']) {
    const candidate = scalar(obj[key]);
    if (candidate) return candidate;
  }
  return '';
}

function addObject(out: string[], source: unknown): void {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return;
  for (const [key, raw] of Object.entries(source as Record<string, unknown>)) {
    if (TECHNICAL_KEYS.test(key)) continue;
    const value = scalar(raw);
    if (value) out.push(`${key}: ${value}`);
  }
}

function addDescriptionLines(out: string[], lines: unknown): void {
  if (!Array.isArray(lines)) return;
  for (const line of lines) {
    if (typeof line === 'string') {
      const value = line.trim();
      if (value) out.push(value);
      continue;
    }
    if (!line || typeof line !== 'object') continue;
    const obj = line as Record<string, unknown>;
    const label = scalar(obj['name'] ?? obj['label'] ?? obj['title']);
    const value = scalar(obj['value'] ?? obj['description'] ?? obj['text'] ?? obj['plainText'] ?? obj['plainTextValue'] ?? obj['colorInfo']);
    if (label && value && label !== value) out.push(`${label}: ${value}`);
    else if (value) out.push(value);
  }
}

function addWixOptionsContainer(out: string[], source: unknown): void {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return;
  const obj = source as Record<string, unknown>;
  const wrapperKeys = ['options','customTextFields','custom_text_fields','selectedOptions','selected_options','choices','lineItemOptions'];
  let usedWrapper = false;
  for (const key of wrapperKeys) {
    if (obj[key] != null) {
      addObject(out, obj[key]);
      usedWrapper = true;
    }
  }
  // For non-managed Wix variants the option-name/value pairs may live directly here.
  // Managed variants may expose only variantId; technical IDs are intentionally hidden.
  if (!usedWrapper) addObject(out, obj);
}

export function orderItemOptionLabels(item: OrderItemRow, limit = 12): string[] {
  const out: string[] = [];

  addObject(out, item.wix_options);
  addObject(out, item.custom_text_fields);
  addDescriptionLines(out, item.description_lines);

  const catalog = item.catalog_reference;
  if (catalog && typeof catalog === 'object') {
    const c = catalog as Record<string, unknown>;
    addWixOptionsContainer(out, c['options']);
  }

  const raw = item.raw_item ?? {};
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    for (const key of ['options','selectedOptions','selected_options','choices','customTextFields','custom_text_fields','lineItemOptions']) {
      addObject(out, r[key]);
    }
    for (const key of ['descriptionLines','description_lines']) addDescriptionLines(out, r[key]);

    const rawCatalog = r['catalogReference'];
    if (rawCatalog && typeof rawCatalog === 'object') {
      const rc = rawCatalog as Record<string, unknown>;
      addWixOptionsContainer(out, rc['options']);
    }
  }

  return [...new Set(out.map(x => x.trim()).filter(x=>!!x&&!isLogoFileInstruction(x)))].slice(0, limit);
}


export interface PackageComponent {
  id:string; order_item_id:string; product_name:string; component_key:string; component_name:string;
  unit_index:number; quantity:number; profile_item_key:string; wix_product_id:string|null;
}
export const componentNormal=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export const isLogoFileInstruction=(text:string)=>/^please email us (?:a )?ready to use svg\b/.test(componentNormal(text));
export const isLogoOption=(name:string)=>/^(?:add )?logo(?: or personali[sz]ation)?$/.test(componentNormal(name));
export function productId(item:OrderItemRow){const c=item.catalog_reference as any,r=item.raw_item as any;return String(c?.catalogItemId||c?.productId||r?.catalogReference?.catalogItemId||r?.productId||'');}
const attribute=/^(colou?r|size|dimensions?|width|height|length|finish|foldable|material|personalisation|personalization|engraving|notes?|message)$/i;
// Pans are supplied directly by a partner, never packed with our cart.
export const isPartnerPansOption=(name:string)=>componentNormal(name)==='pans';
export const isPartnerPansComponent=(c:{component_key?:string})=>c.component_key==='option:pans';
export const isNonPackagingComponent=(c:{component_key?:string;component_name?:string})=>isPartnerPansComponent(c)||
 ((c.component_key||'').startsWith('option:')&&(isLogoOption(c.component_key!.slice(7))||isLogoFileInstruction(c.component_key!.slice(7))))||isLogoFileInstruction(c.component_name||'');
export function partnerPans(item:OrderItemRow){
 const choices=[...new Set(orderItemOptionLabels(item,Number.MAX_SAFE_INTEGER).flatMap(label=>{
  const split=label.indexOf(':');if(split<0||!isPartnerPansOption(label.slice(0,split)))return [];
  const value=label.slice(split+1).trim(),normal=componentNormal(value);
  if(!normal||/^(no|none|false|0|not required|not selected)$/.test(normal)||/\bwithout\b.*\bpans?\b/.test(normal)||/\bno\s+(?:steel\s+|metal\s+|stainless\s+steel\s+)?pans?\b/.test(normal))return [];
  return [value];
 }))];
 const quantity=Math.max(1,Math.floor(Number(item.quantity)||1));
 return {choices,quantity,key:JSON.stringify([choices.map(componentNormal).sort(),quantity])};
}
export function packageComponents(items:OrderItemRow[],ignored:(name:string,value:string)=>boolean=()=>false):PackageComponent[]{
 const occurrences=new Map<string,number>();
 return items.flatMap(item=>{
  const labels=orderItemOptionLabels(item,Number.MAX_SAFE_INTEGER).filter(label=>!isLogoOption(label.split(':')[0]));
  const signature=JSON.stringify([productId(item)||componentNormal(item.product_name||''),[...new Set(labels.map(componentNormal))].sort()]);
  const occurrence=occurrences.get(signature)||0;occurrences.set(signature,occurrence+1);
  const profile_item_key=signature+':'+occurrence;
  const components=new Map<string,{name:string,count:number}>([['main',{name:item.product_name||'Unnamed product',count:1}]]);
  for(const label of labels){
   const split=label.indexOf(':');if(split<0)continue;
   const name=label.slice(0,split).trim(),value=label.slice(split+1).trim();
   if(isPartnerPansOption(name)||attribute.test(name)||/^(no|none|false|not selected|not required|without|0)(\b|$)/i.test(value)||ignored(name,value))continue;
   const numeric=/^\d+$/.test(value)?Number(value):1;if(numeric<1)continue;
   const key='option:'+componentNormal(name);
   if(!components.has(key))components.set(key,{name:name+( /^(yes|true)$/i.test(value)?'':': '+value),count:numeric});
  }
  const qty=Math.max(1,Math.floor(Number(item.quantity)||1));
  return [...components].flatMap(([component_key,c])=>Array.from({length:qty*c.count},(_,n)=>({
   id:`${item.id}:${component_key}:${n+1}`,order_item_id:item.id,product_name:item.product_name||'Unnamed product',
   component_key,component_name:c.name,unit_index:n+1,quantity:1,profile_item_key,wix_product_id:productId(item)||null,
  })));
 });
}
export const componentIdentity=(c:{order_item_id:string;component_key?:string;unit_index?:number})=>`${c.order_item_id}:${c.component_key||'main'}:${c.unit_index||1}`;
export const packagingSignature=(items:OrderItemRow[])=>JSON.stringify(packageComponents(items).map(c=>[c.profile_item_key,c.component_key,c.unit_index]).sort());


export interface ReviewPackage {
 package_name:string; length_mm:number; width_mm:number; height_mm:number; weight_kg:number;
 contents:PackageComponent[];
}
export const deliveryLine=(i:OrderItemRow)=>/^(delivery|shipping)(\s+(fee|charge))?$/i.test((i.product_name||'').trim());
export const cents=(n:unknown):number|null=>n===null||n===undefined||n===''||!Number.isFinite(Number(n))||Number(n)<0?null:Math.round(Number(n)*100);
export function deliveryCents(order:any) {
 // Wix priceSummary.shipping is before tax even when taxIncludedInPrices=true.
 // The shipping cost's after-tax total is already GST inclusive: never add 10% again.
 const amount=(v:any)=>cents(v?.amount??v);
 const shipping=amount(order.raw_order?.shippingInfo?.cost?.totalPriceAfterTax)??cents(order.shipping); if(shipping===null)return null;
 const lines=(order.wc_order_items||[]).filter(deliveryLine);
 const totals=lines.map((i:any)=>amount(i.raw_item?.totalPriceAfterTax)??(cents(i.unit_price)===null?null:cents(i.unit_price)!*Math.max(1,Number(i.quantity)||1)));
 if(totals.some((n:number|null)=>n===null))return null;
 return shipping+totals.reduce((n:number,total:number)=>n+total,0);
}
export function reviewItems(order:any,rules:any[]=[]):OrderItemRow[]{
 return (order.wc_order_items||[]).filter((i:OrderItemRow)=>!deliveryLine(i)&&!rules.some(r=>r.active!==false&&r.effect_type==='No effect'&&!r.match_value&&componentNormal(r.match_name||'')===componentNormal(i.product_name||'')));
}
export function reviewComponents(order:any,rules:any[]=[]){
 return packageComponents(reviewItems(order,rules),(name,value)=>rules.some(r=>r.active!==false&&r.effect_type==='No effect'&&componentNormal(r.match_name||'')===componentNormal(name)&&(!r.match_value||componentNormal(r.match_value)===componentNormal(value))));
}
export function reviewSignature(order:any,rules:any[]=[]){return packagingSignature(reviewItems(order,rules));}
export function packagingError(packages:ReviewPackage[],components:PackageComponent[]):string {
 if(!components.length)return 'No shippable components were found.';
 if(!Array.isArray(packages)||!packages.length||packages.length>100)return 'Add and confirm packages for every component.';
 const known=new Set(components.map(c=>c.id)),assigned=new Set<string>();
 for(const [n,p] of packages.entries()){
  if(['length_mm','width_mm','height_mm','weight_kg'].some(k=>!Number.isFinite(Number((p as any)[k]))||Number((p as any)[k])<=0))return `Package ${n+1}: positive dimensions and weight are required.`;
  if(!Array.isArray(p.contents)||!p.contents.length)return `Package ${n+1}: assign its components.`;
  const ids=p.contents.map(componentIdentity);
  if(ids.some(id=>!known.has(id))||new Set(ids).size!==ids.length)return `Package ${n+1}: invalid or duplicate components.`;
  ids.forEach(id=>assigned.add(id));
 }
 const missing=components.filter(c=>!assigned.has(c.id));
 return missing.length?'Not assigned to any package: '+missing.map(c=>`${c.component_name} · Unit ${c.unit_index}`).join(', '):'';
}
export function restoreReviewPackages(templates:any[],components:PackageComponent[]):ReviewPackage[]{
 return templates.map(p=>({...p,contents:(p.contents||[]).flatMap((c:any)=>{
  const match=components.find(x=>x.profile_item_key===c.profile_item_key&&x.component_key===c.component_key&&x.unit_index===c.unit_index);
  return match?[match]:[];
 })}));
}
function addressScalar(v:any){return String(typeof v==='object'&&v?v.code||v.shortName||v.name||'':v||'').trim();}
export function destination(order:any){
 const a=order.delivery_address||{};
 const state=addressScalar(a.subdivision||a.state||a.region).toUpperCase().replace(/^AU[-\s]/,'');
 const states:Record<string,string>={'QUEENSLAND':'QLD','VICTORIA':'VIC','NEW SOUTH WALES':'NSW','TASMANIA':'TAS','SOUTH AUSTRALIA':'SA','WESTERN AUSTRALIA':'WA','NORTHERN TERRITORY':'NT','AUSTRALIAN CAPITAL TERRITORY':'ACT'};
 return {suburb:addressScalar(a.city||a.suburb||a.locality).toUpperCase(),state:states[state]||state,postcode:addressScalar(a.postalCode||a.postcode||a.zipCode),country:addressScalar(a.country)||'AU'};
}
export function eligibleOrder(order:any){
 const declared=`${order.delivery_type||''} ${order.delivery_title||''}`;
 return !order.is_hidden&&!order.archived&&!/cancel/i.test(order.wix_status||'')&&String(order.fulfillment_status||'').toUpperCase()!=='FULFILLED'
 && !/pick[ -]?up/i.test(declared)&&!((order.wc_order_items||[]).some(deliveryLine)&&deliveryCents(order)===0);
}
export function goodsCents(order:any){
 const items=(order.wc_order_items||[]).filter((i:OrderItemRow)=>!deliveryLine(i));
 if(items.some((i:any)=>cents(i.unit_price)===null))throw Error('Goods value is missing.');
 const total=items.reduce((s:number,i:any)=>s+cents(i.unit_price)!*Math.max(1,Number(i.quantity)||1),0);
 const result=total>0?total:cents(order.subtotal);if(result===null)throw Error('Goods value is missing.');return result;
}
export function reviewInputKey(order:any,rules:any[]=[]){
 const stable=(value:any):any=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value;
 return JSON.stringify([reviewSignature(order,rules),stable(order.delivery_address||{}),destination(order),order.currency,goodsCents(order),reviewComponents(order,rules).map(c=>c.id).sort()]);
}
export function buildReviewRequest(order:any,packages:ReviewPackage[]){
 const d=destination(order);
 if(!d.suburb||!['QLD','NSW','VIC','TAS','SA','WA','NT','ACT'].includes(d.state)||!/^\d{4}$/.test(d.postcode)||!['AU','Australia','AUS'].includes(d.country))throw Error('Complete Australian delivery suburb, state and postcode are required.');
 return {pickupSuburb:'BURLEIGH HEADS',pickupState:'QLD',pickupPostcode:4220,pickupBuildingType:'commercial',isPickupTailLift:false,
 destinationSuburb:d.suburb,destinationState:d.state,destinationPostcode:Number(d.postcode),destinationBuildingType:'residential',isDropOffTailLift:false,isDropOffPOBox:false,
 items:packages.map(p=>({type:'box',weight:Number(p.weight_kg),length:Number(p.length_mm)/10,width:Number(p.width_mm)/10,height:Number(p.height_mm)/10,quantity:1,contents:'General/Others'}))};
}
export function allowedCarrier(name:unknown){
 // Exact normalized aliases only; TNT is not implicitly FedEx.
 return ['aramex','couriers please','couriersplease','fedex','fed ex'].includes(String(name||'').trim().toLowerCase().replace(/\s+/g,' '));
}
export function insuranceFor(labels:unknown[],goodsIncludingGstCents:number){
 const value=Math.round(goodsIncludingGstCents/1.1);
 const tiers=labels.flatMap((label,tier)=>{
  if(typeof label!=='string')return [];
  const cover=label.match(/(?:up\s*to|upto)\s*\$\s*([\d,]+(?:\.\d+)?)/i),fee=label.match(/^\s*\+\s*\$?\s*([\d,]+(?:\.\d+)?)/);
  if(!cover||(!/free/i.test(label)&&!fee))return [];
  return [{tier,label,cover_cents:Math.round(Number(cover[1].replaceAll(',',''))*100),fee_cents:value>45000&&!/free/i.test(label)?Math.round(Number(fee![1].replaceAll(',',''))*100):0}];
 }).filter(t=>t.cover_cents>=value).sort((a,b)=>a.cover_cents-b.cover_cents);
 return tiers[0]||null;
}
export function evaluateQuotes(quotes:any[],insurance:ReturnType<typeof insuranceFor>){
 return quotes.map(raw=>{
  const q=raw&&typeof raw==='object'?raw:{raw};
  const price=cents(q.priceIncludingGst),allowed=allowedCarrier(q.courierName);
  const reason=!allowed?'Carrier excluded by policy':!insurance?'Insufficient insurance cover':price===null?'Missing GST-inclusive price':null;
  return {quote:q,eligible:!reason,reason,price_cents:price,insurance_fee_cents:insurance?.fee_cents??null,total_cents:price!==null&&insurance?price+insurance.fee_cents:null};
 });
}
export function reviewOutcome(review:any,order:any,currentKey?:string){
 if(review.state==='approved_without_quote'){
  const a=review.approval;
  const valid=!review.quote_attempted_at&&a?.kind==='without_quote'&&a.input_key===currentKey&&a.invoice_cents===deliveryCents(order);
  return {status:valid?'approved_without_quote':'data_changed',best:null,minimum_invoice_cents:null};
 }
 if(review.state!=='quoted')return {status:review.state,best:null,minimum_invoice_cents:null};
 const best=(review.evaluated_quotes||[]).filter((q:any)=>q.eligible&&Number.isInteger(q.total_cents)).sort((a:any,b:any)=>a.total_cents-b.total_cents)[0]||null;
 if(currentKey&&review.input_key!==currentKey)return {status:'data_changed',best,minimum_invoice_cents:null};
 if(!best)return {status:'no_eligible_quotes',best,minimum_invoice_cents:null};
 const invoice=deliveryCents(order);
 if(invoice===null)return {status:'invoice_required',best,minimum_invoice_cents:null};
 const minimum=Math.ceil(best.total_cents*10/9);
 const approved=review.approval?.kind!=='without_quote'&&review.approval?.input_key===review.input_key&&review.approval?.invoice_cents===invoice;
 return {status:best.total_cents*10<=invoice*9?'within_target':approved?'approved_exception':'price_review_required',best,minimum_invoice_cents:minimum};
}


export const hasSizeOption=(item:any)=>orderItemOptionLabels(item,Number.MAX_SAFE_INTEGER).some(label=>componentNormal(label.split(':')[0])==='size');
export const variantItem=(item:any)=>({...item,quantity:1});
export const variantSignature=(item:any)=>packagingSignature([variantItem(item)]);
// Templates describe one physical product. Duplicate boxes, never dimensions,
// for quantity > 1; assign each copy to its own physical component units.
export function expandVariant(packages:any[],item:any,rules:any[]=[]){
 const one=reviewComponents({wc_order_items:[variantItem(item)]},rules);
 const restored=restoreReviewPackages(packages,one);
 if(packagingError(restored,one))return [];
 const all=reviewComponents({wc_order_items:[item]},rules),qty=Math.max(1,Math.floor(Number(item.quantity)||1));
 return Array.from({length:qty},(_,index)=>restored.map(p=>({...p,contents:p.contents.map(c=>{
  const perUnit=one.filter(x=>x.component_key===c.component_key).length;
  return all.find(x=>x.component_key===c.component_key&&x.unit_index===index*perUnit+c.unit_index)!;
 })}))).flat();
}
