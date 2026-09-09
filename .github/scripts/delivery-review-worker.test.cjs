const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('../../angular-app/node_modules/typescript');
function moduleAt(file){const exports={};const result=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},reportDiagnostics:true});assert.equal(result.diagnostics.length,0);vm.runInNewContext(result.outputText,{exports,require:p=>moduleAt(path.resolve(path.dirname(file),p)),crypto:globalThis.crypto,fetch,AbortSignal,Date,console});return exports;}
const domain=moduleAt(path.resolve('supabase/functions/_shared/delivery-review-domain.ts'));
const production=moduleAt(path.resolve('supabase/functions/_shared/delivery-production-gate.ts'));
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
 let calls=[];const call=async(route,payload)=>{calls.push({route,payload});return route==='package-contents-list'?{http_status:200,body:{status:true,data:['general']}}:route==='insurance-list'?{http_status:200,body:{status:true,data:['Free up to $500']}}:{http_status:200,body:{status:true,orderId:'saved-draft',data:[{courierName:'TNT',priceIncludingGst:5},{courierName:'Aramex',priceIncludingGst:100}]}};};
 return {order,review,db,calls,call};
}
test('one concurrent claimant; all carriers and complete response persist; re-entry never quotes again',async()=>{
 const s=setup();await Promise.all([processDeliveryReview(s.db,'order',s.call),processDeliveryReview(s.db,'order',s.call)]);await processDeliveryReview(s.db,'order',s.call);
 assert.equal(s.calls.filter(c=>c.route==='quotes').length,1);assert.equal(s.review.state,'quoted');assert.equal(s.review.response.body.orderId,'saved-draft');assert.equal(s.review.evaluated_quotes.length,2);assert.equal(s.review.evaluated_quotes[0].eligible,false);assert.equal(s.calls.find(c=>c.route==='quotes').payload.items[0].contents,'general');
});
test('backdrop resolves stale contents from live reference data and persists the exact value without changing packaging',async()=>{
 const {resolveCourierContents}=moduleAt(path.resolve('supabase/functions/_shared/courier-contents.ts'));
 const reference={http_status:200,body:{status:true,data:['alcohol','general']}};
 for(const old of ['General','General/Others','Other','Backdrop']) {
  const input={items:[{contents:old,length:103,width:103,height:9,weight:24,quantity:1,type:'box'}]};
  const resolved=resolveCourierContents(input,reference);
  assert.equal(resolved.items[0].contents,'general');assert.equal(input.items[0].contents,old);
  assert.equal(resolved.items[0].height,9);
 }
 const s=setup();s.order.wc_order_items[0].product_name='Event Full Arch Backdrop';
 s.review.packages=[{package_name:'Backdrop',length_mm:1030,width_mm:1030,height_mm:90,weight_kg:24,contents:domain.reviewComponents(s.order)}];
 await processDeliveryReview(s.db,'order',s.call);
 assert.equal(s.review.request.items[0].contents,'general');
 assert.equal(s.review.request.items[0].height,9);assert.equal(s.review.packages[0].package_name,'Backdrop');
 assert.deepEqual(s.calls.map(c=>c.route),['package-contents-list','insurance-list','quotes']);
 let handler;const sent=[];const file=path.resolve('supabase/functions/fast-courier-api/index.ts');
 const output=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 vm.runInNewContext(output,{exports:{},require:p=>p.includes('http/server')?{serve:f=>handler=f}:p.includes('esm.sh')?{}:moduleAt(path.resolve(path.dirname(file),p)),Deno:{env:{get:()=> 'fixture'}},Response,Request,AbortController,AbortSignal,DOMException,setTimeout,clearTimeout,console,
  fetch:async(url,init)=>{sent.push({url,init});return new Response(JSON.stringify(url.endsWith('/package-contents-list')?reference.body:{status:true,orderId:'fixture',data:[]}),{status:200});}});
 const response=await handler(new Request('http://fixture.invalid',{method:'POST',headers:{Authorization:'Bearer fixture'},body:JSON.stringify({action:'quotes',payload:{...s.review.request,items:[{...s.review.request.items[0],contents:'Backdrop'}]}})}));
 assert.equal(response.status,200);assert.equal(sent[0].init.method,'GET');
 assert.equal(sent[0].init.headers['Secret-Key'],'fixture');assert.equal(sent.length,2);
 assert.equal(JSON.parse(sent[1].init.body).items[0].contents,'general');
 assert.equal((await response.json()).quoteRequest.items[0].contents,'general');
 for(const bad of [{http_status:401}, {http_status:200,body:{status:true,data:['alcohol']}}]) {
  const blocked=setup();await processDeliveryReview(blocked.db,'order',async(route,payload)=>route==='package-contents-list'?bad:blocked.call(route,payload));
  assert.equal(blocked.review.state,'failed');assert.equal(blocked.review.quote_attempted_at,null);
  assert.equal(blocked.calls.length,0);assert.match(blocked.review.error,/No quote requested/);
 }
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
 const seen=[];await courierReviewCall('quotes',{items:[{contents:'General'}]},'fixture','http://fixture.invalid',async(url,init)=>{seen.push([url,init]);return new Response(JSON.stringify({status:true,data:[]}),{status:200});});
 assert.equal(seen[0][0],'http://fixture.invalid/api/quotes');assert.equal(seen[0][1].method,'POST');assert.equal(JSON.parse(seen[0][1].body).items[0].contents,'General');
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

function productionFixture(state='packaging_required'){
 const s=setup();s.order.updated_at='2026-09-07T00:00:00Z';s.review.state=state;s.review.updated_at=s.order.updated_at;
 const calls=[];let exempt=false;const db={from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:exempt?{order_id:s.order.id}:null})}),rpc:async(name,args)=>{calls.push({name,args});return {data:{id:'activity'}}}};
 return {...s,db,calls,exempt:()=>exempt=true};
}
test('production fails closed for missing packaging, failed quotes and over-budget quotes',async()=>{
 for(const state of ['packaging_required','legacy_packaging_required','pending','failed','uncertain']){
  const s=productionFixture(state);assert.equal((await production.productionDecision(s.db,s.order,[],s.review)).allowed,false);
  await assert.rejects(production.setReviewedProductionStatus(s.db,s.order,[],s.review,{unitId:'00000000-0000-4000-8000-000000000001',next:'CNC'},'actor'),/Production blocked/);assert.equal(s.calls.length,0);
 }
 const s=productionFixture('quoted');s.review.input_key=domain.reviewInputKey(s.order);s.review.evaluated_quotes=[{eligible:true,total_cents:29000}];assert.equal((await production.productionDecision(s.db,s.order,[],s.review)).allowed,false);
 s.review.evaluated_quotes[0].total_cents=27000;assert.equal((await production.productionDecision(s.db,s.order,[],s.review)).allowed,true);
});
test('unquoted approval binds inputs and invoice, makes no quote, and passes server decision to atomic RPC',async()=>{
 const s=productionFixture('approved_without_quote');s.review.approval={kind:'without_quote',input_key:domain.reviewInputKey(s.order),invoice_cents:domain.deliveryCents(s.order)};
 assert.equal((await production.productionDecision(s.db,s.order,[],s.review)).allowed,true);
 await production.setReviewedProductionStatus(s.db,s.order,[],s.review,{unitId:'00000000-0000-4000-8000-000000000001',next:'CNC'},'actor');
 assert.equal(s.calls[0].name,'wc_set_reviewed_production_status');assert.equal(s.calls[0].args.p_decision,'approved_without_quote');assert.equal(s.calls[0].args.p_actor,'actor');
 for(const changed of [{...s.order,shipping:301},{...s.order,delivery_address:{city:'Elsewhere'}},{...s.order,wc_order_items:[{...s.order.wc_order_items[0],quantity:2}]}])assert.equal((await production.productionDecision(s.db,changed,[],s.review)).allowed,false);
 s.review.state='quoted';s.review.input_key=s.review.approval.input_key;s.review.evaluated_quotes=[{eligible:true,total_cents:29000}];assert.equal(domain.reviewOutcome(s.review,s.order,s.review.input_key).status,'price_review_required');
});
test('Pickup and fixed Ready exemptions remain allowed; becoming Ready never creates an exemption',async()=>{
 const s=productionFixture();s.order.delivery_type='Pickup';assert.equal((await production.productionDecision(s.db,s.order,[],null)).allowed,true);
 s.order.delivery_type='Shipping';assert.equal((await production.productionDecision(s.db,s.order,[],null)).allowed,false);
 s.exempt();assert.equal((await production.productionDecision(s.db,s.order,[],null)).allowed,true);
});

