const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ts=require('../../../angular-app/node_modules/typescript');
function harness({access=true,dbError=false,page={collections:[{id:'c',name:'Fixture'}],totalResults:1}}={}) {
 let handler;const writes=[],calls=[];
 const db={from:table=>{calls.push(table);const q={select:()=>q,eq:()=>q,gt:()=>q,
  maybeSingle:async()=>({data:table==='wc_wix_catalog_jobs'?{run_id:'fixture-run',complete:true}:access?{expires_at:'future'}:null,error:dbError?{}:null}),
  upsert:async rows=>{writes.push({table,rows});return {error:null};}};return q;}};
 const exports={};
 const code=ts.transpileModule(fs.readFileSync(__dirname+'/index.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 vm.runInNewContext(code,{exports,require:name=>name.includes('supabase-js')?{createClient:()=>db}:{importCatalogPage:async()=>({ok:true,complete:true})},
  Deno:{serve:fn=>handler=fn,env:{get:key=>({SUPABASE_URL:'https://hub.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture',WIX_API_KEY:'fixture',WIX_SITE_ID:'fixture'})[key]}},
  fetch:async()=>Response.json(page),Request,Response,URL,TextEncoder,crypto:globalThis.crypto,Date,AbortSignal,Set,Uint8Array});
 return {calls,writes,call:(body,token='a'.repeat(64),method='POST')=>handler(new Request('https://fixture.invalid',{method,headers:token?{'x-catalog-token':token}:{},...(method==='POST'?{body:JSON.stringify(body)}:{})}))};
}
for(const [label,options,token] of [['missing',{},''],['malformed',{},'bad'],['expired or revoked',{access:false},'a'.repeat(64)],['lookup failure',{dbError:true},'a'.repeat(64)]]) {
 test('denies '+label+' token before catalogue actions',async()=>{const h=harness(options);assert.equal((await h.call({action:'collections'},token)).status,403);assert.equal(h.writes.length,0);assert(h.calls.every(t=>t==='wc_catalog_import_access'));});
}
test('rejects unknown actions, unsupported methods and unsafe media destinations',async()=>{
 const h=harness();assert.equal((await h.call({action:'booking'})).status,400);assert.equal((await h.call({},undefined,'GET')).status,405);
 for(const url of ['http://static.wixstatic.com/a','https://evil.invalid/a','https://secret@static.wixstatic.com/a'])assert.equal((await h.call({action:'prepareMedia',url,bucket:'catalog-media',contentType:'image/jpeg'})).status,400);
 assert.equal(h.writes.length,0);
});
test('collections save only a validated complete page',async()=>{
 const h=harness();assert.equal((await h.call({action:'collections'})).status,200);assert.equal(h.writes.length,1);
 for(const page of [{collections:[],totalResults:0},{collections:[{id:'c',name:'A'}],totalResults:2},{collections:[{id:'c',name:'A'},{id:'c',name:'B'}],totalResults:2}]) {
  const bad=harness({page});assert.equal((await bad.call({action:'collections'})).status,400);assert.equal(bad.writes.length,0);
 }
});
