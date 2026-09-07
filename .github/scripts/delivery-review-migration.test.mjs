// Usage: node .github/scripts/delivery-review-migration.test.mjs <path-to-pglite-dist-index.js>
// In-memory PostgreSQL only. No credentials, sockets, production or courier calls.
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const {PGlite}=await import(pathToFileURL(path.resolve(process.argv[2])).href);
const db=new PGlite();
try {
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
 await db.exec(await readFile('supabase/orders-schema.sql','utf8'));
 const old='00000000-0000-4000-8000-000000000001',id='00000000-0000-4000-8000-000000000002',actor='00000000-0000-4000-8000-000000000009',token='00000000-0000-4000-8000-000000000003';
 await db.query('insert into wc_orders(id,wix_order_id) values($1,$2)',[old,'old-fixture']);
 await db.exec("insert into wc_orders(id,wix_order_id) values('00000000-0000-4000-8000-000000000004','existing-not-ready');");
 await db.exec("create table wc_fulfilment(order_id uuid,ready_at timestamptz);insert into wc_fulfilment values('00000000-0000-4000-8000-000000000001',now());");
 const baseline=(await db.query('select to_jsonb(o) row from wc_orders o')).rows;
 await db.exec(await readFile('supabase/migrations/20260907000100_delivery_cost_review.sql','utf8'));
 assert.deepEqual((await db.query('select to_jsonb(o) row from wc_orders o')).rows,baseline);
 assert.equal((await db.query('select count(*)::int n from wc_delivery_reviews')).rows[0].n,1);
 assert.equal((await db.query('select state from wc_delivery_reviews')).rows[0].state,'legacy_packaging_required');
 assert.equal((await db.query('select count(*)::int n from wc_delivery_booking_exemptions')).rows[0].n,1);
 await db.query("insert into wc_orders(id,wix_order_id,shipping,currency) values($1,$2,300,'AUD')",[id,'new-fixture']);
 await db.query("insert into wc_order_items(order_id,wix_line_item_id,product_name,unit_price,quantity) values($1,'line','Cart',110,1)",[id]);
 assert.equal((await db.query('select state from wc_delivery_reviews where order_id=$1',[id])).rows[0].state,'importing');
 // Becoming Ready AFTER the cutover does not create an exemption.
 await db.query("insert into wc_production_units(order_item_id,unit_index,production_status) select id,1,'Ready' from wc_order_items where order_id=$1",[id]);
 assert.equal((await db.query('select count(*)::int n from wc_delivery_booking_exemptions where order_id=$1',[id])).rows[0].n,0);
 await db.query("update wc_delivery_reviews set state='packaging_required' where order_id=$1",[id]);
 const params=(await db.query('select o.updated_at,(select jsonb_agg(to_jsonb(i)) from wc_order_items i where order_id=o.id) items from wc_orders o where id=$1',[id])).rows[0];
 const packages=[{package_name:'Test',length_mm:100,width_mm:100,height_mm:100,weight_kg:1,contents:[]}];
 await db.query('select wc_save_delivery_packages($1,$2,$3,$4,true,$5,$6)',[id,JSON.stringify(packages),'signature',actor,params.updated_at,JSON.stringify(params.items)]);
 assert.equal((await db.query('select count(*)::int n from wc_delivery_packaging_profiles')).rows[0].n,1);
 assert.equal((await db.query('select wc_claim_delivery_review($1,$2) claimed',[id,token])).rows[0].claimed,true);
 assert.equal((await db.query('select wc_claim_delivery_review($1,$2) claimed',[id,actor])).rows[0].claimed,false);
 await db.query("update wc_delivery_reviews set quote_attempted_at=now(),state='uncertain',token=null where order_id=$1",[id]);
 assert.equal((await db.query('select wc_claim_delivery_review($1,$2) claimed',[id,token])).rows[0].claimed,false);
 await assert.rejects(db.query('select wc_save_delivery_packages($1,$2,$3,$4,false,$5,$6)',[id,JSON.stringify(packages),'signature',actor,params.updated_at,JSON.stringify(params.items)]),/locked/);
 await db.query("update wc_delivery_reviews set state='quoted',input_key='key' where order_id=$1",[id]);
 await db.query('select wc_approve_delivery_review($1,$2,$3,$4,$5,$6,$7)',[id,actor,'Manual exception','key',30000,params.updated_at,JSON.stringify(params.items)]);
 assert.equal((await db.query('select jsonb_array_length(approval_history) n from wc_delivery_reviews where order_id=$1',[id])).rows[0].n,1);
 await assert.rejects(db.query('select wc_approve_delivery_review($1,$2,$3,$4,$5,$6,$7)',[id,actor,'Stale exception','key',29999,params.updated_at,JSON.stringify(params.items)]),/changed/);
 await db.exec('set role authenticated');
 assert.equal((await db.query('select count(*)::int n from wc_delivery_reviews')).rows[0].n,2);
 await assert.rejects(db.query('insert into wc_delivery_booking_exemptions(order_id) values($1)',[id]),/permission denied/);
 await assert.rejects(db.query("update wc_delivery_reviews set state='pending'"),/permission denied/);
 await assert.rejects(db.query('select wc_claim_delivery_review($1,$2)',[id,token]),/permission denied/);
 await db.exec('reset role;set role anon');
 await assert.rejects(db.query('select * from wc_delivery_reviews'),/permission denied/);
 await db.exec('reset role');
 const rls=(await db.query("select relrowsecurity from pg_class where relname in ('wc_delivery_reviews','wc_delivery_packaging_profiles')")).rows;
 assert.equal(rls.length,2);assert.ok(rls.every(r=>r.relrowsecurity));
 assert.equal((await db.query('select count(*)::int n from wc_orders')).rows[0].n,3);
 console.log('PASS: existing orders unchanged, fixed Ready exemptions, existing non-Ready waits for packaging, new Ready does not bypass, seed trigger, profiles, one-shot claim, approval guards, RLS. In-memory PostgreSQL only.');
} finally {await db.close();}
