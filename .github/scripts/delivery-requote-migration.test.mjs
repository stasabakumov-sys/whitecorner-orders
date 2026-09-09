// In-memory PostgreSQL. No production connections or courier requests.
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const {PGlite}=await import(pathToFileURL(path.resolve(process.argv[2])).href);
const db=new PGlite();
try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
 await db.exec(await readFile('supabase/orders-schema.sql','utf8'));
 await db.exec('create table wc_fulfilment(order_id uuid,ready_at timestamptz);');
 await db.exec(await readFile('supabase/migrations/20260907000100_delivery_cost_review.sql','utf8'));
 await db.exec('create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);');
 const sqlMigration=execFileSync(process.execPath,['.github/scripts/apply-delivery-requote.mjs','--print-sql'],{encoding:'utf8'});
 await db.exec(sqlMigration);await db.exec(sqlMigration);
 assert.equal((await db.query('select count(*)::int n from supabase_migrations.schema_migrations')).rows[0].n,1);
 const id='00000000-0000-4000-8000-000000000001',actor='00000000-0000-4000-8000-000000000002';
 await db.query("insert into wc_orders(id,wix_order_id) values($1,'requote-fixture')",[id]);
 await db.query("insert into wc_order_items(order_id,wix_line_item_id,product_name,quantity) values($1,'line','Stand',1)",[id]);
 await db.query("update wc_delivery_reviews set state='failed',quote_attempted_at=now(),response='{"+'"error":"fixture failure"'+"}',packages='[{\"height_mm\":10}]',approval='{}' where order_id=$1",[id]);
 const order=(await db.query('select updated_at::text from wc_orders where id=$1',[id])).rows[0];
 const items=(await db.query('select jsonb_agg(to_jsonb(i)) items from wc_order_items i where order_id=$1',[id])).rows[0].items;
 const version=(await db.query('select updated_at::text from wc_delivery_reviews where order_id=$1',[id])).rows[0].updated_at;
 const args=[id,JSON.stringify([{height_mm:100}]),'signature',actor,false,order.updated_at,JSON.stringify(items),version];
 const sql='select wc_requote_delivery_packages($1,$2,$3,$4,$5,$6,$7,$8)';
 await db.exec('set role authenticated');await assert.rejects(()=>db.query(sql,args),/permission denied/);await db.exec('reset role');
 await db.query(sql,args);
 let r=(await db.query('select * from wc_delivery_reviews where order_id=$1',[id])).rows[0];
 assert.equal(r.state,'pending');assert.equal(r.packages[0].height_mm,100);assert.equal(r.quote_attempted_at,null);assert.equal(r.response,null);assert.equal(r.approval,null);
 assert.equal(r.attempt_history.length,1);assert.equal(r.attempt_history[0].packages[0].height_mm,10);assert.equal(r.attempt_history[0].response.error,'fixture failure');
 await assert.rejects(()=>db.query(sql,args),/Review changed/);
 await db.query("update wc_delivery_reviews set state='failed',token=$2 where order_id=$1",[id,actor]);
 args[7]=(await db.query('select updated_at::text from wc_delivery_reviews where order_id=$1',[id])).rows[0].updated_at;
 await assert.rejects(()=>db.query(sql,args),/Review changed/);
 assert.equal((await db.query('select attempt_history from wc_delivery_reviews where order_id=$1',[id])).rows[0].attempt_history.length,1);
 console.log('Requote migration: history, invalidation, duplicate/stale requests, active worker lock and permissions passed.');
}finally{await db.close();}
