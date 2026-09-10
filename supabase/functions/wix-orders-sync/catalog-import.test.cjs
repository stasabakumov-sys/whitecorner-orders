const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ts=require('../../../angular-app/node_modules/typescript');
function load(file){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(__dirname+'/'+file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports,require:()=>load('order-history.ts'),fetch,AbortSignal,Set});return exports;}
const mod=load('catalog-import.ts');
test('backdrop source preserves colour variants, pricing and invalid Unicode exact source',()=>{
 const p={id:'backdrop',name:'Backdrop',description:'bad\0😀',variants:[{id:'raw',choices:{Colour:'Raw'},variant:{priceData:{price:100}}},{id:'white',choices:{Colour:'White'},variant:{priceData:{price:150}}}]};
 const s=mod.catalogSnapshot(p);assert.deepEqual(JSON.parse(s.source_json),p);assert.equal(s.product.variants.length,2);assert.equal(s.product.variants[1].variant.priceData.price,150);
 assert.throws(()=>mod.catalogSnapshot({...p,variants:undefined}),/variants/);
 assert.throws(()=>mod.catalogSnapshot({...p,variants:Array.from({length:1000},(_,i)=>({id:String(i)}))}),/truncated/);
});
test('uses persisted offset and commits only validated V1 pages, without client-supplied source data',async()=>{
 let page;
 const db={rpc:async(name,args)=>{if(name==='wc_wix_catalog_begin')return{data:{run_id:'run',next_offset:25,complete:false}};page=args;return{data:{run_id:'run',next_offset:26,complete:true}};}};
 const out=await mod.importCatalogPage(db,{},'site',{offset:999},async(url,init)=>{
  if(url.endsWith('/version'))return Response.json({catalogVersion:'V1_CATALOG'});
  const req=JSON.parse(init.body);assert.equal(req.query.paging.offset,25);assert.equal(req.includeVariants,true);assert.equal(req.includeHiddenProducts,true);
  return Response.json({totalResults:26,products:[{id:'b',name:'Backdrop',variants:[{id:'v'}]}]});
 });
 assert.equal(page.p_offset,25);assert.equal(out.complete,true);
});
test('permission errors and V3 cannot write a page or expose private error bodies',async()=>{
 const db={rpc:async()=>{throw Error('must not write');}};
 await assert.rejects(()=>mod.importCatalogPage(db,{},'site',{},async()=>Response.json({catalogVersion:'V3_CATALOG'})),/V1/);
 await assert.rejects(()=>mod.importCatalogPage(db,{},'site',{},async()=>new Response('secret',{status:403})),/permission denied/);
});
