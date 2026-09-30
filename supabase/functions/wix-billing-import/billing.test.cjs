const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('../../../angular-app/node_modules/typescript');
function modules(overrides = {}) {
  const cache = new Map();
  const load = name => {
    const file = path.resolve(__dirname, name);
    if (cache.has(file)) return cache.get(file);
    const exports = {}; cache.set(file, exports);
    const result = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS}, reportDiagnostics: true});
    assert.equal(result.diagnostics.length, 0);
    vm.runInNewContext(result.outputText, {exports, require: n => n.startsWith('https:') ? overrides.supabase : load(path.relative(__dirname, path.resolve(path.dirname(file), n))), fetch, Response, Request, URL, AbortSignal, TextEncoder, TextDecoder, Uint8Array, crypto: require('node:crypto').webcrypto, ...overrides});
    return exports;
  };
  return load;
}
const load = modules(), {queryPage, snapshot, downloadPdf, BillingError} = load('wix.ts');
const fixture = {id: 'invoice-1', revision: '1', createdDate: '2026-01-01T00:00:00Z', currency: 'AUD', totals: {total: '123.4567', paidAmount: '100.00'}, numbering: {prefix: 'INV-', number: 1}};
test('queries all statuses using cursor pagination and a fixed creation cutoff', async () => {
  let calls = 0;
  const page = await queryPage('invoice', {}, 'cursor-1', fixture.createdDate, async (url, options) => {
    calls++;
    assert.equal(url, 'https://www.wixapis.com/invoices/v4/invoices/query');
    const {query} = JSON.parse(options.body);
    assert.equal(query.filter, undefined);
    assert.equal(query.sort, undefined);
    assert.deepEqual(query.cursorPaging, {limit: 50, cursor: 'cursor-1'});
    return Response.json({invoices: [fixture], pagingMetadata: {count: 1, hasNext: true, cursors: {next: 'cursor-2'}}});
  });
  assert.equal(calls, 1); assert.equal(page.next, 'cursor-2'); assert.equal(page.complete, false);
  assert.equal(page.rows[0].total, '123.4567'); assert.equal(page.rows[0].paid, '100.00');
  await queryPage('receipt', {}, null, fixture.createdDate, async (_, options) => {
    const {query} = JSON.parse(options.body);
    assert.deepEqual(query.filter, {createdDate: {$lte: fixture.createdDate}});
    assert.deepEqual(query.sort, [{fieldName: 'id', order: 'ASC'}]);
    assert.deepEqual(query.cursorPaging, {limit: 50});
    return Response.json({receipts: [], pagingMetadata: {count: 0, hasNext: false}});
  });
});
test('missing counts, stuck cursors and duplicate IDs never claim completion', async () => {
  for (const value of [
    {invoices: []},
    {invoices: [], pagingMetadata: {count: 0, hasNext: true, cursors: {next: 'same'}}},
    {invoices: [fixture, fixture], pagingMetadata: {count: 2, hasNext: false}},
    {invoices: [fixture], pagingMetadata: {count: 2, hasNext: false}},
  ]) await assert.rejects(() => queryPage('invoice', {}, 'same', fixture.createdDate, async () => Response.json(value)), BillingError);
  const result = await queryPage('receipt', {}, null, fixture.createdDate, async () => Response.json({receipts: [], pagingMetadata: {count: 0, hasNext: false}}));
  assert.equal(result.complete, true);
});
test('permissions and legacy invoice API access are explicit, without response payload leaks', async () => {
  for (const [status, message] of [[403, /Manage Invoices/], [428, /not enabled/], [429, /429/]]) {
    await assert.rejects(() => queryPage('invoice', {}, null, fixture.createdDate, async () => new Response('SECRET CUSTOMER PAYLOAD', {status})), message);
  }
});
test('source snapshots retain original precision, history and explicit order associations', async () => {
  const s = await snapshot('receipt', {...fixture, sourceReference: {wixPaymentOrder: {orderId: 'not-ecommerce'}}, payment: {amount: '9.2300'}});
  assert.equal(s.wix_order_id, null); assert.equal(s.paid, '9.2300');
  assert.equal((await snapshot('receipt', {...fixture, sourceReference: {wixEcomOrder: {orderId: 'order-id'}}})).wix_order_id, 'order-id');
  assert.equal((await snapshot('invoice', {...fixture, reference: {migratedReference: {orderId: 'historic-id'}}})).wix_order_id, 'historic-id');
  assert.equal((await snapshot('invoice', {id: 'draft'})).total, null);
  await assert.rejects(() => snapshot('invoice', {...fixture, totals: {total: 'NaN'}}), /monetary/);
  const a = await snapshot('invoice', {...fixture, documentInfo: {status: 'AVAILABLE', downloadUrl: 'https://private-url-a'}});
  const b = await snapshot('invoice', {...fixture, documentInfo: {status: 'AVAILABLE', downloadUrl: 'https://private-url-b'}});
  assert.equal(a.source_hash, b.source_hash); assert.equal(a.source_json.documentInfo.downloadUrl, undefined);
  assert.notEqual(a.source_hash, (await snapshot('invoice', {...fixture, revision: '2'})).source_hash);
});
test('PDF copying rejects private networks, redirects, oversize and HTML responses', async () => {
  for (const url of ['http://files.wix.com/doc', 'https://127.0.0.1/file', 'https://files.wix.com.evil.test/a', 'https://user:pass@files.wix.com/a']) {
    await assert.rejects(() => downloadPdf(url, async () => { throw Error('Must not fetch'); }), /host/);
  }
  await assert.rejects(() => downloadPdf('https://files.wix.com/a', async () => new Response('html')), /non-PDF/);
  await assert.rejects(() => downloadPdf('https://files.wix.com/a', async () => new Response('', {headers: {'content-length': String(21 * 1024 * 1024)}})), /limit/);
  const bytes = await downloadPdf('https://files.wix.com/a', async (_, options) => {
    assert.equal(options.redirect, 'error'); assert.equal(options.headers, undefined);
    return new Response('%PDF-1.7\nfixture');
  });
  assert.equal(new TextDecoder().decode(bytes), '%PDF-1.7\nfixture');
});
test('import saves a page only after validated reads and resumes the server cursor', async () => {
  const calls = [], {billingAction} = load('handler.ts');
  const run = {id: 'run', cursor: 'saved-cursor', started_at: fixture.createdDate, saved_count: 50, scan_complete: false};
  const db = {rpc: async (name, args) => {
    calls.push({name, args}); return {data: name === 'wc_billing_begin' ? run : {...run, saved_count: 51, scan_complete: true}};
  }};
  const result = await billingAction(db, {}, 'site', 'actor', {action: 'importPage', kind: 'invoice'}, async (_, options) => {
    assert.equal(JSON.parse(options.body).query.cursorPaging.cursor, 'saved-cursor');
    return Response.json({invoices: [fixture], pagingMetadata: {count: 1, hasNext: false}});
  });
  assert.equal(result.run.saved_count, 51); assert.equal(calls[1].args.p_cursor, 'saved-cursor'); assert.equal(calls[1].args.p_complete, true);
});
test('read-only access audit is independent for invoices and receipts', async () => {
  const {billingAction} = load('handler.ts');
  const result = await billingAction({}, {}, 'site', 'actor', {action: 'checkAccess'}, async url => url.includes('invoices') ? new Response('', {status: 428}) : Response.json({receipts: [], pagingMetadata: {count: 0, hasNext: false}}));
  assert.equal(result.results[0].available, false); assert.equal(result.results[1].available, true);
});
test('Edge authorization rejects outsiders and worker imports before private reads', async () => {
  for (const role of ['outsider', 'inactive', 'worker']) {
    let handler;
    const db = {auth: {getUser: async () => ({data: {user: {id: 'user'}}})}, from: table => {
      assert.equal(table, 'wc_hub_members');
      return {select: () => ({eq: () => ({maybeSingle: async () => ({data: role === 'outsider' ? null : {role, active: role !== 'inactive'}})})})};
    }};
    const local = modules({supabase: {createClient: () => db}, Deno: {env: {get: () => 'fixture'}, serve: h => {handler = h;}}});
    local('index.ts');
    const response = await handler(new Request('https://fixture.invalid', {method: 'POST', headers: {Authorization: 'Bearer fixture'}, body: JSON.stringify({action: 'importPage', kind: 'invoice'})}));
    assert.equal(response.status, 403);
  }
});