test('delivery handler authenticates approval, validates reason and never calls courier for approval',async()=>{
 const s=setup(),rpc=[];let authorized=true,handler,upstream=0;
 s.order.id='00000000-0000-4000-8000-000000000001';s.order.updated_at='2026-09-07T00:00:00Z';s.review.state='packaging_required';s.review.updated_at=s.order.updated_at;
 s.db.auth={getUser:async()=>({data:{user:authorized?{id:'verified-user'}:null},error:null})};s.db.rpc=async(name,args)=>{rpc.push({name,args});return {data:null}};
 const file=path.resolve('supabase/functions/delivery-cost-review/index.ts');
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports:{},require:p=>p.includes('esm.sh')?{createClient:()=>s.db}:moduleAt(path.resolve(path.dirname(file),p)),Deno:{serve:f=>handler=f,env:{get:()=> 'fixture'}},Request,Response,console,fetch:async()=>{upstream++;throw Error('No external calls allowed')}});
 const call=body=>handler(new Request('http://fixture.invalid',{method:'POST',headers:{Authorization:'Bearer fixture'},body:JSON.stringify({orderId:s.order.id,action:'approve-without-quote',...body})}));
 authorized=false;assert.equal((await call({reason:'First build'})).status,401);authorized=true;
 assert.equal((await call({reason:' '})).status,422);assert.equal(rpc.length,0);
 assert.equal((await call({reason:'First build',actor:'spoofed'})).status,200);assert.equal(rpc[0].args.p_actor,'verified-user');assert.equal(rpc[0].name,'wc_approve_delivery_without_quote');
 s.review.quote_attempted_at='2026-09-07';assert.equal((await call({reason:'Again'})).status,409);assert.equal(rpc.length,1);assert.equal(upstream,0);
});

