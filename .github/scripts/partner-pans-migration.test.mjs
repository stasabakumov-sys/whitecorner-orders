// Isolated PostgreSQL; no network, credentials or production data.
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const {PGlite}=await import(pathToFileURL(path.resolve(process.argv[2])).href);
const db=new PGlite();
try{
 await db.exec("create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.actor',true),'')::uuid$$;");
 await db.exec(await readFile('supabase/orders-schema.sql','utf8'));
 const order=(await db.query("insert into wc_orders(wix_order_id,order_number) values('fixture','100') returning id")).rows[0].id;
 const item=(await db.query("insert into wc_order_items(order_id,product_name,wix_options) values($1,'Cart','{\"Pans\":\"Yes\"}') returning to_jsonb(wc_order_items.*) item",[order])).rows[0].item;
 const before=(await db.query('select to_jsonb(o) v from wc_orders o')).rows;
 await db.exec(await readFile('supabase/migrations/20260907000400_partner_pans_report.sql','utf8'));
 assert.deepEqual((await db.query('select to_jsonb(o) v from wc_orders o')).rows,before);
 await db.exec('set role anon');await assert.rejects(db.query('select * from wc_partner_pans'),/permission denied/);await db.exec('reset role');
 await db.exec('set role authenticated');await assert.rejects(db.query('select wc_set_partner_pans_status($1,$2,$3,$4)',[item.id,item,'key','ordered_and_sent']),/Authentication/);
 await db.exec("select set_config('test.actor','00000000-0000-4000-8000-000000000009',false)");
 const save=(source=item,status='ordered_and_sent')=>db.query('select wc_set_partner_pans_status($1,$2,$3,$4)',[item.id,source,'key',status]);
 await assert.rejects(save({...item,quantity:99}),/changed/);await assert.rejects(save(item,'unknown'),/Invalid/);
 await save();await save();
 let r=(await db.query('select * from wc_partner_pans')).rows[0];assert.equal(r.history.length,1);assert.equal(r.status,'ordered_and_sent');assert.equal(r.updated_by,'00000000-0000-4000-8000-000000000009');
 await assert.rejects(db.query("update wc_partner_pans set status='pending'"),/permission denied/);
 await save(item,'pending');r=(await db.query('select * from wc_partner_pans')).rows[0];assert.equal(r.history.length,2);
 await db.exec('reset role');assert.deepEqual((await db.query('select to_jsonb(o) v from wc_orders o')).rows,before);
 console.log('PASS: Pans migration changes no orders; anonymous denied; authenticated RPC only; actor audit, idempotency, stale-source guard, status correction.');
}finally{await db.close();}