test('PDF upload confirmation, failure preservation and signed URLs stay on the server', async () => {
  const {billingAction} = load('handler.ts');
  const source = {...fixture, documentInfo: {status: 'AVAILABLE', downloadUrl: 'https://files.wix.com/fixture.pdf'}};
  const snap = await snapshot('invoice', source);
  const doc = {id: '11111111-1111-4111-8111-111111111111', kind: 'invoice', wix_id: fixture.id, source_hash: snap.source_hash};
  const version = {document_id: doc.id, source_hash: snap.source_hash, source_json: snap.source_json};
  const writes = []; let rejectUpload = true;
  const db = {from: table => {
    let update;
    const q = {select: () => q, eq: () => q, is: () => q, order: () => q,
      update: value => { update = value; writes.push(value); return q; },
      maybeSingle: async () => ({data: doc}), single: async () => ({data: update}),
      then: resolve => Promise.resolve({data: table === 'wc_billing_document_versions' ? [version] : doc}).then(resolve)};
    return q;
  }, storage: {from: bucket => {
    assert.equal(bucket, 'billing-documents');
    return {upload: async (path, bytes) => { assert.ok(path.endsWith('.pdf')); assert.equal(new TextDecoder().decode(bytes), '%PDF-fixture'); return {error: rejectUpload ? {message: 'secret provider payload'} : null}; },
      createSignedUrl: async (path, ttl) => { assert.equal(ttl, 60); assert.equal(path, version.pdf_path); return {data: {signedUrl: 'https://fixture.invalid/short-lived'}}; }};
  }}};
  const call = async url => String(url).includes('wixapis') ? Response.json({invoice: source}) : new Response('%PDF-fixture');
  await assert.rejects(() => billingAction(db, {}, 'site', 'actor', {action: 'copyPdf', id: doc.id}, call), /could not be saved/);
  assert.equal(writes.length, 1); assert.ok(writes[0].pdf_error); assert.equal(writes[0].pdf_path, undefined);
  rejectUpload = false;
  const result = await billingAction(db, {}, 'site', 'actor', {action: 'copyPdf', id: doc.id}, call);
  assert.equal(result.copied, true); assert.ok(writes[1].pdf_path); assert.equal(writes[1].pdf_error, null);
  Object.assign(version, writes[1]);
  const opened = await billingAction(db, {}, 'site', 'actor', {action: 'openPdf', id: doc.id}, () => { throw Error('Must not call Wix'); });
  assert.equal(opened.url, 'https://fixture.invalid/short-lived');
});
