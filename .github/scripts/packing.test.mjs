// Isolated PGlite checks for Packing RLS, RD files, assignments and transfer queue.
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

const {PGlite}=await import(pathToFileURL(path.resolve(process.argv[2])).href);
const db=new PGlite();
try{
 await db.exec(`
  create role anon;create role authenticated;create role service_role;
  create schema auth;create schema storage;
  create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
  create table storage.buckets(id text primary key,name text,public boolean,file_size_limit integer,allowed_mime_types text[]);
  create table storage.objects(bucket_id text,name text,metadata jsonb);
  alter table storage.objects enable row level security;
  create function storage.foldername(p text) returns text[] language sql immutable as $$select string_to_array(p,'/')$$;
  create table wc_orders(id uuid primary key,order_number text,wix_created_at timestamptz,
   is_hidden boolean default false,archived boolean default false,fulfillment_status text,wix_status text);
  create table wc_order_items(id uuid primary key,order_id uuid references wc_orders(id),product_name text,
   wix_options jsonb,product_id uuid);
  create table wc_production_units(id uuid primary key,order_item_id uuid references wc_order_items(id),
   production_status text);
  create table wc_delivery_packaging_profiles(signature text primary key,shipping_product_id uuid,packages jsonb);
  create function wc_cost_main(p uuid) returns uuid language sql as $$select p$$;
  create function wc_shop_item_product(p uuid) returns uuid language sql as $$select product_id from wc_order_items where id=p$$;
  grant usage on schema auth,storage to authenticated,anon;
 `);
 const managerA=randomUUID(),managerB=randomUUID(),worker=randomUUID();
 const product=randomUUID(),order=randomUUID(),item=randomUUID(),unit=randomUUID(),newUnit=randomUUID(),deliveryItem=randomUUID(),deliveryUnit=randomUUID();
 await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)',[managerA,'owner@example.test',managerB,'manager@example.test']);
 await db.exec(await readFile('supabase/migrations/20260923000500_box_rd_files.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/20260923000600_packing_tasks.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/20260923000800_packing_exclude_delivery.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/20260925000100_shared_packing_work.sql','utf8'));
 await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[worker,'worker@example.test',{full_name:'Worker'}]);
 assert.equal((await db.query("select count(*)::int n from wc_hub_members where role='manager'")).rows[0].n,2);
 assert.equal((await db.query('select role from wc_hub_members where user_id=$1',[worker])).rows[0].role,'worker');
 await db.query('insert into wc_orders(id,order_number,wix_created_at) values($1,$2,now())',[order,'10001']);
 await db.query('insert into wc_order_items(id,order_id,product_name,product_id,wix_options) values($1,$2,$3,$4,$5)',[item,order,'Backdrop',product,{}]);
 await db.query('insert into wc_order_items(id,order_id,product_name,product_id,wix_options) values($1,$2,$3,$4,$5)',[deliveryItem,order,'Delivery',product,{}]);
 await db.query("insert into wc_production_units(id,order_item_id,production_status) values($1,$2,'Packing')",[unit,item]);
 await db.query("insert into wc_production_units(id,order_item_id,production_status) values($1,$2,'New')",[newUnit,item]);
 await db.query("insert into wc_production_units(id,order_item_id,production_status) values($1,$2,'New')",[deliveryUnit,deliveryItem]);
 await db.query('insert into wc_delivery_packaging_profiles(signature,shipping_product_id,packages) values($1,$2,$3)',
  ['profile',product,[{package_name:'Box 1'},{package_name:'Box 2'}]]);
 const pathA=`${managerA}/${randomUUID()}`,pathB=`${managerA}/${randomUUID()}`;
 const pathC=`${managerA}/${randomUUID()}`,pathD=`${managerA}/${randomUUID()}`;
 await db.query("insert into storage.objects(bucket_id,name,metadata) values('box-rd-files',$1,$2),('box-rd-files',$3,$4),('box-rd-files',$5,$6),('box-rd-files',$7,$8)",[pathA,{size:3},pathB,{size:4},pathC,{size:5},pathD,{size:6}]);
 await db.query("select set_config('test.actor',$1,false)",[managerA]);
 await db.exec('set role authenticated');
 assert.deepEqual((await db.query('select production_status from wc_packing_candidates()')).rows.map(row=>row.production_status),['Packing','New']);
 const saved=(await db.query('select to_jsonb(wc_save_box_rd_file(null,$1,0,$2,$3,3,2,null)) result',['profile',pathA,'cut-a.rd'])).rows[0].result;
 await db.query("select set_config('test.actor',$1,false)",[worker]);
 assert.equal((await db.query('select count(*)::int n from wc_packing_candidates()')).rows[0].n,0);
 await assert.rejects(db.query('select wc_send_packing_task($1,$2)',[newUnit,'profile']),/Manager access/);
 await assert.rejects(db.query('select wc_save_box_rd_file($1,$2,0,null,null,null,4,$3)',[saved.id,'profile',saved.revision]),/Manager access/);
 await db.query("select set_config('test.actor',$1,false)",[managerA]);
 await assert.rejects(db.query('select wc_send_packing_task($1,$2)',[unit,'profile']),/Box 2 has no RD files/);
 await db.query('select wc_save_box_rd_file(null,$1,1,$2,$3,4,3,null)',['profile',pathB,'cut-b.rd']);
 await db.query('select wc_save_box_rd_file(null,$1,0,$2,$3,5,3,null)',['profile',pathC,'cut-c.rd']);
 await db.query('select wc_save_box_rd_file(null,$1,0,$2,$3,6,1,null)',['profile',pathD,'cut-d.rd']);
 await assert.rejects(db.query('select wc_send_packing_task($1,$2)',[deliveryUnit,'profile']),/Product is unavailable/);
 const task=(await db.query('select to_jsonb(wc_send_packing_task($1,$2)) result',[unit,'profile'])).rows[0].result;
 assert.equal(task.assigned_to,null);
 assert.equal(task.files.length,4);assert.deepEqual(task.files.filter(file=>file.box_index===0).map(file=>file.copies).sort(),[1,2,3]);
 assert.equal(task.packages.length,2);
 await assert.rejects(db.query('select wc_send_packing_task($1,$2)',[unit,'profile']),/already sent/);
 await db.query("select set_config('test.actor',$1,false)",[worker]);
 assert.equal((await db.query('select count(*)::int n from wc_packing_tasks')).rows[0].n,1);
 await assert.rejects(db.query('select wc_request_packing_transfer($1)',[task.id]),/No cutting station/);
 await db.query("select set_config('test.actor',$1,false)",[managerA]);
 await db.query('select wc_packing_station_heartbeat($1)',['Test laptop']);
 await db.query("select set_config('test.actor',$1,false)",[worker]);
 const transfer=(await db.query('select to_jsonb(wc_request_packing_transfer($1)) result',[task.id])).rows[0].result;
 assert.equal(transfer.state,'queued');
 await db.query("select set_config('test.actor',$1,false)",[managerA]);
 const claim=(await db.query('select wc_claim_packing_transfer($1) result',['Test laptop'])).rows[0].result;
 assert.equal(claim.files.length,4);
 await db.query('select wc_finish_packing_transfer($1,true,null)',[transfer.id]);
 await db.query("select set_config('test.actor',$1,false)",[worker]);
 const done=(await db.query('select to_jsonb(wc_complete_packing_task($1)) result',[task.id])).rows[0].result;
 assert.equal(done.state,'completed');
 console.log('Packing migration checks passed.');
}finally{await db.close();}
