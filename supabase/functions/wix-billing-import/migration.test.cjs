// Run with BILLING_PGLITE_PATH pointing to a disposable @electric-sql/pglite install.
// This is an isolated PostgreSQL fixture, never the production database.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const {PGlite} = require(process.env.BILLING_PGLITE_PATH || '@electric-sql/pglite');
const manager = '11111111-1111-4111-8111-111111111111';
const outsider = '22222222-2222-4222-8222-222222222222';
test('billing migration: transactional resume, versions, superseded runs, links and private RLS', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage;
      create schema supabase_migrations;
      create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);
      create table auth.users(id uuid primary key);
      create table public.wc_hub_members(user_id uuid primary key,active boolean,role text);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function public.wc_is_active_hub_member() returns boolean language sql stable security definer as $$select exists(select 1 from wc_hub_members where user_id=auth.uid() and active)$$;
      create table public.wc_orders(id uuid primary key,wix_order_id text unique,order_number text,internal_comment text);
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text);
      alter table storage.objects enable row level security;
      grant usage on schema public,auth,storage to anon,authenticated,service_role;
      grant select on public.wc_orders to authenticated,service_role;
      grant all on storage.objects to authenticated,service_role;
      create policy legacy_broad_policy on storage.objects for all to authenticated using(true) with check(true);
      insert into auth.users values('${manager}'),('${outsider}');
      insert into wc_hub_members values('${manager}',true,'manager');
      insert into wc_orders values(gen_random_uuid(),'wix-order-1','WC-101','keep local field');
    `);
    const previousFetch = global.fetch, previousArgs = process.argv, previousToken = process.env.SUPABASE_ACCESS_TOKEN;
    try {
      process.argv = [...process.argv, '--apply']; process.env.SUPABASE_ACCESS_TOKEN = 'test-fixture-only';
      global.fetch = async (url, options) => {
        assert.equal(url, 'https://api.supabase.com/v1/projects/zgvnrpspwluapaxnycrg/database/query');
        const {query} = JSON.parse(options.body);
        const result = await db.exec(query);
        return Response.json(result.at(-1).rows);
      };
      const {pathToFileURL} = require('node:url');
      const release = pathToFileURL(path.join(__dirname, '../../../.github/scripts/wix-billing-release.mjs')).href;
      await import(release + '?first-apply');
      await import(release + '?idempotent-replay');
    } finally {
      global.fetch = previousFetch; process.argv = previousArgs;
      if (previousToken === undefined) delete process.env.SUPABASE_ACCESS_TOKEN; else process.env.SUPABASE_ACCESS_TOKEN = previousToken;
    }
    const begin = async (restart = false) => (await db.query('select * from wc_billing_begin($1,$2,$3,$4)', ['site', 'invoice', manager, restart])).rows[0];
    const row = (id, hash = 'a'.repeat(64)) => ({wix_id: id, source_hash: hash, source_json: {id, original: true}, number: 'INV-1', status: 'PAID', total: '123.4567', paid: '123.4567', wix_order_id: 'wix-order-1'});
    const save = async (run, cursor, next, complete, rows) => (await db.query('select * from wc_billing_save_page($1,$2,$3,$4,$5::jsonb)', [run.id, cursor, next, complete, JSON.stringify(rows)])).rows[0];
    const first = await begin();
    const one = await save(first, null, 'next-page', false, [row('first')]);
    assert.equal(one.saved_count, 1); assert.equal(one.cursor, 'next-page');
    assert.equal((await begin()).id, first.id);
    await assert.rejects(() => save(first, null, 'next-page', false, [row('first')]), /scan changed/);
    // One new record followed by a duplicate rolls back the entire page.
    await assert.rejects(() => save(first, 'next-page', null, true, [row('second'), row('first')]), /duplicate key/);
    assert.equal((await db.query('select count(*)::int as n from wc_billing_documents')).rows[0].n, 1);
    assert.equal((await begin()).saved_count, 1);
    const done = await save(first, 'next-page', null, true, [row('second')]);
    assert.equal(done.scan_complete, true); assert.equal(done.saved_count, 2);
    const fresh = await begin(true);
    await save(fresh, null, null, true, [row('first', 'b'.repeat(64))]);
    assert.equal((await db.query('select count(*)::int as n from wc_billing_documents')).rows[0].n, 2, 'absent documents must not be deleted');
    assert.equal((await db.query('select count(*)::int as n from wc_billing_document_versions')).rows[0].n, 3);
    assert.equal((await db.query('select internal_comment from wc_orders')).rows[0].internal_comment, 'keep local field');
    assert.equal((await db.query('select order_number,total from wc_billing_document_list limit 1')).rows[0].total, '123.4567');
    const stale = await begin(true); await begin(true);
    await assert.rejects(() => save(stale, null, null, true, []), /newer billing scan/);
    await db.exec(`insert into storage.objects(bucket_id) values('billing-documents'); set role authenticated; select set_config('request.jwt.claim.sub','${outsider}',false);`);
    assert.equal((await db.query('select * from wc_billing_document_versions')).rows.length, 0);
    await db.exec(`select set_config('request.jwt.claim.sub','${manager}',false);`);
    assert.equal((await db.query('select * from wc_billing_document_versions')).rows.length, 3);
    assert.equal((await db.query('select * from storage.objects')).rows.length, 0, 'broad legacy storage policy must not expose archive');
    await assert.rejects(() => db.exec("insert into storage.objects(bucket_id) values('billing-documents')"), /row-level security/);
    await assert.rejects(() => db.exec("update wc_billing_documents set total='0'"), /permission denied/);
    await assert.rejects(() => begin(), /permission denied/);
    await db.exec('reset role; set role anon');
    await assert.rejects(() => db.exec('select * from wc_billing_documents'), /permission denied/);
  } finally { await db.close(); }
});
