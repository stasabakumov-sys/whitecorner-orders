// Isolated PostgreSQL regression tests. Pass an installed @electric-sql/pglite
// module path; this never connects to Supabase or a network database.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const order = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const token = '00000000-0000-4000-8000-000000000003';
const token2 = '00000000-0000-4000-8000-000000000004';
await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth;
  create function auth.uid() returns uuid language sql as
    'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
  create table wc_orders(id uuid primary key, fulfillment_status text, raw_order jsonb, wix_synced_at timestamptz);
  create table wc_shipping_products(id uuid primary key);
  insert into wc_orders values('${order}','NOT_FULFILLED','{}',null),('${other}','NOT_FULFILLED','{}',null);
`);
for (const file of ['20260831000100_create_wc_fulfilment.sql','20260831000300_create_wc_shipments.sql','20260903000100_add_fast_courier_quotes.sql']) {
  const sql = await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8');
  // gen_random_uuid is built into this PostgreSQL runtime; pgcrypto is not needed.
  await db.exec(sql.replace(/create extension if not exists pgcrypto;/gi, ''));
}
await db.exec(`create table wc_order_activity(id uuid default gen_random_uuid(),order_id uuid references wc_orders(id),activity_type text,message text,created_by text);`);
await db.exec(await readFile(new URL('../migrations/20260905000100_shipping_fulfillment_sync.sql', import.meta.url), 'utf8'));
await db.exec(`
  insert into wc_fulfilment(id,order_id,route,status) values('${order}','${order}','Shipping','Shipping Preparation'),('${other}','${other}','Pickup','Awaiting Pickup');
  insert into wc_shipments(id,fulfilment_id,order_id,status,courier_order_id,selected_quote)
    values('${order}','${order}','${order}','Quote Selected','test-courier','{"id":"test-quote"}');
  grant usage on schema public to authenticated,anon,service_role;
  grant select,insert,update,delete on wc_shipping_fulfillment_sync to authenticated,anon;
`);
const scalar = async sql => Object.values((await db.query(sql)).rows[0])[0];
assert.equal(await scalar('select count(*)::int from wc_shipping_fulfillment_sync'), 0, 'migration must not process old orders');
await assert.rejects(db.exec(`select wc_save_shipping_booking('${order}','{}')`), /Authentication required/);
await db.exec(`set request.jwt.claim.sub='${token}'; set role authenticated; select wc_save_shipping_booking('${order}','{}'); reset role;`);
assert.equal(await scalar(`select status from wc_fulfilment where order_id='${order}'`), 'Shipping Booked');
assert.equal(await scalar(`select status from wc_shipments where order_id='${order}'`), 'Shipping Booked');
await db.exec('set role authenticated');
assert.equal(await scalar('select count(*)::int from wc_shipping_fulfillment_sync'), 1);
assert.equal((await db.query("update wc_shipping_fulfillment_sync set status='synced' returning *")).rows.length, 0, 'RLS prevents forged success');
await assert.rejects(db.exec(`select wc_claim_shipping_fulfillment('${order}','${token}')`), /permission denied/);
await db.exec('reset role; set role anon');
assert.equal(await scalar('select count(*)::int from wc_shipping_fulfillment_sync'), 0, 'anon cannot read synchronization data');
await db.exec('reset role; set role service_role');
await assert.rejects(db.exec(`select wc_claim_shipping_fulfillment('${other}','${token}')`), /saved shipping booking/);
assert.equal((await scalar(`select wc_claim_shipping_fulfillment('${order}','${token}')`)).status, 'claimed');
assert.equal((await scalar(`select wc_claim_shipping_fulfillment('${order}','${token2}')`)).status, 'busy');
await db.exec(`select wc_record_shipping_fulfillment('${order}','${token}','uncertain'); reset role;`);
await db.exec(`update wc_shipping_fulfillment_sync set started_at=now()-interval '3 minutes'`);
await db.exec('set role service_role');
assert.equal((await scalar(`select wc_claim_shipping_fulfillment('${order}','${token2}')`)).uncertain, true);
await assert.rejects(db.exec(`select wc_record_shipping_fulfillment('${order}','${token}','synced')`), /lease lost/);
await db.exec('reset role');
// An activity write failure must roll back BOTH local statuses and sync state.
await db.exec(`create function reject_note() returns trigger language plpgsql as $$begin raise exception 'test note failure'; end$$;
 create trigger reject_note before insert on wc_order_activity for each row execute function reject_note();`);
await assert.rejects(db.exec(`select wc_record_shipping_fulfillment('${order}','${token2}','synced')`), /test note failure/);
assert.equal(await scalar(`select status from wc_fulfilment where order_id='${order}'`), 'Shipping Booked');
assert.equal(await scalar(`select fulfillment_status from wc_orders where id='${order}'`), 'NOT_FULFILLED');
await db.exec(`drop trigger reject_note on wc_order_activity; set role service_role;
 select wc_record_shipping_fulfillment('${order}','${token2}','synced',null,'wix-test'); reset role;`);
assert.equal(await scalar(`select status from wc_fulfilment where order_id='${order}'`), 'Fulfilled');
assert.equal(await scalar(`select fulfillment_status from wc_orders where id='${order}'`), 'FULFILLED');
assert.equal(await scalar(`select raw_order->>'fulfillmentStatus' from wc_orders where id='${order}'`), 'FULFILLED');
assert.equal(await scalar(`select fulfillment_status from wc_orders where id='${other}'`), 'NOT_FULFILLED');
assert.equal(await scalar(`select count(*)::int from wc_order_activity where message like 'WIX fulfilled%'`), 1);
assert.equal((await scalar(`select wc_claim_shipping_fulfillment('${order}','${token}')`)).status, 'synced');
assert.equal(await scalar('select count(*)::int from wc_order_activity'), 1);
await db.close();
console.log('PASS: shipping booking transaction, sync leases, uncertain recovery, atomic completion/notes, repeat safety, pickup isolation, RLS, existing data');
