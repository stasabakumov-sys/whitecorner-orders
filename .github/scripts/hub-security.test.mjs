import {pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const {PGlite}=await import(pathToFileURL(path.resolve(process.argv[2])).href);
import fs from 'node:fs';
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;
create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
create table auth.sessions(id uuid primary key,user_id uuid references auth.users,not_after timestamptz);
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb,owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(p text) returns text[] language sql immutable as $$select string_to_array(p,'/')$$;
grant usage on schema auth,storage,public to anon,authenticated,service_role;
grant all on all tables in schema storage to authenticated,service_role;
grant select on storage.objects to anon;
alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
alter default privileges in schema public grant all on sequences to anon,authenticated,service_role;
create table transactions(id uuid primary key default gen_random_uuid(),business_category text,tax_attribute text,tax_category text);
create table classification_rules(id uuid primary key default gen_random_uuid(),business_category text,tax_attribute text,tax_category text);
create table imports(id uuid primary key default gen_random_uuid());
create table personal_rules(id uuid primary key default gen_random_uuid());
create table personal_rule_transactions(id uuid primary key default gen_random_uuid());
create table business_categories(name text primary key,tax_attribute text,tax_category text,active boolean);
insert into auth.users(id,email) values('11111111-1111-1111-1111-111111111111','manager@example.test'),('22222222-2222-2222-2222-222222222222','manager2@example.test');`);
let roster;
for(const f of ['supabase/orders-schema.sql',...fs.readdirSync('supabase/migrations').sort().map(f=>'supabase/migrations/'+f)]){
 if(/20260918000300|20260923000700/.test(f)){console.log('SKIP historical data-only '+f);continue;}
 try{if(f.includes('20260929000100')){
 await db.exec(`insert into auth.users(id,email) values('33333333-3333-3333-3333-333333333333','worker@example.test'),('44444444-4444-4444-4444-444444444444','inactive@example.test');
 update wc_hub_members set active=false where user_id='44444444-4444-4444-4444-444444444444';
 create policy fixture_finance_access on transactions for all to authenticated using(true) with check(true);
 insert into transactions(business_category) values('Fixture');
 insert into storage.buckets(id,name,public) values('shipping-documents','shipping-documents',true) on conflict(id) do update set public=true;
 `);
 roster=(await db.query('select * from wc_hub_members order by user_id')).rows;
 }let sql=fs.readFileSync(f,'utf8').replace(/create extension if not exists pgcrypto;/gi,'');await db.exec(sql);}
 catch(e){throw new Error(f+': '+e.message);}
}
// No production credentials, API calls or Auth users are involved.
assert.deepEqual((await db.query('select * from wc_hub_members order by user_id')).rows,roster);
const manager='11111111-1111-1111-1111-111111111111',worker='33333333-3333-3333-3333-333333333333',inactive='44444444-4444-4444-4444-444444444444',outsider='55555555-5555-5555-5555-555555555555';
await db.query('insert into auth.users(id,email) values($1,$2)',[outsider,'outsider@example.test']);
assert.equal((await db.query('select count(*)::int n from wc_hub_members where user_id=$1',[outsider])).rows[0].n,0,'signup must not grant membership');
await db.query("update auth.users set raw_user_meta_data='{\"role\":\"manager\"}',email='changed@example.test' where id=$1",[inactive]);
assert.equal((await db.query('select active from wc_hub_members where user_id=$1',[inactive])).rows[0].active,false);
const tables=(await db.query(`select c.relname,c.relkind from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and (c.relname like 'wc_%' or c.relname in ('transactions','classification_rules','business_categories','personal_rules','personal_rule_transactions','imports')) and c.relkind in ('r','v')`)).rows;
const funcs=(await db.query(`select p.oid::regprocedure::text signature,p.proname,p.pronargs,p.prosrc,p.prosecdef,has_function_privilege('authenticated',p.oid,'execute') permitted from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'wc_%'`)).rows;
for(const t of tables){assert.equal((await db.query("select has_table_privilege('anon',$1,'SELECT,INSERT,UPDATE,DELETE') allowed",[t.relname])).rows[0].allowed,false,t.relname+' anon grant');}
for(const f of funcs){assert.equal((await db.query("select has_function_privilege('anon',$1,'execute') allowed",[f.signature])).rows[0].allowed,false,f.signature+' anon EXECUTE');}
const actor=async(id,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('test.actor',$1,false)",[id||'']);await db.exec('set role '+role);};
for(const id of ['',outsider,inactive]){
 await actor(id);
 for(const table of ['wc_orders','wc_email_messages','wc_shipments','transactions','wc_shipping_product_summary','wc_hub_product_drafts'])assert.equal((await db.query('select count(*)::int n from '+table)).rows[0].n,0,table+' leaked rows');
 await assert.rejects(db.exec("insert into wc_email_threads(mailbox_key,gmail_thread_id) values('info','fixture')"));
 for(const f of funcs.filter(f=>f.permitted&&!['wc_is_hub_manager','wc_is_active_hub_member'].includes(f.proname))){
  const call='select public.'+f.proname+'('+Array(f.pronargs).fill('null').join(',')+')';
  // Overloads are resolved with explicit argument types from the catalog signature.
  const types=f.signature.slice(f.signature.indexOf('(')+1,-1).split(',').filter(Boolean);
  await assert.rejects(db.query('select public.'+f.proname+'('+types.map(t=>'null::'+t).join(',')+')'),/Active Hub membership required/,f.signature);
 }
}
for(const id of [worker,manager]){
 await actor(id);
 assert.equal((await db.query('select wc_is_active_hub_member() allowed')).rows[0].allowed,true);
 assert.ok((await db.query('select count(*)::int n from transactions')).rows[0].n>0);
 for(const name of ['wc_costing_report','wc_catalog_cost_report','wc_catalog_cost_parts'])await db.query('select * from '+name+'()');
 await assert.rejects(db.query('select * from wc_mailboxes'),/permission denied/);
 await assert.rejects(db.exec("update wc_hub_members set role='manager'"),/permission denied/);
 await assert.rejects(db.query("select wc_claim_shipping_fulfillment(null,null)"),/permission denied/);
 await assert.rejects(db.query("select wc_shop_auto_snapshot(null)"),/permission denied/);
}
await actor(worker);await assert.rejects(db.query('select wc_packing_station_heartbeat($1)',['fixture']),/Manager access/);
await actor(manager);await db.query('select wc_packing_station_heartbeat($1)',['fixture']);
await db.exec('reset role');
assert.equal((await db.query("select count(*)::int n from storage.buckets where public and id in ('shipping-documents','box-drawings','cnc-files','box-rd-files','hub-product-drafts')")).rows[0].n,0);
await db.exec("create policy fixture_unsafe_storage on storage.objects for all to public using(true) with check(true)");
for(const bucket of ['shipping-documents','box-drawings','cnc-files','box-rd-files','hub-product-drafts'])await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',[bucket,'fixture']);
for(const id of [outsider,inactive]){await actor(id);assert.equal((await db.query('select count(*)::int n from storage.objects')).rows[0].n,0);await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('cnc-files','bad')"),/row-level security/);}
await actor('', 'anon');assert.equal((await db.query('select count(*)::int n from storage.objects')).rows[0].n,0);
// Manager callback requires the same unrevoked session and is single use.
await db.exec('reset role');
const session='66666666-6666-6666-6666-666666666666';await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,manager]);
async function handshake(id=manager){const nonce=crypto.randomUUID();await db.query("insert into wc_gmail_oauth_requests values($1,$2,$3,'info',now()+interval '5 minutes')",[nonce,id,session]);return nonce;}
const nonce=await handshake();assert.equal((await db.query('select wc_consume_gmail_oauth($1) actor',[nonce])).rows[0].actor,manager);assert.equal((await db.query('select wc_consume_gmail_oauth($1) actor',[nonce])).rows[0].actor,null);
const revoked=await handshake();await db.query('update wc_hub_members set active=false where user_id=$1',[manager]);assert.equal((await db.query('select wc_consume_gmail_oauth($1) actor',[revoked])).rows[0].actor,null);await db.query('update wc_hub_members set active=true where user_id=$1',[manager]);
const logout=await handshake();await db.query('delete from auth.sessions where id=$1',[session]);assert.equal((await db.query('select wc_consume_gmail_oauth($1) actor',[logout])).rows[0].actor,null);
// Booking preparation and claims are service-only, serialized and non-replayable.
const oid=crypto.randomUUID(),fid=crypto.randomUUID(),sid=crypto.randomUUID();
await db.query("insert into wc_orders(id,wix_order_id,currency) values($1,'security-booking','AUD')",[oid]);
await db.query("insert into wc_fulfilment(id,order_id,route,status) values($1,$2,'Shipping','Shipping Preparation')",[fid,oid]);
await db.query("insert into wc_shipments(id,fulfilment_id,order_id) values($1,$2,$3)",[sid,fid,oid]);
await db.query("insert into wc_shipment_packages(shipment_id,package_no,length_mm) values($1,1,100)",[sid]);
await db.query("update wc_shipments set status='Quote Selected',courier_order_id='security-draft',packages_approved_at=now(),updated_at=now() where id=$1",[sid]);
const version=(await db.query('select updated_at from wc_shipments where id=$1',[sid])).rows[0].updated_at;
await db.query("insert into wc_courier_quotes(courier_order_id,shipment_id,request,quotes) values('security-draft',$1,'{}','[]')",[sid]);
const prep=async(who)=> (await db.query("select wc_prepare_courier_booking('security-draft',$1,$2,5000,'{}',$3) allowed",[who,version,crypto.randomUUID()])).rows[0].allowed;
assert.equal(await prep(worker),false);assert.equal(await prep(manager),true);assert.equal(await prep(manager),false);
const claim=async(total=5000)=> (await db.query("select wc_claim_courier_booking('security-draft',$1,$2,$3) allowed",[manager,version,total])).rows[0].allowed;
assert.equal(await claim(),false,'unsaved details must not book');
await db.query("update wc_courier_booking_attempts set details_saved=true where courier_order_id='security-draft'");
assert.equal(await claim(4999),false);assert.equal(await claim(),true);assert.equal(await claim(),false);assert.equal(await prep(manager),false);
await assert.rejects(db.query('update wc_shipment_packages set length_mm=200 where shipment_id=$1',[sid]),/Booking is in progress/);
await db.query("delete from wc_courier_booking_attempts where courier_order_id='security-draft'");
await db.query('update wc_shipment_packages set length_mm=200 where shipment_id=$1',[sid]);
const invalidated=(await db.query('select status,packages_approved_at,courier_order_id from wc_shipments where id=$1',[sid])).rows[0];
assert.deepEqual(invalidated,{status:'Packaging Review',packages_approved_at:null,courier_order_id:null});
console.log(JSON.stringify({tables:tables.length,functions:funcs.length,authenticatedRPCs:funcs.filter(f=>f.permitted).length,result:'PASS: roster, RLS, Storage, RPC grants/roles, OAuth revoke/replay/logout'}));
await db.close();



