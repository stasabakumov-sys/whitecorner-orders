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
export function backdropPackagingKey(item:OrderItemRow):string{
 let size='',fold='';
 for(const label of orderItemOptionLabels(item,Number.MAX_SAFE_INTEGER)){
  const split=label.indexOf(':');if(split<0)continue;
  const name=componentNormal(label.slice(0,split)),value=label.slice(split+1).trim();
  if(['size','dimension','dimensions'].includes(name))size=value;
  if(name==='foldable')fold=value;
 }
 const match=size.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(mm|cm|m)?\s*[x×]\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)$/);
 if(!match)return '';
 const factor=(unit:string)=>unit==='m'?1000:unit==='cm'?10:1;
 const a=Number(match[1])*factor(match[2]||match[4]),b=Number(match[3])*factor(match[4]);
 if(!Number.isInteger(a)||!Number.isInteger(b)||a<=0||b<=0||a>10000||b>10000)return '';
 const normalized=componentNormal(fold).replace(/\s/g,'');
 const folding=['yes','true','foldable'].includes(normalized)?'foldable':['no','false','nonfoldable','unfoldable'].includes(normalized)?'nonfoldable':'';
 return folding?[a,b].sort((x,y)=>y-x).join('x')+':'+folding:'';
}
export const isLogoFileInstruction=(text:string)=>/^(?:please )?email us (?:a )?ready to use svg\b/.test(componentNormal(text));
export const isLogoOption=(name:string)=>/^(?:add )?logo(?: or personali[sz]ation)?$/.test(componentNormal(name));
export const isPackagingColourOption=(name:string)=>/^colou?r$/.test(componentNormal(name));
export const isPackagingDesignOption=(name:string)=>['front panel style','lower counter edge'].includes(componentNormal(name));
export const packagingOptionLabels=(item:OrderItemRow)=>orderItemOptionLabels(item,Number.MAX_SAFE_INTEGER).filter(label=>!isLogoOption(label.split(':')[0])&&!isPackagingColourOption(label.split(':')[0])&&!isPackagingDesignOption(label.split(':')[0]));
export function canonicalPackagingItemKey(key:string):string{
 try{
  const split=key.lastIndexOf(':'),parsed=JSON.parse(key.slice(0,split));
  if(!Array.isArray(parsed)||!Array.isArray(parsed[1]))return key;
  parsed[1]=parsed[1].filter((label:string)=>!/^colou?r\s/.test(label)&&! /^(front panel style|lower counter edge)(?:\s|$)/.test(label));
  return JSON.stringify(parsed)+key.slice(split);
 }catch{return key;}
}
export function canonicalPackagingSignature(signature:string):string{
 try{return JSON.stringify(JSON.parse(signature).filter((entry:any[])=>!isPackagingDesignOption(String(entry[1]||'').replace(/^option:/,''))).map((entry:any[])=>[canonicalPackagingItemKey(entry[0]),...entry.slice(1)]).sort());}
 catch{return signature;}
}
// Canonical profiles take precedence. Legacy colour-specific records are retained,
// including their drawing links; ambiguous legacy matches require manual review.
export async function findPackagingProfile(db:any,signature:string){
 const direct=await db.from('wc_delivery_packaging_profiles').select('*').eq('signature',signature).maybeSingle();
 if(direct.error)return direct;
 if(direct.data)return resolveBackdropProfileDimensions(db,direct.data);
 const matches:any[]=[];
 for(let start=0;;start+=250){
  const page=await db.from('wc_delivery_packaging_profiles').select('*').order('signature').range(start,start+249);
  if(page.error)return page;
  matches.push(...(page.data||[]).filter((p:any)=>canonicalPackagingSignature(p.signature)===signature));
  if((page.data||[]).length<250)break;
 }
 if(matches.length>1)return {data:null,error:{message:'Multiple saved packaging profiles differ only by colour or decorative design. Save one shared profile before using it.'}};
 return resolveBackdropProfileDimensions(db,matches[0]||null);
}
// Only explicitly referenced product profiles use live shared measurements.
// Order/review/shipment snapshots keep their historical dimensions.
export async function resolveBackdropProfileDimensions(db:any,profile:any){
 if(!profile?.packages?.some((box:any)=>box.backdrop_size_key))return {data:profile,error:null};
 const dimensions=new Map<string,any>();
 for(const box of profile.packages){
  const key=box.backdrop_size_key;if(!key||dimensions.has(key))continue;
  const result=await db.from('wc_backdrop_packaging_dimensions').select('*').eq('size_key',key).maybeSingle();
  if(result.error||!result.data)return {data:null,error:{message:'Shared Backdrop dimensions are unavailable. Review Backdrop box drawings.'}};
  dimensions.set(key,result.data);
 }
 return {data:{...profile,packages:profile.packages.map((box:any)=>{
  const shared=dimensions.get(box.backdrop_size_key);
  return shared?{...box,package_name:shared.package_name,length_mm:Number(shared.length_mm),width_mm:Number(shared.width_mm),height_mm:Number(shared.height_mm)}:box;
 })},error:null};
}
export function productId(item:OrderItemRow){const c=item.catalog_reference as any,r=item.raw_item as any;return String(c?.catalogItemId||c?.productId||r?.catalogReference?.catalogItemId||r?.productId||'');}
const attribute=/^(colou?r|size|dimensions?|width|height|length|finish|foldable|material|tabletop(?: design)?|personalisation|personalization|engraving|notes?|message)$/i;
// Pans are supplied directly by a partner, never packed with our cart.
export const isPartnerPansOption=(name:string)=>componentNormal(name)==='pans';
export const isPartnerPansComponent=(c:{component_key?:string})=>c.component_key==='option:pans';
export const isNonPackagingComponent=(c:{component_key?:string;component_name?:string})=>isPartnerPansComponent(c)||
 ((c.component_key||'').startsWith('option:')&&(isPackagingDesignOption(c.component_key!.slice(7))||isLogoOption(c.component_key!.slice(7))||isLogoFileInstruction(c.component_key!.slice(7))))||isLogoFileInstruction(c.component_name||'');
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
export function packageComponents(items:OrderItemRow[],ignored:(name:string,value:string)=>boolean=()=>false,includeColour=false):PackageComponent[]{
 const occurrences=new Map<string,number>();
 return items.flatMap(item=>{
  const labels=includeColour?orderItemOptionLabels(item,Number.MAX_SAFE_INTEGER).filter(label=>!isLogoOption(label.split(':')[0])):packagingOptionLabels(item);
  const signature=JSON.stringify([productId(item)||componentNormal(item.product_name||''),[...new Set(labels.map(componentNormal))].sort()]);
  const occurrence=occurrences.get(signature)||0;occurrences.set(signature,occurrence+1);
  const profile_item_key=signature+':'+occurrence;
  const components=new Map<string,{name:string,count:number}>([['main',{name:item.product_name||'Unnamed product',count:1}]]);
  for(const label of labels){
   const split=label.indexOf(':');if(split<0)continue;
   const name=label.slice(0,split).trim(),value=label.slice(split+1).trim();
   if(isPackagingDesignOption(name)||isPartnerPansOption(name)||attribute.test(name)||/^(no|none|false|not selected|not required|without|0)(\b|$)/i.test(value)||ignored(name,value))continue;
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
  const matches=components.filter(x=>x.profile_item_key===canonicalPackagingItemKey(c.profile_item_key||'')&&x.component_key===c.component_key&&x.unit_index===c.unit_index);
  return matches.length===1?matches:[];
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
 if(order.order_source==='hub_test')return false;
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
 // Quote validity still covers every original option, including colour and price.
 const quoteSignature=JSON.stringify(packageComponents(reviewItems(order,rules),()=>false,true).map(c=>[c.profile_item_key,c.component_key,c.unit_index]).sort());
 return JSON.stringify([quoteSignature,stable(order.delivery_address||{}),destination(order),order.currency,goodsCents(order),reviewComponents(order,rules).map(c=>c.id).sort()]);
}
export function buildReviewRequest(order:any,packages:ReviewPackage[]){
 const d=destination(order);
 if(!d.suburb||!['QLD','NSW','VIC','TAS','SA','WA','NT','ACT'].includes(d.state)||!/^\d{4}$/.test(d.postcode)||!['AU','Australia','AUS'].includes(d.country))throw Error('Complete Australian delivery suburb, state and postcode are required.');
 return {pickupSuburb:'BURLEIGH HEADS',pickupState:'QLD',pickupPostcode:4220,pickupBuildingType:'commercial',isPickupTailLift:false,
 destinationSuburb:d.suburb,destinationState:d.state,destinationPostcode:Number(d.postcode),destinationBuildingType:'residential',isDropOffTailLift:false,isDropOffPOBox:false,
 items:packages.map(p=>({type:'box',weight:Number(p.weight_kg),length:Number(p.length_mm)/10,width:Number(p.width_mm)/10,height:Number(p.height_mm)/10,quantity:1,contents:'General'}))};
}
export function allowedCarrier(name:unknown){
 // TNT is explicitly approved alongside FedEx. Keep the provider's name intact.
 return ['aramex','couriers please','couriersplease','fedex','fed ex','tnt'].includes(String(name||'').trim().toLowerCase().replace(/\s+/g,' '));
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
export function currentReviewQuotes(review:any){
 return (review.evaluated_quotes||[]).map((entry:any)=>{
  // Apply the expanded carrier policy to saved TNT prices without another API
  // call or changes to the historical response, insurance or quoted amounts.
  const tnt=String(entry.quote?.courierName||'').trim().toLowerCase()==='tnt';
  const valid=[entry.price_cents,entry.insurance_fee_cents,entry.total_cents].every(v=>Number.isInteger(v)&&v>=0)&&entry.total_cents===entry.price_cents+entry.insurance_fee_cents;
  return tnt&&entry.reason==='Carrier excluded by policy'&&valid?{...entry,eligible:true,reason:null}:entry;
 });
}
export function reviewOutcome(review:any,order:any,currentKey?:string){
 if(review.state==='approved_without_quote'){
  const a=review.approval;
  const valid=!review.quote_attempted_at&&a?.kind==='without_quote'&&a.input_key===currentKey&&a.invoice_cents===deliveryCents(order);
  return {status:valid?'approved_without_quote':'data_changed',best:null,minimum_invoice_cents:null};
 }
 if(review.state!=='quoted')return {status:review.state,best:null,minimum_invoice_cents:null};
 const best=currentReviewQuotes(review).filter((q:any)=>q.eligible&&Number.isInteger(q.total_cents)).sort((a:any,b:any)=>a.total_cents-b.total_cents)[0]||null;
 if(currentKey&&review.input_key!==currentKey)return {status:'data_changed',best,minimum_invoice_cents:null};
 if(!best)return {status:'no_eligible_quotes',best,minimum_invoice_cents:null};
 const invoice=deliveryCents(order);
 if(invoice===null)return {status:'invoice_required',best,minimum_invoice_cents:null};
 const minimum=Math.ceil(best.total_cents*10/9);
 const approved=review.approval?.kind!=='without_quote'&&review.approval?.input_key===review.input_key&&review.approval?.invoice_cents===invoice;
 return {status:best.total_cents*10<=invoice*9?'within_target':approved?'approved_exception':'price_review_required',best,minimum_invoice_cents:minimum};
}


export const hasSizeOption=(item:any)=>orderItemOptionLabels(item,Number.MAX_SAFE_INTEGER).some(label=>componentNormal(label.split(':')[0])==='size');

/** Read-only assembly. Callers retain approval, persistence and quote guards. */
export async function resolveOrderPackaging(db:any,order:any,ignoredRules:any[]=[],catalogOnly=false){
 const checked=(result:any)=>{if(result.error)throw Error('Could not load saved packaging. Please retry.');return result.data;};
 const components=reviewComponents(order,ignoredRules),signature=reviewSignature(order,ignoredRules);
 const exact=catalogOnly?null:checked(await findPackagingProfile(db,signature));
 if(exact){
  const boxes=restoreReviewPackages(exact.packages,components);
  if(packagingError(boxes,components))throw Error('The saved combination is incomplete. Review its packaging in Products.');
  return boxes;
 }
 const [products,templates,rules,variants]=await Promise.all([
  db.from('wc_shipping_products').select('id,wix_product_id,product_name,product_type,active').eq('active',true),
  db.from('wc_shipping_packages').select('*').eq('active',true).eq('source_type','Base').order('package_no'),
  db.from('wc_shipping_rules').select('*').eq('active',true),
  db.from('wc_delivery_packaging_profiles').select('*').eq('template_item->>profile_scope','cart-main'),
 ]);
 const allTemplates=checked(templates)||[];
 // Historical composition templates must match the entire order, not merely a product.
 const groups=new Map<string,any[]>();
 for(const p of allTemplates)groups.set(p.shipping_product_id,[...(groups.get(p.shipping_product_id)||[]),p]);
 for(const group of catalogOnly?[]:groups.values()){
  if(group.every(p=>p.contents?.length&&p.contents.every((c:any)=>canonicalPackagingSignature(c.profile_signature||'')===signature))){
   const restored=restoreReviewPackages(group,components);
   if(!packagingError(restored,components))return restored;
  }
 }
 const base=allTemplates.filter((p:any)=>!p.contents?.some((c:any)=>c.profile_signature));
 let boxes=composeModularPackages(order,checked(products)||[],base,checked(rules)||[],ignoredRules,checked(variants)||[]);
 // A cross-item saved combination is indivisible. Otherwise an exact item
 // profile takes precedence over reusable Base/option boxes for that item.
 for(const item of reviewItems(order,ignoredRules)){
  const existing=boxes.filter(box=>box.contents.some(c=>c.order_item_id===item.id));
  if(existing.some(box=>box.contents.some(c=>c.order_item_id!==item.id)))continue;
  const variant=checked(await findPackagingProfile(db,variantSignature(item)));
  const ownedProduct=(checked(products)||[]).find((product:any)=>product.id===variant?.shipping_product_id&&productForItem(item,[product]));
  if(variant&&(!catalogOnly||ownedProduct&&variant.template_item)){
   const restored=expandVariant(variant.packages,item,ignoredRules);
   if(!restored.length)throw Error('The saved item packaging is incomplete. Review it in Products.');
   boxes=[...boxes.filter(box=>!existing.includes(box)),...restored];
  }
 }
 return boxes;
}
export const variantItem=(item:any)=>({...item,quantity:1});
export const variantSignature=(item:any)=>packagingSignature([variantItem(item)]);
export interface ModularShippingProduct {id:string;wix_product_id?:string|null;product_name?:string|null;product_type?:string|null;active?:boolean}
export interface ModularShippingPackage {shipping_product_id:string;size_key?:string|null;source_type?:string|null;package_no?:number|null;package_name?:string|null;length_mm?:number|null;width_mm?:number|null;height_mm?:number|null;weight_kg?:number|null;quantity?:number|null;active?:boolean}
export interface ModularShippingRule {shipping_product_id?:string|null;size_key?:string|null;rule_type?:string|null;match_name?:string|null;match_value?:string|null;effect_type?:string|null;package_count_delta?:number|null;package_name?:string|null;length_mm?:number|null;width_mm?:number|null;height_mm?:number|null;weight_kg?:number|null;active?:boolean}
export interface CartMainPackagingVariant {shipping_product_id?:string|null;template_item?:any;packages?:any[]}
const optionEntries=(item:OrderItemRow)=>orderItemOptionLabels(item,Number.MAX_SAFE_INTEGER).flatMap(label=>{const split=label.indexOf(':');return split<0?[]:[{name:componentNormal(label.slice(0,split)),value:componentNormal(label.slice(split+1))}];});
const cartSize=(item:OrderItemRow)=>optionEntries(item).find(option=>['size','dimension','dimensions'].includes(option.name))?.value||'';
const productForItem=(item:OrderItemRow,products:ModularShippingProduct[])=>{
 const id=productId(item);
 const matches=products.filter(p=>p.active!==false&&(id?String(p.wix_product_id||'')===id:!p.wix_product_id&&componentNormal(p.product_name||'')===componentNormal(item.product_name||'')));
 return matches.length===1?matches[0]:undefined;
};
const addonDescriptorKey=(value:any)=>[value.rule_type,value.match_name,value.match_value].map(part=>componentNormal(String(part||''))).join(':');
const profileAddonKeys=(profile:CartMainPackagingVariant)=>{
 const saved=profile.template_item?.merged_add_ons;
 if(Array.isArray(saved))return saved.map(addonDescriptorKey).sort();
 return Object.entries(profile.template_item?.wix_options||{}).filter(([name,value])=>!['size','dimension','dimensions'].includes(componentNormal(name))&&['yes','true','included','selected'].includes(componentNormal(String(value)))).map(([name,value])=>addonDescriptorKey({rule_type:'Option',match_name:name,match_value:String(value)})).sort();
};
const sameKeys=(left:string[],right:string[])=>left.length===right.length&&left.every((value,index)=>value===right[index]);
function expandCombination(packages:any[],target:PackageComponent[],quantity:number):ReviewPackage[]{
 const counts=new Map<string,number>();
 for(const box of packages||[])for(const content of box.contents||[]){const key=`${canonicalPackagingItemKey(content.profile_item_key||'')}|${content.component_key||'main'}`;counts.set(key,Math.max(counts.get(key)||0,Number(content.unit_index)||1));}
 const result=Array.from({length:quantity},(_,copy)=>(packages||[]).map(box=>({...box,contents:(box.contents||[]).flatMap((content:any)=>{const key=`${canonicalPackagingItemKey(content.profile_item_key||'')}|${content.component_key||'main'}`,unit=copy*(counts.get(key)||1)+(Number(content.unit_index)||1);const matches=target.filter(component=>component.profile_item_key===canonicalPackagingItemKey(content.profile_item_key||'')&&component.component_key===(content.component_key||'main')&&component.unit_index===unit);return matches.length===1?matches:[];})}))).flat();
 return packagingError(result,target)?[]:result;
}
/** Compose reusable Cart Main and separate Add-ons, or an exact manually saved Main + Add-ons combination. */
export function composeModularPackages(order:any,products:ModularShippingProduct[],templates:ModularShippingPackage[],rules:ModularShippingRule[],ignoredRules:any[]=[],mainVariants?:CartMainPackagingVariant[]):ReviewPackage[]{
 const items=reviewItems(order,ignoredRules),components=reviewComponents(order,ignoredRules),out:ReviewPackage[]=[];
 const add=(source:any,content:PackageComponent)=>{const copies=Math.max(1,Math.floor(Number(source.quantity)||1));for(let n=0;n<copies;n++)out.push({package_name:String(source.package_name||'Package'),length_mm:Number(source.length_mm),width_mm:Number(source.width_mm),height_mm:Number(source.height_mm),weight_kg:Number(source.weight_kg),contents:[content]});};
 const addonOwners=new Map<string,string[]>();
 for(const parent of items){
  const product=productForItem(parent,products);if(!product)continue;
  for(const addon of items){
   if(addon.id===parent.id)continue;
   if(rules.some(r=>r.active!==false&&r.shipping_product_id===product.id&&r.rule_type==='Add-on'&&['Add package','Replace profile'].includes(r.effect_type||'')&&componentNormal(r.match_name||'')===componentNormal(addon.product_name||''))){
    addonOwners.set(addon.id,[...(addonOwners.get(addon.id)||[]),parent.id]);
   }
  }
 }
 if([...addonOwners.values()].some(owners=>owners.length>1))throw Error('Ambiguous add-on assignment. Review which Main product owns each add-on.');
 for(const item of items){
  if(addonOwners.has(item.id))continue;
  const product=productForItem(item,products);if(!product)continue;
  const configuredSizes=[...new Set(templates.filter(p=>p.active!==false&&p.shipping_product_id===product.id&&(p.source_type||'Base')==='Base').map(p=>componentNormal(p.size_key||'')))];
  // Some Wix Cart products have one product-wide size saved in Products but do
  // not expose Size as an order option. Reuse that sole configured size; if the
  // product has multiple sizes, keep requiring an exact order value.
  const size=cartSize(item)||(configuredSizes.length===1?configuredSizes[0]:'');
  // Manual catalogue labels are never consulted. Empty/null means product-wide.
  if(!size&&!(configuredSizes.length===1&&configuredSizes[0]===''))continue;
  const matchesSize=(key:string|null|undefined)=>componentNormal(key||'')===size;
  const options=optionEntries(item);
  const optionRules=rules.filter(r=>r.active!==false&&r.shipping_product_id===product.id&&matchesSize(r.size_key)&&r.rule_type==='Option'&&['Add package','Replace profile'].includes(r.effect_type||'')&&options.some(option=>option.name===componentNormal(r.match_name||'')&&(!r.match_value||option.value===componentNormal(r.match_value))));
  const addonRules=rules.filter(r=>r.active!==false&&r.shipping_product_id===product.id&&matchesSize(r.size_key)&&r.rule_type==='Add-on'&&['Add package','Replace profile'].includes(r.effect_type||'')&&items.some(candidate=>componentNormal(candidate.product_name||'')===componentNormal(r.match_name||'')));
  const selectedKeys=[...optionRules,...addonRules].map(addonDescriptorKey).sort();
  const variant=(mainVariants||[]).find(profile=>profile.shipping_product_id===product.id&&profile.template_item?.profile_scope==='cart-main'&&cartSize(profile.template_item)===size&&sameKeys(profileAddonKeys(profile),selectedKeys));
  const addonItems=addonRules.flatMap(rule=>items.filter(candidate=>componentNormal(candidate.product_name||'')===componentNormal(rule.match_name||'')));
  const target=components.filter(component=>component.order_item_id===item.id||addonItems.some(candidate=>candidate.id===component.order_item_id));
  const combined=variant?.packages?.length&&selectedKeys.length?expandCombination(variant.packages,target,Math.max(1,Math.floor(Number(item.quantity)||1))):[];
  if(combined.length)out.push(...combined);
  else{
   const main=components.filter(c=>c.order_item_id===item.id&&c.component_key==='main');
   const base=templates.filter(p=>p.active!==false&&p.shipping_product_id===product.id&&matchesSize(p.size_key)&&(p.source_type||'Base')==='Base').sort((a,b)=>Number(a.package_no||0)-Number(b.package_no||0));
   for(const unit of main)for(const box of base)add({...box,quantity:box.quantity||1},unit);
   for(const rule of optionRules){
   const name=componentNormal(rule.match_name||'');
   const optionUnits=components.filter(c=>c.order_item_id===item.id&&c.component_key===`option:${name}`);
   for(const unit of optionUnits)add({...rule,quantity:Math.max(1,Number(rule.package_count_delta)||1)},unit);
   }
   for(const rule of addonRules)for(const addon of items.filter(candidate=>componentNormal(candidate.product_name||'')===componentNormal(rule.match_name||'')))for(const unit of components.filter(component=>component.order_item_id===addon.id&&component.component_key==='main'))add({...rule,quantity:Math.max(1,Number(rule.package_count_delta)||1)},unit);
  }
 }
 return out;
}
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
