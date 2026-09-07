const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('../../angular-app/node_modules/typescript');
function moduleAt(file){const exports={};const result=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},reportDiagnostics:true});assert.equal(result.diagnostics.length,0);vm.runInNewContext(result.outputText,{exports,require:p=>moduleAt(path.resolve(path.dirname(file),p)),crypto:globalThis.crypto,fetch,AbortSignal,Date,console});return exports;}
const domain=moduleAt(path.resolve('supabase/functions/_shared/delivery-review-domain.ts'));
const {processDeliveryReview,courierReviewCall}=moduleAt(path.resolve('supabase/functions/_shared/delivery-review-worker.ts'));
function setup(){
 const order={id:'order',currency:'AUD',shipping:300,subtotal:110,fulfillment_status:'NOT_FULFILLED',delivery_type:'Shipping',delivery_address:{city:'Test',state:'VIC',postalCode:'3000'},wc_order_items:[{id:'item',product_name:'Cart',unit_price:110,quantity:1}]};
 const components=domain.reviewComponents(order);
 const review={order_id:'order',state:'pending',packages:[{package_name:'Cart',length_mm:1000,width_mm:500,height_mm:100,weight_kg:10,contents:components}],quote_attempted_at:null,token:null};
 const db={rpc:async(_name,args)=>{if(review.quote_attempted_at||review.token)return {data:false};review.token=args.p_token;return {data:true};},from:table=>{
  let patch=null,checks=[];const q={select:()=>q,eq:(k,v)=>{checks.push([k,v]);return q;},is:(k,v)=>{checks.push([k,v]);return q;},order:()=>q,update:p=>{patch=p;return q;},single:async()=>result(),maybeSingle:async()=>result(),then:resolve=>resolve(result())};
  function result(){if(table==='wc_orders')return {data:order};if(table==='wc_shipping_rules')return {data:[]};if(table==='wc_shipping_packages'||table==='wc_shipping_products')return {data:[]};if(table==='wc_delivery_packaging_profiles')return {data:null};
   if(patch){if(checks.some(([k,v])=>review[k]!==v))return {error:{message:'CAS failed'}};Object.assign(review,patch);}
   return {data:review};
  }return q;
 }};
 let calls=[];const call=async(route,payload)=>{calls.push({route,payload});return route==='insurance-list'?{http_status:200,body:{status:true,data:['Free up to $500']}}:{http_status:200,body:{status:true,orderId:'saved-draft',data:[{courierName:'TNT',priceIncludingGst:5},{courierName:'Aramex',priceIncludingGst:100}]}};};
 return {order,review,db,calls,call};
}
test('one concurrent claimant; all carriers and complete response persist; re-entry never quotes again',async()=>{
 const s=setup();await Promise.all([processDeliveryReview(s.db,'order',s.call),processDeliveryReview(s.db,'order',s.call)]);await processDeliveryReview(s.db,'order',s.call);
 assert.equal(s.calls.filter(c=>c.route==='quotes').length,1);assert.equal(s.review.state,'quoted');assert.equal(s.review.response.body.orderId,'saved-draft');assert.equal(s.review.evaluated_quotes.length,2);assert.equal(s.review.evaluated_quotes[0].eligible,false);assert.equal(s.calls.find(c=>c.route==='quotes').payload.items[0].contents,'General/Others');
});
test('timeout after POST remains uncertain and cannot cause a second POST',async()=>{
 const s=setup();const call=async(route,p)=>{if(route==='quotes'){s.calls.push({route});throw Error('timeout');}return s.call(route,p);};
 await processDeliveryReview(s.db,'order',call);await processDeliveryReview(s.db,'order',call);assert.equal(s.review.state,'uncertain');assert.equal(s.calls.filter(c=>c.route==='quotes').length,1);assert.ok(s.review.quote_attempted_at);
});
test('missing packaging waits without requests; adding complete packaging triggers exactly one quote',async()=>{
 const s=setup(),packages=s.review.packages;s.review.packages=[];
 await processDeliveryReview(s.db,'order',s.call);assert.equal(s.review.state,'packaging_required');assert.equal(s.calls.length,0);
 s.review.packages=packages;s.review.state='pending';await processDeliveryReview(s.db,'order',s.call);assert.equal(s.review.state,'quoted');assert.equal(s.calls.filter(c=>c.route==='quotes').length,1);
});
test('HTTP rejection response is retained with no repeat quote',async()=>{
 const s=setup();const call=async(route,p)=>route==='quotes'?(s.calls.push({route}),{http_status:422,body:{status:false,code:'TEST',data:[]}}):s.call(route,p);
 await processDeliveryReview(s.db,'order',call);await processDeliveryReview(s.db,'order',call);assert.equal(s.review.response.http_status,422);assert.equal(s.review.response.body.code,'TEST');assert.equal(s.review.state,'failed');assert.equal(s.calls.filter(c=>c.route==='quotes').length,1);
});
test('transport uses only insurance-list and quotes with a fixed-category payload',async()=>{
 const seen=[];await courierReviewCall('quotes',{items:[{contents:'General/Others'}]},'fixture','http://fixture.invalid',async(url,init)=>{seen.push([url,init]);return new Response(JSON.stringify({status:true,data:[]}),{status:200});});
 assert.equal(seen[0][0],'http://fixture.invalid/api/quotes');assert.equal(seen[0][1].method,'POST');assert.equal(JSON.parse(seen[0][1].body).items[0].contents,'General/Others');
});