test('variant save is authenticated, canonical, and never quotes or changes orders',async()=>{
 let handler,authorized=true,saved=null;const product={id:'cart',product_name:'Cart',wix_product_id:'catalog'};
 const db={auth:{getUser:async()=>({data:{user:authorized?{id:'actor'}:null}})},from(table){assert.ok(['wc_shipping_products','wc_shipping_rules','wc_delivery_packaging_profiles'].includes(table));const q={select(){return q},eq(){return q},single:async()=>({data:product}),then:resolve=>resolve({data:[]}),upsert:async value=>{saved=value;return {error:null}}};return q;}};
 const file=path.resolve('supabase/functions/delivery-cost-review/index.ts');vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports:{},require:p=>p.includes('esm.sh')?{createClient:()=>db}:moduleAt(path.resolve(path.dirname(file),p)),Deno:{serve:f=>handler=f,env:{get:()=> 'fixture'}},Request,Response,console,fetch:async()=>{throw Error('No upstream calls')}});
 const item={id:'cart',product_name:'Cart',quantity:1,catalog_reference:{catalogItemId:'catalog'},wix_options:{Size:'Size II'}};
 const body={action:'save-packaging-variant',productId:'cart',options:[{name:'Size',value:'Size II'}],packages:[{package_name:'Box',length_mm:1300,width_mm:600,height_mm:100,weight_kg:15,contents:domain.reviewComponents({wc_order_items:[item]})}]};
 const call=b=>handler(new Request('http://fixture.invalid',{method:'POST',body:JSON.stringify(b)}));authorized=false;assert.equal((await call(body)).status,401);authorized=true;
 assert.equal((await call({...body,options:[{name:'Size',value:''}]})).status,422);assert.equal(saved,null);
 body.packages[0].contents[0].component_name='Spoof';assert.equal((await call(body)).status,200);assert.equal(saved.created_by,'actor');assert.equal(saved.packages[0].contents[0].component_name,'Cart');assert.equal(saved.signature,domain.variantSignature(item));
});

test('legacy product-only boxes cannot quote a Size variant',async()=>{
 const s=setup();s.review.packages=[];s.order.wc_order_items[0].wix_options={Size:'Size II'};
 const original=s.db.from.bind(s.db);s.db.from=table=>{if(!['wc_shipping_products','wc_shipping_packages'].includes(table))return original(table);const data=table==='wc_shipping_products'?[{id:'p',product_name:'Cart'}]:[{shipping_product_id:'p',package_name:'Old size unknown',length_mm:1000,width_mm:500,height_mm:100,weight_kg:10,contents:[]}];const q={select(){return q},eq(){return q},order(){return q},then:resolve=>resolve({data})};return q;};
 await processDeliveryReview(s.db,'order',s.call);assert.equal(s.calls.length,0);assert.equal(s.review.state,'packaging_required');
});
