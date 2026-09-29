// Complete server boundaries for courier tests. No network or real credentials.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('../../angular-app/node_modules/typescript');
module.exports=function courierFixture(options={}){
 let handler,prepared=null;const sent=[],cache=new Map();
 const order=options.order||{id:'order',currency:'AUD',subtotal:110,shipping:300,delivery_type:'Shipping',wc_order_items:[{id:'item',product_name:'Cart',quantity:1,unit_price:110}]};
 const shipment={id:'shipment',order_id:order.id,status:'Quote Selected',packages_approved_at:'2026-09-29T00:00:00Z',updated_at:'2026-09-29T00:00:00Z',selected_quote_id:'q',courier_order_id:'fixture'};
 const state={reference:{status:true,data:['other','fragile']},exempt:true,...options};
 function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(code,{exports,require:p=>p.includes('esm.sh')?{createClient:()=>db}:p.includes('http/server')?{serve:f=>handler=f}:load(path.resolve(path.dirname(file),p)),Deno:{env:{get:()=> 'fixture'},serve:f=>handler=f},fetch:async(url,init)=>{sent.push({url,init});if(state.networkError)throw Error('network unavailable');return new Response(JSON.stringify(url.endsWith('/package-contents-list')?state.reference:url.endsWith('/insurance-list')?{status:true,data:['Free up to $450']}:{status:true,orderId:'fixture',data:[{id:'q',priceIncludingGst:50}]}),{status:200});},Error,Request,Response,Date,Intl,URL,AbortSignal,AbortController,DOMException,crypto:globalThis.crypto,setTimeout,clearTimeout,console});return exports;
 }
 const domain=load('supabase/functions/_shared/delivery-review-domain.ts');
 const packages=options.packages||[{package_no:1,package_name:'Cart',length_mm:1000,width_mm:500,height_mm:100,weight_kg:10,contents:domain.reviewComponents(order)}];
 const request=domain.buildReviewRequest({...order,delivery_address:{city:'Test',state:'VIC',postalCode:'3000'}},packages);
 const trusted={shipment_id:shipment.id,request,quotes:[{id:'q',priceIncludingGst:50}]};
 const db={auth:{getUser:async()=>({data:{user:{id:'actor'}}})},rpc:async(name,args)=>{
  if(name==='wc_prepare_courier_booking'){
   if(prepared&&(prepared.attempted_at||!prepared.details_saved))return {data:false};
   prepared={actor:args.p_actor,details:args.p_details,details_saved:false,preparation_token:args.p_token};return {data:true};
  }
  if(name==='wc_claim_courier_booking'){
   if(!prepared?.details_saved||prepared.attempted_at)return {data:false};prepared.attempted_at='attempted';return {data:true};
  }
  throw Error('Unexpected RPC '+name);
 },from:table=>{
  let patch;
  const result=()=>{
   if(patch&&table==='wc_courier_booking_attempts')Object.assign(prepared,patch);
   return {data:table==='wc_hub_members'?{role:'manager',active:true}:table==='wc_shipments'?shipment:table==='wc_shipment_packages'?packages:table==='wc_orders'?order:table==='wc_shipping_rules'?[]:table==='wc_delivery_booking_exemptions'?(state.exempt?{order_id:order.id}:null):table==='wc_courier_quotes'?trusted:table==='wc_courier_booking_attempts'?prepared:null,error:null};
  };
  const q={select:()=>q,eq:()=>q,order:()=>q,single:async()=>result(),maybeSingle:async()=>result(),then:f=>Promise.resolve(result()).then(f),insert:()=>q,update:p=>{patch=p;return q;}};return q;
 }};
 load('supabase/functions/fast-courier-api/index.ts');
 const details={quoteId:'q',senderType:'sender',collectionDate:new Date(Date.now()+86400000).toISOString().slice(0,10),valueOfContent:110};
 for(const k of ['pickupFirstName','pickupLastName','pickupEmail','pickupAddress1','pickupPhone','destinationFirstName','destinationLastName','destinationEmail','destinationAddress1','destinationPhone','pickupTimeWindow','emailForDocuments'])details[k]='fixture';
 details.parcelContent='other';
 for(const k of ['acceptInsuranceConditions','acceptTermConditions','acceptAttachment','acceptNoDangerousGoods','acceptReadFinancialServiceGuide'])details[k]=true;
 return {state,shipment,packages,details,request,db,sent,call:body=>handler(new Request('https://fixture.invalid',{method:'POST',headers:{Authorization:'Bearer fixture'},body:JSON.stringify({orderId:'fixture',shipmentId:'shipment',confirmedTotalCents:5000,...body})}))};
};
