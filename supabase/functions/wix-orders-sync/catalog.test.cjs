const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const ts = require('../../../angular-app/node_modules/typescript');
const mod = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(__dirname + '/catalog.ts', 'utf8'), {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS}}).outputText, {exports: mod, fetch, AbortSignal, Set});
const product = {id: 'backdrop', name: 'Backdrop', visible: true, variants: [{id:'raw'}, {id:'white'}]};
const api = (version, data) => async url => Response.json(url.endsWith('/version') ? {catalogVersion: version} : data);
test('V1 includes hidden products and colour variants, with resumable offset', async () => {
  const result = await mod.queryCatalogPage({}, {}, async (url, init) => {
    if (url.endsWith('/version')) {assert.equal(init.method, 'GET'); return Response.json({catalogVersion:'V1_CATALOG'});}
    assert.equal(url, 'https://www.wixapis.com/stores-reader/v1/products/query');
    const body = JSON.parse(init.body); assert.equal(body.includeHiddenProducts, true); assert.equal(body.includeVariants, true);
    assert.equal(body.query.paging.offset, 0);
    return Response.json({products:[product], totalResults:2});
  });
  assert.equal(result.nextOffset, 1); assert.equal(result.complete, false); assert.equal(result.products[0].variantCount, 2);
  const last = await mod.queryCatalogPage({offset:1}, {}, api('V1_CATALOG', {products:[product],totalResults:2}));
  assert.equal(last.complete, true); assert.equal(last.detailsComplete, false);
});
test('V3 uses cursors and does not claim variant or hidden completeness', async () => {
  const result = await mod.queryCatalogPage({}, {}, api('V3_CATALOG', {products:[product],pagingMetadata:{cursors:{next:'next'}}}));
  assert.equal(result.nextCursor, 'next'); assert.equal(result.products[0].variantCount, null); assert.equal(result.hiddenCoverage, 'unverified');
  await assert.rejects(() => mod.queryCatalogPage({cursor:'same'}, {}, api('V3_CATALOG', {products:[product],pagingMetadata:{cursors:{next:'same'}}})), /stalled/);
});
test('denied permissions never fall back to a smaller visible catalogue or expose payloads', async () => {
  let calls = 0;
  await assert.rejects(() => mod.queryCatalogPage({}, {}, async () => {calls++; return new Response('secret payload', {status:403});}), /Read v3 catalog/);
  assert.equal(calls, 1);
});
test('unknown versions, missing metadata and invalid totals fail closed', async () => {
  await assert.rejects(() => mod.queryCatalogPage({}, {}, api('unknown', {})), /unsupported/);
  await assert.rejects(() => mod.queryCatalogPage({}, {}, api('V3_CATALOG', {products:[]})), /metadata/);
  await assert.rejects(() => mod.queryCatalogPage({}, {}, api('V1_CATALOG', {products:[],totalResults:4})), /stalled/);
  await assert.rejects(() => mod.queryCatalogPage({version:'V1_CATALOG'}, {}, api('V3_CATALOG', {})), /changed/);
});
