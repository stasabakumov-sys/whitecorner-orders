import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const {PGlite}=await import(pathToFileURL(path.resolve(process.argv[2])).href);const db=new PGlite();
try{
 await db.exec('create role anon;create role authenticated;create role service_role;create table wc_shipping_products(id uuid primary key);create table wc_fulfilment(order_id uuid,ready_at timestamptz);');
 await db.exec(await readFile('supabase/orders-schema.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/20260907000100_delivery_cost_review.sql','utf8'));
 await db.exec("insert into wc_delivery_packaging_profiles(signature,packages,created_by) values('existing','[]','00000000-0000-4000-8000-000000000001')");
 await db.exec(await readFile('supabase/migrations/20260907000500_packaging_variant_editor.sql','utf8'));
 const row=(await db.query('select * from wc_delivery_packaging_profiles')).rows[0];assert.equal(row.signature,'existing');assert.deepEqual(row.packages,[]);assert.equal(row.template_item,null);
 const access=(await db.query("select has_table_privilege('authenticated','wc_delivery_packaging_profiles','update') writable,relrowsecurity rls from pg_class where oid='wc_delivery_packaging_profiles'::regclass")).rows[0];assert.equal(access.writable,false);assert.equal(access.rls,true);
 console.log('PASS: variant metadata is additive; existing profiles and RLS preserved.');
}finally{await db.close();}