const {assertDeliveryBookingAllowed}=moduleAt(path.resolve('supabase/functions/_shared/delivery-booking-gate.ts'));
function gateDb(exempt=false,approved=false){
 const s=setup();s.review.input_key=domain.reviewInputKey(s.order);s.review.evaluated_quotes=domain.evaluateQuotes([{courierName:'Aramex',priceIncludingGst:290}],domain.insuranceFor(['Free up to $500'],11000));s.review.state='quoted';
 if(approved)s.review.approval={input_key:s.review.input_key,invoice_cents:30000};
 return {auth:{getUser:async()=>({data:{user:{id:'fixture'}},error:null})},from:table=>{
  const result=()=>({data:table==='wc_shipments'?{order_id:'order',status:'Quote Selected'}:table==='wc_delivery_booking_exemptions'?(exempt?{order_id:'order'}:null):table==='wc_delivery_reviews'?s.review:table==='wc_orders'?s.order:[]});
  const q={select:()=>q,eq:()=>q,single:async()=>result(),maybeSingle:async()=>result(),then:resolve=>resolve(result())};return q;
 }};
}
test('booking gate requires a priced decision; only fixed pre-cutover Ready exemption bypasses it',async()=>{
 await assert.rejects(assertDeliveryBookingAllowed(gateDb(false,false),'draft'),/blocked/);
 await assertDeliveryBookingAllowed(gateDb(false,true),'draft');
 await assertDeliveryBookingAllowed(gateDb(true,false),'draft');
});
test('actual Fast Courier handler blocks POST booking before any upstream call and allows grandfathered Ready',async()=>{
 for(const exempt of [false,true]){
  let handler,calls=0;
  const file=path.resolve('supabase/functions/fast-courier-api/index.ts');
  const output=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(output,{exports:{},require:p=>p.includes('http/server')?{serve:f=>handler=f}:p.includes('esm.sh')?{createClient:()=>gateDb(exempt,false)}:moduleAt(path.resolve(path.dirname(file),p)),Deno:{env:{get:n=>n==='DELIVERY_REVIEW_ENABLED'?'true':'fixture'}},Response,Request,AbortController,DOMException,setTimeout,clearTimeout,console,
   fetch:async()=>{calls++;return new Response(JSON.stringify({status:true}),{status:200});}});
  const response=await handler(new Request('http://fixture.invalid',{method:'POST',headers:{Authorization:'Bearer fixture'},body:JSON.stringify({action:'booking',orderId:'draft'})}));
  assert.equal(response.status,exempt?200:409);assert.equal(calls,exempt?1:0);
 }
});
