const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ts=require('../../../angular-app/node_modules/typescript');
const mod={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(__dirname+'/order-history.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports:mod,fetch,AbortSignal});
test('JSONB snapshot replaces invalid Unicode while preserving exact source and valid emoji',async()=>{
 const original={id:'unicode',number:3,buyerNote:'before\0after\ud800 / \udfff / 😀 / \\u0000',lineItems:[{name:'Backdrop\0'}]};
 let saved;
 const db={from:()=>({upsert:async rows=>{saved=rows[0];return{error:null};}})};
 await mod.importOrderHistory(db,{}, {},async()=>Response.json({orders:[original]}));
 assert.equal(saved.raw_order.buyerNote,'before�after� / � / 😀 / \\u0000');
 assert.deepEqual(JSON.parse(saved.source_json),original);
 assert.equal(mod.historySnapshot({note:'normal 😀'}).source_json,null);
});
test('database errors expose only the safe code, not customer details',async()=>{
 const db={from:()=>({upsert:async()=>({error:{code:'22P05',message:'private customer data'}})})};
 await assert.rejects(()=>mod.importOrderHistory(db,{}, {},async()=>Response.json({orders:[{id:'x'}]})),{message:'Could not save Wix order history (22P05)'});
});
test('all statuses are imported as isolated snapshots; cursor batches are resumable and idempotent',async()=>{
 const saved=new Map();const requests=[];
 const db={from:table=>{assert.equal(table,'wc_wix_order_history');return{upsert:async(rows,opts)=>{assert.equal(opts.onConflict,'wix_order_id');for(const row of rows)saved.set(row.wix_order_id,row);return{error:null};}};}};
 const call=async(url,options)=>{assert.equal(url,'https://www.wixapis.com/ecom/v1/orders/search');const req=JSON.parse(options.body);requests.push(req);assert.equal(req.search.filter,undefined);
 return Response.json(req.search.cursorPaging.cursor?{orders:[{id:'cancelled',number:2,status:'CANCELED',archived:true}],pagingMetadata:{cursors:{}}}:{orders:[{id:'completed',number:1,fulfillmentStatus:'FULFILLED'}],pagingMetadata:{cursors:{next:'page2'}}});};
 const first=await mod.importOrderHistory(db,{}, {},call);assert.equal(first.complete,false);assert.equal(first.nextCursor,'page2');
 const last=await mod.importOrderHistory(db,{}, {cursor:first.nextCursor},call);assert.equal(last.complete,true);assert.equal(saved.size,2);
 await mod.importOrderHistory(db,{}, {pages:10},call);assert.equal(saved.size,2);assert.equal(saved.get('cancelled').raw_order.archived,true);
});
test('Wix errors and stalled cursors cannot report successful full history',async()=>{
 const db={from:()=>({upsert:async()=>({error:null})})};
 await assert.rejects(()=>mod.importOrderHistory(db,{}, {},async()=>new Response('',{status:403})),/403/);
 await assert.rejects(()=>mod.importOrderHistory(db,{}, {cursor:'same'},async()=>Response.json({orders:[{id:'x'}],pagingMetadata:{cursors:{next:'same'}}})),/stalled/);
});
