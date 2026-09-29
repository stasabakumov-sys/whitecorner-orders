const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('../../../angular-app/node_modules/typescript');
function harness(name,state={}){
 const cache=new Map(),calls=[],writes=[];let handler;
 const member=state.member===undefined?{role:'manager',active:true}:state.member;
 const user={id:'11111111-1111-1111-1111-111111111111'};
 const db={storage:{from:()=>({createSignedUrl:async(path,ttl)=>{assert.equal(ttl,300);return {data:{signedUrl:'https://fixture.invalid/signed'}}}})},auth:{getUser:async token=>({data:{user:token?user:null}}),admin:{}},rpc:async()=>({data:null}),from:table=>{
  calls.push(table);let value=table==='wc_hub_members'?member:table==='wc_mailboxes'?[]:null;
  if(table==='wc_orders')value=[];
  if(table==='wc_shipments')value=state.shipment||null;
  if(state.rows && table in state.rows)value=state.rows[table];
  const result=()=>({data:value,error:null});
  const q={select:()=>q,eq:()=>q,in:()=>q,is:()=>q,order:()=>q,limit:()=>q,maybeSingle:async()=>result(),single:async()=>result(),then:f=>Promise.resolve(result()).then(f),insert:v=>{writes.push({table,value:v});return q;},update:v=>{writes.push({table,value:v});return q;},upsert:v=>{writes.push({table,value:v});return q;}};
  return q;
 }};
 const env={SUPABASE_URL:'https://fixture.invalid',SUPABASE_ANON_KEY:'anon-fixture',SUPABASE_SERVICE_ROLE_KEY:'server-fixture',FAST_COURIER_API_KEY:'courier-fixture',WIX_API_KEY:'wix-fixture',WIX_SITE_ID:'site-fixture',GOOGLE_CLIENT_ID:'client-fixture',GOOGLE_CLIENT_SECRET:'secret-fixture',GOOGLE_MAPS_API_KEY:'maps-fixture',...state.env};
 const client=(_url,_key,options)=>options?.global?{...db,auth:{getUser:async()=>({data:{user:options.global.headers.Authorization?user:null}})}}:db;
 function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);
  const result=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},reportDiagnostics:true});assert.equal(result.diagnostics.length,0);
  vm.runInNewContext(result.outputText,{exports,require:p=>p.includes('esm.sh')?{createClient:client}:p.includes('http/server')?{serve:f=>handler=f}:load(path.resolve(path.dirname(file),p)),Deno:{env:{get:k=>env[k]},serve:f=>handler=f},fetch:state.fetch||(async()=>{throw Error('Unexpected external API call');}),Error,Request,Response,URL,URLSearchParams,TextEncoder,TextDecoder,crypto:globalThis.crypto,atob,btoa,Date,Intl,AbortSignal,AbortController,DOMException,setTimeout,clearTimeout,console});return exports;
 }
 const token='eyJfixture.'+Buffer.from(JSON.stringify({session_id:'22222222-2222-2222-2222-222222222222',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.signature';
 if(name)load(`supabase/functions/${name}/index.ts`);
 return {db,calls,writes,load,request:req=>handler(req),call:(body,authenticated=true)=>handler(new Request('https://fixture.invalid',{method:'POST',headers:authenticated?{Authorization:`Bearer ${token}`}:{},body:JSON.stringify(body)}))};
}

const actions=[
 ['address-review-sync',{},200,false],
 ['fast-courier-api',{action:'booking',orderId:'!'},422,true],
 ['fast-courier-api',{action:'document-url',path:'fast-courier/fixture/label.pdf'},200,false],
 ['gmail-api',{action:'status'},200,false],
 ['gmail-oauth',{mailbox:'info'},200,true],
 ['email-ai',{action:'status'},200,false],
 ['wix-orders-sync',{action:'markFulfilled'},400,true],
 ['wix-orders-sync',{action:'fulfillShipping'},400,true],
 ['delivery-cost-review',{action:'approve'},422,true],
 ['delivery-cost-review',{action:'production-check'},422,false],
 ['hub-users',{action:'invalid'},400,true],
];
for(const [name,body,allowed,managerOnly] of actions){
 for(const role of ['no-session','outsider','inactive','worker','manager'])test(`${name} ${body.action||'connect'} / ${role}`,async()=>{
  const member=role==='outsider'?null:{role:role==='worker'?'worker':'manager',active:role!=='inactive'};
  const h=harness(name,{member});
  const response=await h.call(body,role!=='no-session');
  const expected=role==='no-session'?401:['outsider','inactive'].includes(role)||(role==='worker'&&managerOnly)?403:allowed;
  assert.equal(response.status,expected,await response.text());
  if(expected===401||expected===403)assert.ok(h.calls.every(t=>t==='wc_hub_members'),'denied caller reached private data');
 });
}
for(const enabled of [undefined,'false','true'])test(`booking gate is mandatory with DELIVERY_REVIEW_ENABLED=${enabled}`,async()=>{
 const h=harness('fast-courier-api',{env:{DELIVERY_REVIEW_ENABLED:enabled},shipment:{id:'s',status:'Packaging Review'}});
 const response=await h.call({action:'booking',orderId:'courier-id'});
 assert.equal(response.status,409);assert.match((await response.json()).message,/selected Hub shipment/);
});
test('cron trust requires the exact service key and an explicitly allowed job',async()=>{
 const h=harness(),auth=h.load('supabase/functions/_shared/hub-auth.ts');
 const req=token=>new Request('https://fixture.invalid',{headers:{Authorization:'Bearer '+token}});
 assert.equal(await auth.requireHubJobOrSession(req('server'),h.db,'server',true),null);
 await assert.rejects(auth.requireHubJobOrSession(req('server'),{auth:{getUser:async()=>({data:{user:null}})}},'server',false),/Authentication/);
 await assert.rejects(auth.requireHubJobOrSession(req('forged-role-claim'),{auth:{getUser:async()=>({data:{user:null}})}},'server',true),/Authentication/);
});
test('booking validation checks form, date, insurance, quote and separately confirmed total',()=>{
 const {validateBookingDetails:validate}=harness().load('supabase/functions/_shared/courier-booking-validation.ts');
 const order={subtotal:110,currency:'AUD',wc_order_items:[]},quote={id:'q',priceIncludingGst:50};
 const labels=['Free up to $450'];
 const d={quoteId:'q',senderType:'sender',collectionDate:'2026-10-01',valueOfContent:110};
 for(const k of ['pickupFirstName','pickupLastName','pickupEmail','pickupAddress1','pickupPhone','destinationFirstName','destinationLastName','destinationEmail','destinationAddress1','destinationPhone','pickupTimeWindow','parcelContent','emailForDocuments'])d[k]='fixture';
 for(const k of ['acceptInsuranceConditions','acceptTermConditions','acceptAttachment','acceptNoDangerousGoods','acceptReadFinancialServiceGuide'])d[k]=true;
 const now=new Date('2026-09-29T10:00:00Z');
 assert.equal(validate(d,quote,order,labels,5000,now),5000);
 for(const patch of [{quoteId:'wrong'},{collectionDate:'2026-02-31'},{collectionDate:'2026-09-28'},{acceptTermConditions:false},{acceptNoDangerousGoods:false},{valueOfContent:1},{pickupAddress1:''}])assert.throws(()=>validate({...d,...patch},quote,order,labels,5000,now));
 assert.throws(()=>validate(d,quote,order,labels,undefined,now),/total charge/);
 assert.throws(()=>validate(d,quote,order,labels,4999,now),/total charge/);
 assert.throws(()=>validate(d,quote,order,[],5000,now),/Manual review/);
});

test('complete booking requires saved details, sends once, and blocks repeated charges and later edits',async()=>{
 const h=require('../../../.github/scripts/courier-fixture.cjs')();
 assert.equal((await h.call({action:'booking'})).status,409);
 assert.equal((await h.call({action:'save-order-details',payload:h.details})).status,200);
 assert.equal((await h.call({action:'booking',confirmedTotalCents:4999})).status,409);
 assert.equal((await h.call({action:'booking'})).status,200);
 assert.equal((await h.call({action:'booking'})).status,409);
 assert.equal((await h.call({action:'save-order-details',payload:h.details})).status,409);
 assert.equal(h.sent.filter(r=>r.url.includes('/order-booking/')).length,1);
 assert.equal(h.sent.filter(r=>r.url.includes('/save-order-details/')).length,1);
});
test('an uncertain booking POST cannot be sent again',async()=>{
 const h=require('../../../.github/scripts/courier-fixture.cjs')();
 assert.equal((await h.call({action:'save-order-details',payload:h.details})).status,200);
 // Throw only after insurance validation, when the real booking route is reached.
 const original=h.db.rpc;h.db.rpc=async(name,args)=>{const result=await original(name,args);if(name==='wc_claim_courier_booking')h.state.networkError=true;return result;};
 assert.equal((await h.call({action:'booking'})).status,500);
 h.state.networkError=false;
 assert.equal((await h.call({action:'booking'})).status,409);
 assert.equal(h.sent.filter(r=>r.url.includes('/order-booking/')).length,1);
});
test('quote and booking reject incomplete/unapproved/mismatched packing',async()=>{
 for(const kind of ['unapproved','missing-content','changed-dimensions']){
  const h=require('../../../.github/scripts/courier-fixture.cjs')();
  if(kind==='unapproved')h.shipment.packages_approved_at=null;
  if(kind==='missing-content')h.packages[0].contents=[];
  if(kind==='changed-dimensions')h.packages[0].weight_kg=11;
  assert.equal((await h.call({action:'quotes',payload:h.request})).status,409);
  assert.equal((await h.call({action:'save-order-details',payload:h.details})).status,409);
  assert.equal(h.sent.length,0);
 }
});

for(const action of ['list','send'])for(const role of ['no-session','outsider','inactive','worker','manager'])test(`Gmail ${action} provider boundary / ${role}`,async()=>{
 const sent=[];
 const member=role==='outsider'?null:{role:role==='worker'?'worker':'manager',active:role!=='inactive'};
 const h=harness('gmail-api',{member,rows:{wc_mailboxes:{refresh_token:'synthetic-refresh'}},fetch:async(url,init)=>{
  sent.push({url:String(url),method:init?.method||'GET'});
  if(String(url)==='https://oauth2.googleapis.com/token')return Response.json({access_token:'synthetic-access'});
  if(String(url).includes('/gmail/v1/users/me/messages'))return Response.json(action==='list'?{messages:[]}:{id:'synthetic-message'});
  throw Error('Unexpected mocked route');
 }});
 const response=await h.call({action,mailbox:'info',to:'recipient@example.invalid',subject:'Fixture',text:'Synthetic test'},role!=='no-session');
 const allowed=['worker','manager'].includes(role);
 assert.equal(response.status,allowed?200:role==='no-session'?401:403,await response.text());
 assert.equal(sent.length,allowed?2:0);
 if(allowed){assert.equal(sent[1].method,action==='send'?'POST':'GET');if(action==='send')assert.ok(sent[1].url.endsWith('/send'));}
});

test('Wix scheduled sync accepts exact server credential, never fulfillment through that exception',async()=>{
 const sent=[];
 const h=harness('wix-orders-sync',{member:null,rows:{wc_wix_contacts_sync:{synced_at:new Date().toISOString()}},fetch:async(url)=>{
  sent.push(String(url));assert.equal(String(url),'https://www.wixapis.com/ecom/v1/orders/search');return Response.json({orders:[]});
 }});
 h.db.auth.getUser=async()=>({data:{user:null}});
 const call=body=>h.request(new Request('https://fixture.invalid',{method:'POST',headers:{Authorization:'Bearer server-fixture'},body:JSON.stringify(body)}));
 assert.equal((await call({})).status,200);
 assert.equal(sent.length,1);
 assert.equal((await call({action:'markFulfilled',orderId:'fixture'})).status,401);
 assert.equal((await call({action:'fulfillShipping',orderId:'fixture'})).status,401);
 assert.equal(sent.length,1);
});

test('OAuth callback verifies signed state, rechecks manager and rejects replay before Google calls',async()=>{
 for(const mode of ['allowed','tampered','revoked']){
  const member={role:'manager',active:true},sent=[];
  const h=harness('gmail-oauth',{member,fetch:async(url)=>{
   sent.push(String(url));
   if(String(url)==='https://oauth2.googleapis.com/token')return Response.json({access_token:'synthetic-access',refresh_token:'synthetic-refresh'});
   if(String(url)==='https://www.googleapis.com/oauth2/v2/userinfo')return Response.json({email:'info@whitecorner.com.au'});
   throw Error('Unexpected mocked route');
  }});
  const start=await h.call({mailbox:'info'});assert.equal(start.status,200);
  let state=new URL((await start.json()).authUrl).searchParams.get('state');
  const pending=h.writes.find(w=>w.table==='wc_gmail_oauth_requests').value;
  let consumed=false;
  h.db.rpc=async(name,args)=>{assert.equal(name,'wc_consume_gmail_oauth');assert.equal(args.p_nonce,pending.nonce);if(consumed)return {data:null};consumed=true;return {data:pending.user_id};};
  if(mode==='tampered')state=state.split('.')[0]+'.invalid';
  if(mode==='revoked')member.active=false;
  const callback=()=>h.request(new Request('https://fixture.invalid/?code=synthetic-code&state='+encodeURIComponent(state)));
  const result=await callback();assert.equal(result.status,302);
  const connected=h.writes.filter(w=>w.table==='wc_mailboxes');
  assert.equal(connected.length,mode==='allowed'?1:0);assert.equal(sent.length,mode==='allowed'?2:0);
  if(mode==='allowed'){const replay=await callback();assert.match(replay.headers.get('location'),/error=/);assert.equal(sent.length,2);}
 }
});

