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
 await db.exec((await readFile('supabase/migrations/20260831000200_create_wc_order_activity.sql','utf8')).replace('create extension if not exists pgcrypto;',''));
 const order=(await db.query("insert into wc_orders(wix_order_id,order_number) values('fixture','100') returning id")).rows[0].id;
 const item=(await db.query("insert into wc_order_items(order_id,product_name,wix_options) values($1,'Cart','{\"Pans\":\"Yes\"}') returning to_jsonb(wc_order_items.*) item",[order])).rows[0].item;
 const before=(await db.query('select to_jsonb(o) v from wc_orders o')).rows;
 await db.exec(await readFile('supabase/migrations/20260907000400_partner_pans_report.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/20260907000600_partner_pans_activity.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/20260907000700_partner_pans_short_notes.sql','utf8'));
 await db.exec('grant select on wc_order_activity to authenticated');
 assert.deepEqual((await db.query('select to_jsonb(o) v from wc_orders o')).rows,before);
 await db.exec('set role anon');await assert.rejects(db.query('select * from wc_partner_pans'),/permission denied/);await db.exec('reset role');
 await db.exec('set role authenticated');await assert.rejects(db.query('select wc_set_partner_pans_status($1,$2,$3,$4)',[item.id,item,'key','ordered_and_sent']),/Authentication/);
 await db.exec("select set_config('test.actor','00000000-0000-4000-8000-000000000009',false)");
 const save=(source=item,status='ordered_and_sent')=>db.query('select wc_set_partner_pans_status($1,$2,$3,$4)',[item.id,source,'key',status]);
 await assert.rejects(save({...item,quantity:99}),/changed/);await assert.rejects(save(item,'unknown'),/Invalid/);
 await save();await save();
 const notes=(await db.query('select * from wc_order_activity')).rows;assert.equal(notes.length,1);assert.equal(notes[0].order_id,order);assert.equal(notes[0].order_item_id,item.id);assert.equal(notes[0].message,'Pans were sent.');

 let r=(await db.query('select * from wc_partner_pans')).rows[0];assert.equal(r.history.length,1);assert.equal(r.status,'ordered_and_sent');assert.equal(r.updated_by,'00000000-0000-4000-8000-000000000009');
 await assert.rejects(db.query("update wc_partner_pans set status='pending'"),/permission denied/);
 await save(item,'pending');r=(await db.query('select * from wc_partner_pans')).rows[0];assert.equal(r.history.length,2);
 assert.equal((await db.query('select count(*)::int n from wc_order_activity')).rows[0].n,2);
 await db.exec('reset role');
 await db.exec("create function reject_note() returns trigger language plpgsql as $$begin raise exception 'fixture note failure';end$$;create trigger reject_note before insert on wc_order_activity for each row execute function reject_note();");
 await assert.rejects(save(),/fixture note failure/);
 assert.equal((await db.query('select status from wc_partner_pans')).rows[0].status,'pending');
 assert.equal((await db.query('select count(*)::int n from wc_order_activity')).rows[0].n,2);
 assert.deepEqual((await db.query('select to_jsonb(o) v from wc_orders o')).rows,before);
 console.log('PASS: Pans migration changes no orders; anonymous denied; authenticated RPC only; actor audit, idempotency, stale-source guard, status correction.');
}finally{await db.close();}
