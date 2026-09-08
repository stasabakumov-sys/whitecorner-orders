// Executes the actual handler with fake Deno/auth/database/provider boundaries.
// No network, credentials or production fixtures. Run with: node --test .../handler.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('../../../angular-app/node_modules/typescript');

function compile(file, requireMock, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(__dirname + '/' + file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: requireMock,
    structuredClone, Response, Request, AbortSignal, ...globals });
  return module.exports;
}
const domain = compile('domain.ts', () => { throw new Error('Unexpected import'); });
function setup({ authenticated = true, key = true, dbError = false, providerStatus = 200, providerBody, rows = [] } = {}) {
  const calls = [], reads = [];
  let handler;
  const createClient = () => ({
    auth: { getUser: async () => ({ data: { user: authenticated ? { id: 'test-user' } : null } }) },
    from: table => ({
      select: fields => ({
        in: (column, numbers) => ({
          eq: async (filter, value) => { reads.push({ table, fields, column, numbers, filter, value }); return { data: rows, error: dbError ? { message: 'private db details' } : null }; },
        }),
      }),
    }),
  });
  compile('index.ts', name => name === './domain.ts' ? domain : { createClient }, {
    Deno: { serve: fn => { handler = fn; }, env: { get: keyName => ({
      SUPABASE_URL: 'https://database.example.test', SUPABASE_ANON_KEY: 'test-anon',
      OPENAI_API_KEY: key ? 'test-provider' : undefined,
    })[keyName] } },
    fetch: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return new Response(JSON.stringify(providerBody ?? {
        status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(result()) }] }],
      }), { status: providerStatus });
    },
  });
  const request = (body, method = 'POST') => handler(new Request('https://local.example.test', {
    method, ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body), headers: { Authorization: 'Bearer synthetic' } } : {}),
  }));
  return { request, calls, reads };
}
function result() {
  return {
    needs_reply: true, intent: 'Product question', intent_labels: ['Product question'], linked_order: null,
    confidence: 0.9, summary: 'Configuration enquiry', draft_reply: 'Could you confirm the model?',
    review_required: false, review_reason: '', facts: [],
    conflicts: [], missing_information: ['Model'], risk_flags: [], next_step: 'Confirm the model.',
    claim_source_map: [{ claim: 'Clarify the requested configuration.', source_ids: ['email:m1'] }],
  };
}
const input = () => ({ message: { thread_complete: true, thread: [
  { id: 'm1', from: 'customer@example.test', date: '2026-09-08T00:00:00Z', body: 'Which cart fits this setup?' },
] }, orders: [] });

test('OPTIONS and method guard never invoke provider', async () => {
  const s = setup();
  assert.equal((await s.request(null, 'OPTIONS')).status, 200);
  assert.equal((await s.request(null, 'GET')).status, 405);
  assert.equal(s.calls.length, 0);
});
test('authentication is required even for status', async () => {
  const s = setup({ authenticated: false });
  assert.equal((await s.request({ action: 'status' })).status, 401);
  assert.equal(s.calls.length, 0);
});
test('status reports knowledge version and missing key prevents analysis', async () => {
  const s = setup({ key: false });
  const status = await (await s.request({ action: 'status' })).json();
  assert.equal(status.connected, false);
  assert.equal(status.knowledge_version, domain.KNOWLEDGE_VERSION);
  assert.equal((await s.request(input())).status, 503);
});
test('invalid JSON, unknown actions and oversize context fail before model call', async () => {
  const s = setup();
  assert.equal((await s.request('{bad')).status, 400);
  assert.equal((await s.request({ action: 'send' })).status, 400);
  assert.equal((await s.request({ message: { body: 'x'.repeat(250001) } })).status, 413);
  assert.equal(s.calls.length, 0);
});
test('server refresh replaces client-invented order facts and exposes only selected context', async () => {
  const s = setup({ rows: [{ order_number: '100', total: 400, phone: 'private-phone' }] });
  const body = input();
  body.orders = [{ order_number: '100', total: 1 }];
  const response = await s.request(body);
  assert.equal(response.status, 200);
  const sent = JSON.parse(s.calls[0].body.input[0].content);
  assert.equal(sent.candidate_orders[0].total, 400);
  assert.equal(sent.candidate_orders[0].phone, undefined);
  assert.equal(s.reads[0].table, 'wc_orders');
  assert.equal(s.reads[0].filter, 'is_hidden');
  assert.equal(s.calls[0].body.store, false);
  assert.equal(s.calls[0].body.tools, undefined);
  assert.equal(s.calls[0].body.text.format.strict, true);
  assert.equal((await response.json()).analysis.review_required, true);
});
test('a failed order read stops generation and does not expose the database error', async () => {
  const s = setup({ dbError: true });
  const body = input(); body.orders = [{ order_number: '100' }];
  const response = await s.request(body);
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes('private db details'));
  assert.equal(s.calls.length, 0);
});
test('provider errors are sanitised and no customer payload is returned', async () => {
  const s = setup({ providerStatus: 400, providerBody: { error: 'private customer payload' } });
  const response = await s.request(input());
  assert.equal(response.status, 502);
  assert.ok(!(await response.text()).includes('private customer payload'));
});
test('incomplete, refused and invalid output never returns a partial draft', async () => {
  for (const providerBody of [
    { status: 'incomplete', output: [] },
    { status: 'completed', output: [{ content: [{ type: 'refusal', refusal: 'private' }] }] },
    { status: 'completed', output: [{ content: [{ type: 'output_text', text: '{bad' }] }] },
    { status: 'completed', output: [{ content: [{ type: 'output_text', text: '{}' }] }] },
  ]) {
    const response = await setup({ providerBody }).request(input());
    assert.equal(response.status, 502);
    assert.equal((await response.json()).analysis, undefined);
  }
});
