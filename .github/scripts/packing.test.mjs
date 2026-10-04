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
  create table wc_shipping_products(id uuid primary key,product_name text,product_type text);
  create table wc_shipping_packages(id uuid primary key default gen_random_uuid(),shipping_product_id uuid,source_type text,active boolean,
   size_key text,package_name text,length_mm numeric,width_mm numeric,height_mm numeric,weight_kg numeric,
   package_no integer default 1,quantity integer,notes text,updated_at timestamptz);
  create unique index wc_shipping_packages_product_size_source_no_uq on wc_shipping_packages(shipping_product_id,size_key,source_type,package_no) nulls not distinct;
  create table wc_shipping_rules(id uuid primary key default gen_random_uuid(),shipping_product_id uuid,size_key text,
   rule_type text,match_name text,match_value text,effect_type text,package_count_delta integer,package_name text,
   length_mm numeric,width_mm numeric,height_mm numeric,weight_kg numeric,active boolean,updated_at timestamptz);
  create table wc_delivery_packaging_profiles(signature text primary key,shipping_product_id uuid,template_item jsonb,packages jsonb);
  create function wc_cart_size_key(options jsonb) returns text language sql immutable as $$
   select lower(btrim(coalesce(options->>'Size','')))
  $$;
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
 await db.exec(await readFile('supabase/migrations/20260929131500_packing_reupload.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/20260930000100_packing_file_progress.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/20260930000200_replace_active_packing_rd.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/20260930000300_packing_completion_confirmation.sql','utf8'));
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
 assert.deepEqual(task.cut_file_ids,[]);
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
 const reload=(await db.query('select to_jsonb(wc_request_packing_transfer($1)) result',[task.id])).rows[0].result;
 assert.notEqual(reload.id,transfer.id);
 const duplicate=(await db.query('select to_jsonb(wc_request_packing_transfer($1)) result',[task.id])).rows[0].result;
 assert.equal(duplicate.id,reload.id);
 await assert.rejects(db.query('select wc_complete_packing_task($1)',[task.id]),/Transfer must be confirmed/);
 await db.query("select set_config('test.actor',$1,false)",[managerA]);
 await db.query('select wc_claim_packing_transfer($1)',['Test laptop']);
 await db.query('select wc_finish_packing_transfer($1,true,null)',[reload.id]);
 await db.query("select set_config('test.actor',$1,false)",[worker]);
 await assert.rejects(db.query('select wc_complete_packing_task($1)',[task.id]),/Mark every RD file done/);
 await assert.rejects(db.query('select wc_set_packing_file_done($1,$2,true)',[task.id,randomUUID()]),/not part/);
 for(const file of task.files.slice(0,3)){
  const progress=(await db.query('select to_jsonb(wc_set_packing_file_done($1,$2,true)) result',[task.id,file.file_id])).rows[0].result;
  assert.equal(progress.state,'transferred');
 }
 assert.equal((await db.query('select cardinality(cut_file_ids)::int done from wc_packing_tasks where id=$1',[task.id])).rows[0].done,3);
 await db.query('select wc_set_packing_file_done($1,$2,false)',[task.id,task.files[0].file_id]);
 assert.equal((await db.query('select cardinality(cut_file_ids)::int done from wc_packing_tasks where id=$1',[task.id])).rows[0].done,2);
 await db.query('select wc_set_packing_file_done($1,$2,true)',[task.id,task.files[0].file_id]);
 const final=(await db.query('select to_jsonb(wc_set_packing_file_done($1,$2,true)) result',[task.id,task.files[3].file_id])).rows[0].result;
 assert.equal(final.state,'transferred');assert.equal(final.cut_file_ids.length,4);assert.equal(final.completed_at,null);
 assert.equal((await db.query('select state from wc_packing_tasks where id=$1',[task.id])).rows[0].state,'transferred');
 await db.query('select wc_set_packing_file_done($1,$2,false)',[task.id,task.files[3].file_id]);
 await assert.rejects(db.query('select wc_complete_packing_task($1)',[task.id]),/Mark every RD file done/);
 await db.query('select wc_set_packing_file_done($1,$2,true)',[task.id,task.files[3].file_id]);
 const confirmed=(await db.query('select to_jsonb(wc_complete_packing_task($1)) result',[task.id])).rows[0].result;
 assert.equal(confirmed.state,'completed');assert.ok(confirmed.completed_at);
 await assert.rejects(db.query('select wc_set_packing_file_done($1,$2,false)',[task.id,task.files[3].file_id]),/Transfer must be confirmed/);
 await assert.rejects(db.query('select wc_complete_packing_task($1)',[task.id]),/Transfer must be confirmed/);
 await assert.rejects(db.query('select wc_request_packing_transfer($1)',[task.id]),/Only unfinished/);
 // Replace one file across active tasks, retaining completed snapshots and objects.
 await db.query("select set_config('test.actor',$1,false)",[managerA]);
 const active=(await db.query('select to_jsonb(wc_send_packing_task($1,$2)) result',[newUnit,'profile'])).rows[0].result;
 const replacementPath=`${managerA}/${randomUUID()}`;
 const workerPath=`${worker}/${randomUUID()}`;
 await db.exec('reset role');
 await db.query("insert into storage.objects(bucket_id,name,metadata) values('box-rd-files',$1,$2)",[replacementPath,{size:7}]);
 await db.query("insert into storage.objects(bucket_id,name,metadata) values('box-rd-files',$1,$2)",[workerPath,{size:7}]);
 await db.exec('set role authenticated');
 const replace=revision=>db.query('select to_jsonb(wc_save_box_rd_file($1,$2,0,$3,$4,7,4,$5)) result',[saved.id,'profile',replacementPath,'new-cut.rd',revision]);
 await db.query("select set_config('test.actor',$1,false)",[worker]);
 await assert.rejects(db.query('select wc_save_box_rd_file($1,$2,0,$3,$4,7,4,$5)',[saved.id,'profile',workerPath,'worker.rd',saved.revision]),/Manager access/);
 await db.query("select set_config('test.actor',$1,false)",[managerA]);
 await assert.rejects(db.query('select wc_delete_box_rd_file($1,$2)',[saved.id,saved.revision]),/active Packing task/);
 const queued=(await db.query('select to_jsonb(wc_request_packing_transfer($1)) result',[active.id])).rows[0].result;
 await assert.rejects(replace(saved.revision),/Wait for the transfer/);
 await db.query('select wc_claim_packing_transfer($1)',['Test laptop']);
 await assert.rejects(replace(saved.revision),/Wait for the transfer/);
 await db.query('select wc_finish_packing_transfer($1,true,null)',[queued.id]);
 await db.query('select wc_set_packing_file_done($1,$2,true)',[active.id,saved.id]);
 const other=active.files.find(file=>file.file_id!==saved.id);
 await db.query('select wc_set_packing_file_done($1,$2,true)',[active.id,other.file_id]);
 // A second pending task sharing the file must change in the same transaction.
 await db.exec('reset role');
 const extraUnit=randomUUID();
 await db.query("insert into wc_production_units(id,order_item_id,production_status) values($1,$2,'Packing')",[extraUnit,item]);
 await db.exec('set role authenticated');
 const pending=(await db.query('select to_jsonb(wc_send_packing_task($1,$2)) result',[extraUnit,'profile'])).rows[0].result;
 const pendingTransfer=(await db.query('select to_jsonb(wc_request_packing_transfer($1)) result',[pending.id])).rows[0].result;
 await assert.rejects(replace(saved.revision),/Wait for the transfer/);
 assert.equal((await db.query('select object_path from wc_box_rd_files where id=$1',[saved.id])).rows[0].object_path,pathA);
 assert.equal((await db.query('select state from wc_packing_tasks where id=$1',[active.id])).rows[0].state,'transferred');
 await db.query('select wc_claim_packing_transfer($1)',['Test laptop']);
 await db.query('select wc_finish_packing_transfer($1,false,$2)',[pendingTransfer.id,'Synthetic failure']);
 await assert.rejects(replace(randomUUID()),/RD file changed/);
 const updated=(await replace(saved.revision)).rows[0].result;
 assert.notEqual(updated.revision,saved.revision);
 for(const id of [active.id,pending.id]){
  const row=(await db.query('select * from wc_packing_tasks where id=$1',[id])).rows[0];
  assert.equal(row.state,'assigned');assert.equal(row.transferred_at,null);assert.equal(row.completed_at,null);
  const file=row.files.find(file=>file.file_id===saved.id);
  assert.equal(file.object_path,replacementPath);assert.equal(file.filename,'new-cut.rd');assert.equal(file.size_bytes,7);assert.equal(file.copies,4);
  assert.deepEqual(row.files.filter(file=>file.file_id!==saved.id),active.files.filter(file=>file.file_id!==saved.id));
  assert.deepEqual(row.cut_file_ids,id===active.id?[other.file_id]:[]);
 }
 assert.deepEqual((await db.query('select files from wc_packing_tasks where id=$1',[task.id])).rows[0].files,task.files);
 await assert.rejects(db.query('select wc_set_packing_file_done($1,$2,true)',[active.id,saved.id]),/Transfer must be confirmed/);
 // Completed-task storage remains protected during the client's old-object cleanup.
 await db.exec('reset role; grant delete,select on storage.objects to authenticated; set role authenticated');
 assert.equal((await db.query("delete from storage.objects where name=$1 returning name",[pathA])).rows.length,0);
 const nextTransfer=(await db.query('select to_jsonb(wc_request_packing_transfer($1)) result',[active.id])).rows[0].result;
 const newClaim=(await db.query('select wc_claim_packing_transfer($1) result',['Test laptop'])).rows[0].result;
 assert.equal(newClaim.files.find(file=>file.file_id===saved.id).object_path,replacementPath);
 await db.query('select wc_finish_packing_transfer($1,true,null)',[nextTransfer.id]);
 assert.equal((await db.query('select production_status from wc_packing_candidates() where unit_id=$1',[newUnit])).rows[0].production_status,'New');
 await db.exec('reset role');
 await db.exec(await readFile('supabase/migrations/20261001000100_custom_packing_jobs.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/20261001000200_custom_packing_rd_and_dispatch.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/20261001000300_custom_packing_cdr_drawings.sql','utf8'));
 await db.exec('set role authenticated');
 await db.query("select set_config('test.actor',$1,false)",[worker]);
 await assert.rejects(db.query('select wc_save_custom_packing_job(null,$1,$2,null)',['Worker job','Denied']),/Manager access/);
 assert.equal((await db.query('select count(*)::int n from wc_custom_packing_jobs')).rows[0].n,0);
 await db.query("select set_config('test.actor',$1,false)",[managerA]);
 const custom=(await db.query('select to_jsonb(wc_save_custom_packing_job(null,$1,$2,null)) result',['Special arch','Cut two panels'])).rows[0].result;
 const customPath=`${managerA}/${randomUUID()}`,drawingPath=`${managerA}/${randomUUID()}`;
 await db.exec('reset role');
 await db.query("insert into storage.objects(bucket_id,name,metadata) values('box-rd-files',$1,$2),('custom-packing-drawings',$3,$4)",[customPath,{size:8},drawingPath,{size:12}]);
 await db.exec('set role authenticated');
 const drawing=(await db.query('select to_jsonb(wc_save_custom_packing_drawing($1,$2,$3,12)) result',[custom.id,drawingPath,'Source.cdr'])).rows[0].result;
 assert.equal((await db.query('select count(*)::int n from wc_custom_packing_drawings')).rows[0].n,1);
 await db.exec('reset role; grant insert on storage.objects to authenticated; set role authenticated');
 await db.query("select set_config('test.actor',$1,false)",[worker]);
 assert.equal((await db.query('select count(*)::int n from wc_custom_packing_drawings')).rows[0].n,0);
 assert.equal((await db.query("select count(*)::int n from storage.objects where bucket_id='custom-packing-drawings'")).rows[0].n,0);
 await assert.rejects(db.query("insert into storage.objects(bucket_id,name,metadata) values('custom-packing-drawings',$1,$2)",[
  `${worker}/${randomUUID()}`,{size:12}]),/row-level security/);
 await assert.rejects(db.query('select wc_save_custom_packing_drawing($1,$2,$3,12)',[custom.id,drawingPath,'Source.cdr']),/Manager access/);
 await db.query("select set_config('test.actor',$1,false)",[managerA]);
 await assert.rejects(db.query('select wc_send_custom_packing_job($1)',[custom.id]),/Add at least one RD file/);
 const customFile=(await db.query('select to_jsonb(wc_save_custom_packing_rd_file(null,$1,$2,$3,8,2,null)) result',[custom.id,customPath,'custom.rd'])).rows[0].result;
 const customTask=(await db.query('select to_jsonb(wc_send_custom_packing_job($1)) result',[custom.id])).rows[0].result;
 assert.equal(customTask.unit_id,null);assert.equal(customTask.profile_signature,null);
 assert.equal(customTask.custom_instructions,'Cut two panels');assert.equal(customTask.files[0].file_id,customFile.id);
 assert.equal(customTask.files.length,1);assert.equal(JSON.stringify(customTask).includes(drawingPath),false);
 assert.equal((await db.query('select wc_delete_custom_packing_drawing($1,$2) result',[drawing.id,drawing.revision])).rows[0].result,drawingPath);
 await assert.rejects(db.query('select wc_send_custom_packing_job($1)',[custom.id]),/already in Packing work/);
 await assert.rejects(db.query('select wc_save_custom_packing_rd_file($1,$2,null,null,null,3,$3)',[customFile.id,custom.id,customFile.revision]),/already sent/);
 await db.query("select set_config('test.actor',$1,false)",[worker]);
 assert.equal((await db.query('select count(*)::int n from wc_packing_tasks where id=$1',[customTask.id])).rows[0].n,1);
 await assert.rejects(db.query('select wc_cancel_packing_task($1)',[customTask.id]),/Manager access/);
 await db.query("select set_config('test.actor',$1,false)",[managerA]);
 await db.query('select wc_cancel_packing_task($1)',[customTask.id]);
 const revised=(await db.query('select to_jsonb(wc_save_custom_packing_rd_file($1,$2,null,null,null,3,$3)) result',[customFile.id,custom.id,customFile.revision])).rows[0].result;
 assert.equal(revised.copies,3);
 assert.equal((await db.query('select to_jsonb(wc_send_custom_packing_job($1)) result',[custom.id])).rows[0].result.files[0].copies,3);
 // A Backdrop RD set follows size + folding, even when the other arch has a different profile.
 const firstArch=randomUUID(),secondArch=randomUUID(),secondItem=randomUUID(),secondUnit=randomUUID();
 const thirdArch=randomUUID(),fourthArch=randomUUID(),ambiguousKey='1800x900:nonfoldable';
 const archKey='1200x1000:foldable',archPath=`${managerA}/${randomUUID()}`,replacementArchPath=`${managerA}/${randomUUID()}`;
 const thirdPath=`${managerA}/${randomUUID()}`,fourthPath=`${managerA}/${randomUUID()}`;
 await db.exec('reset role');
 await db.query('insert into wc_shipping_products(id,product_name,product_type) values($1,$2,$3),($4,$5,$6)',
  [firstArch,'First Arch Backdrop','Backdrop',secondArch,'Second Arch Backdrop','Backdrop']);
 await db.query('insert into wc_delivery_packaging_profiles(signature,shipping_product_id,template_item,packages) values($1,$2,$3,$4),($5,$6,$7,$8)',
  ['first-arch',firstArch,{product_name:'First Arch Backdrop'},[{package_name:'Arch box',backdrop_size_key:archKey}],
   'second-arch',secondArch,{product_name:'Second Arch Backdrop',wix_options:{Size:'120cm x 100cm',Foldable:'YES'}},[{package_name:'Arch box'}]]);
 await db.query('insert into wc_shipping_products(id,product_name,product_type) values($1,$2,$3),($4,$5,$6)',
  [thirdArch,'Third Arch Backdrop','Backdrop',fourthArch,'Fourth Arch Backdrop','Backdrop']);
 await db.query('insert into wc_delivery_packaging_profiles(signature,shipping_product_id,template_item,packages) values($1,$2,$3,$4),($5,$6,$7,$8)',
  ['third-arch',thirdArch,{product_name:'Third Arch Backdrop'},[{package_name:'Arch box',backdrop_size_key:ambiguousKey}],
   'fourth-arch',fourthArch,{product_name:'Fourth Arch Backdrop'},[{package_name:'Arch box',backdrop_size_key:ambiguousKey}]]);
 await db.query('insert into wc_order_items(id,order_id,product_name,product_id,wix_options) values($1,$2,$3,$4,$5)',
  [secondItem,order,'Second Arch Backdrop',secondArch,{Size:'120cm x 100cm',Foldable:'YES'}]);
 await db.query("insert into wc_production_units(id,order_item_id,production_status) values($1,$2,'New')",[secondUnit,secondItem]);
 await db.query("insert into storage.objects(bucket_id,name,metadata) values('box-rd-files',$1,$2),('box-rd-files',$3,$4),('box-rd-files',$5,$6),('box-rd-files',$7,$8)",
  [archPath,{size:4},replacementArchPath,{size:5},thirdPath,{size:4},fourthPath,{size:4}]);
 await db.exec('set role authenticated');
 const legacyArch=(await db.query('select to_jsonb(wc_save_box_rd_file(null,$1,0,$2,$3,4,2,null)) result',
  ['first-arch',archPath,'D1.rd'])).rows[0].result;
 const ambiguousSource=(await db.query('select to_jsonb(wc_save_box_rd_file(null,$1,0,$2,$3,4,2,null)) result',
  ['third-arch',thirdPath,'Choice A.rd'])).rows[0].result;
 await db.query('select wc_save_box_rd_file(null,$1,0,$2,$3,4,2,null)',
  ['fourth-arch',fourthPath,'Choice B.rd']);
 await db.exec('reset role');
 await db.exec(await readFile('supabase/migrations/20261002000100_shared_backdrop_rd.sql','utf8'));
 assert.equal((await db.query('select wc_backdrop_rd_key($1) size_key',['second-arch'])).rows[0].size_key,archKey);
 const promoted=(await db.query('select backdrop_size_key,profile_signature,box_index from wc_box_rd_files where id=$1',[legacyArch.id])).rows[0];
 assert.deepEqual(promoted,{backdrop_size_key:archKey,profile_signature:null,box_index:null});
 assert.equal((await db.query('select profile_signature from wc_box_rd_files where id=$1',[ambiguousSource.id])).rows[0].profile_signature,'third-arch');
 await db.exec('set role authenticated');
 assert.equal((await db.query('select wc_promote_backdrop_rd($1) result',['third-arch'])).rows[0].result,ambiguousKey);
 assert.equal((await db.query('select backdrop_size_key from wc_box_rd_files where id=$1',[ambiguousSource.id])).rows[0].backdrop_size_key,ambiguousKey);
 await assert.rejects(db.query('select wc_promote_backdrop_rd($1)',['fourth-arch']),/Shared RD files already exist/);
 const sharedTask=(await db.query('select to_jsonb(wc_send_packing_task($1,$2)) result',[secondUnit,'second-arch'])).rows[0].result;
 assert.equal(sharedTask.files[0].file_id,legacyArch.id);
 assert.equal(sharedTask.files[0].box_index,0);
 await db.query("select set_config('test.actor',$1,false)",[worker]);
 await assert.rejects(db.query('select wc_save_backdrop_rd_file($1,$2,null,null,null,3,$3)',
  [legacyArch.id,archKey,legacyArch.revision]),/Manager access/);
 await db.query("select set_config('test.actor',$1,false)",[managerA]);
 const replacedArch=(await db.query('select to_jsonb(wc_save_backdrop_rd_file($1,$2,$3,$4,5,3,$5)) result',
  [legacyArch.id,archKey,replacementArchPath,'D1-new.rd',legacyArch.revision])).rows[0].result;
 assert.equal(replacedArch.copies,3);
 const revisedTask=(await db.query('select files,state from wc_packing_tasks where id=$1',[sharedTask.id])).rows[0];
 assert.equal(revisedTask.files[0].filename,'D1-new.rd');assert.equal(revisedTask.files[0].copies,3);
 assert.equal(revisedTask.state,'assigned');
 // Cart Base files follow one product, size and reusable box across option profiles.
 const cart=randomUUID(),basePackage=randomUUID(),otherSizePackage=randomUUID(),cartItem=randomUUID(),cartUnit=randomUUID();
 const cartPath=`${managerA}/${randomUUID()}`,addonPath=`${managerA}/${randomUUID()}`,cartNewPath=`${managerA}/${randomUUID()}`;
 const cartBox={package_name:'Front/Sides/MDF wheels',length_mm:1180,width_mm:670,height_mm:60,contents:[{component_key:'main'}]};
 const addonBox={package_name:'Shelf',length_mm:300,width_mm:200,height_mm:40,contents:[{component_key:'option:internal shelf'}]};
 await db.exec('reset role');
 await db.query('insert into wc_shipping_products(id,product_name,product_type) values($1,$2,$3)',[cart,'MDF Mobile Bar Cart','Cart']);
 await db.query('insert into wc_shipping_packages(id,shipping_product_id,source_type,active,size_key,package_name,length_mm,width_mm,height_mm) values($1,$2,$3,true,$4,$5,$6,$7,$8),($9,$2,$3,true,$10,$5,$6,$7,$8)',
  [basePackage,cart,'Base','regular',cartBox.package_name,1180,670,60,otherSizePackage,'large']);
 await db.query('insert into wc_delivery_packaging_profiles(signature,shipping_product_id,template_item,packages) values($1,$2,$3,$4),($5,$2,$6,$7),($8,$2,$9,$10),($11,$2,$12,$13)',
  ['cart-plain',cart,{wix_options:{Size:'Regular'}},[cartBox],
   'cart-shelf',{wix_options:{Size:'Regular','Internal Shelf':'Yes'}},[cartBox,addonBox],
   'cart-large',{wix_options:{Size:'Large'}},[cartBox],
   'cart-custom',{profile_scope:'cart-main',wix_options:{Size:'Regular'}},[cartBox]]);
 await db.query('insert into wc_order_items(id,order_id,product_name,product_id,wix_options) values($1,$2,$3,$4,$5)',
  [cartItem,order,'MDF Mobile Bar Cart',cart,{Size:'Regular','Internal Shelf':'Yes'}]);
 await db.query("insert into wc_production_units(id,order_item_id,production_status) values($1,$2,'New')",[cartUnit,cartItem]);
 await db.query("insert into storage.objects(bucket_id,name,metadata) values('box-rd-files',$1,$2),('box-rd-files',$3,$4),('box-rd-files',$5,$6)",
  [cartPath,{size:4},addonPath,{size:4},cartNewPath,{size:5}]);
 await db.exec('set role authenticated');
 const legacyCart=(await db.query('select to_jsonb(wc_save_box_rd_file(null,$1,0,$2,$3,4,2,null)) result',
  ['cart-plain',cartPath,'base.rd'])).rows[0].result;
 await db.query('select wc_save_box_rd_file(null,$1,1,$2,$3,4,1,null)',
  ['cart-shelf',addonPath,'shelf.rd']);
 await db.exec('reset role');
 await db.exec(await readFile('supabase/migrations/20261003000100_shared_cart_base_rd.sql','utf8'));
 for(const file of ['20260909000100_box_drawings.sql','20260909000200_backdrop_drawing_library.sql','20260909000300_product_drawings.sql','20260909000500_drawing_upload_limit.sql'])await db.exec(await readFile(`supabase/migrations/${file}`,'utf8'));
 await db.exec(`create function public.wc_is_active_hub_member() returns boolean language sql stable security definer as $$select exists(select 1 from wc_hub_members where user_id=auth.uid() and active)$$;`);
 const cartDrawingPath=`${managerA}/cart-source`,drawingReplacement=`${managerA}/cart-source-new`;
 await db.query("insert into storage.objects(bucket_id,name,metadata) values('box-drawings',$1,$2),('box-drawings',$3,$4)",[cartDrawingPath,{size:4},drawingReplacement,{size:5}]);
 await db.query('insert into wc_box_drawings(profile_signature,box_index,box_snapshot,object_path,filename,size_bytes) values($1,0,$2,$3,$4,4)',['cart-plain',cartBox,cartDrawingPath,'base.cdr']);
 await db.exec(await readFile('supabase/migrations/20261003000200_cart_base_rd_from_product.sql','utf8'));
 const sharedDrawing=(await db.query('select * from wc_cart_base_box_drawings where cart_base_package_id=$1',[basePackage])).rows[0];
 assert.equal(sharedDrawing.filename,'base.cdr');
 assert.equal((await db.query('select count(*)::int n from wc_box_drawings where profile_signature=$1',['cart-plain'])).rows[0].n,1);
 assert.equal((await db.query('select wc_cart_base_package($1,0) id',['cart-shelf'])).rows[0].id,basePackage);
 assert.equal((await db.query('select wc_cart_base_package($1,1) id',['cart-shelf'])).rows[0].id,null);
 assert.equal((await db.query('select wc_cart_base_package($1,0) id',['cart-large'])).rows[0].id,otherSizePackage);
 assert.equal((await db.query('select wc_cart_base_package($1,0) id',['cart-custom'])).rows[0].id,null);
 assert.deepEqual((await db.query('select cart_base_package_id,profile_signature,box_index from wc_box_rd_files where id=$1',[legacyCart.id])).rows[0],
  {cart_base_package_id:basePackage,profile_signature:null,box_index:null});
 await assert.rejects(db.query('update wc_shipping_packages set length_mm=1190 where id=$1',[basePackage]),/shared RD files/);
 await db.exec('set role authenticated');
 const updatedDrawing=(await db.query('select wc_save_cart_base_box_drawing($1,$2,$3,$4,5,$5) result',[basePackage,sharedDrawing.box_snapshot,drawingReplacement,'updated.cdr',sharedDrawing.revision])).rows[0].result;
 assert.equal(updatedDrawing.filename,'updated.cdr');
 await assert.rejects(db.query('select wc_save_cart_base_box_drawing($1,$2,$3,$4,5,$5)',[basePackage,{...sharedDrawing.box_snapshot,length_mm:1},drawingReplacement,'updated.cdr',updatedDrawing.revision]),/Base box changed/);
 const cartTask=(await db.query('select to_jsonb(wc_send_packing_task($1,$2)) result',[cartUnit,'cart-shelf'])).rows[0].result;
 assert.deepEqual(cartTask.files.map(file=>file.filename),['base.rd','shelf.rd']);
 assert.equal(cartTask.files[0].file_id,legacyCart.id);
 const replacedCart=(await db.query('select to_jsonb(wc_save_cart_base_rd_file($1,$2,0,$3,$4,5,3,$5)) result',
  [legacyCart.id,'cart-shelf',cartNewPath,'base-new.rd',legacyCart.revision])).rows[0].result;
 assert.equal(replacedCart.cart_base_package_id,basePackage);
 assert.equal((await db.query('select files from wc_packing_tasks where id=$1',[cartTask.id])).rows[0].files[0].filename,'base-new.rd');
 const fromProduct=(await db.query('select to_jsonb(wc_save_cart_base_rd_file_for_package($1,$2,$3,$4,4,4,$5)) result',
  [legacyCart.id,basePackage,cartPath,'base-final.rd',replacedCart.revision])).rows[0].result;
 assert.equal(fromProduct.copies,4);
 assert.equal((await db.query('select files from wc_packing_tasks where id=$1',[cartTask.id])).rows[0].files[0].filename,'base-final.rd');
 await assert.rejects(db.query('select wc_save_cart_base_rd_file_for_package($1,$2,null,null,null,4,$3)',
  [legacyCart.id,otherSizePackage,fromProduct.revision]),/RD file changed/);
 await assert.rejects(db.query('select wc_promote_cart_base_rd($1,0)',['cart-large']),/no RD files/);
 await db.exec('reset role');
 const shelfRule=randomUUID();
 await db.query(`insert into wc_shipping_rules(id,shipping_product_id,size_key,rule_type,match_name,match_value,effect_type,package_count_delta,package_name,length_mm,width_mm,height_mm,weight_kg,active)
  values($1,$2,'regular','Option','Internal Shelf','Yes','Add package',1,'Shelf',300,200,40,5,true)`,[shelfRule,cart]);
 const addonDrawingPath=`${managerA}/addon-source`,addonDrawingNewPath=`${managerA}/addon-new`;
 await db.query("insert into storage.objects(bucket_id,name,metadata) values('box-drawings',$1,'{\"size\":4}')",[addonDrawingPath]);
 await db.query("insert into storage.objects(bucket_id,name,metadata) values('box-drawings',$1,'{\"size\":5}')",[addonDrawingNewPath]);
 await db.query('insert into wc_box_drawings(profile_signature,box_index,box_snapshot,object_path,filename,size_bytes) values($1,1,$2,$3,$4,4)',['cart-shelf',addonBox,addonDrawingPath,'shelf.cdr']);
 await db.exec(await readFile('supabase/migrations/20261003000300_cart_addon_files.sql','utf8'));
 const addonPackage=(await db.query('select * from wc_shipping_packages where shipping_rule_id=$1',[shelfRule])).rows[0];
 assert.equal(addonPackage.package_no,1);
 assert.equal((await db.query('select wc_cart_base_package($1,1) id',['cart-shelf'])).rows[0].id,addonPackage.id);
 assert.equal((await db.query('select * from wc_cart_base_box_drawings where cart_base_package_id=$1',[addonPackage.id])).rows[0].filename,'shelf.cdr');
 const addonFile=(await db.query('select * from wc_box_rd_files where cart_base_package_id=$1',[addonPackage.id])).rows[0];
 assert.equal(addonFile.filename,'shelf.rd');
 assert.equal((await db.query('select files from wc_packing_tasks where id=$1',[cartTask.id])).rows[0].files[1].file_id,addonFile.id);
 await db.query(`insert into wc_delivery_packaging_profiles values('cart-shelf-new',$1,$2,$3),('cart-shelf-no',$1,$4,$3),('cart-shelf-custom',$1,$5,$3)`,
  [cart,{wix_options:{Size:'Regular','Internal Shelf':'Yes',Colour:'Raw'}},[cartBox,addonBox],{wix_options:{Size:'Regular','Internal Shelf':'No'}},{profile_scope:'cart-main',wix_options:{Size:'Regular','Internal Shelf':'Yes'}}]);
 assert.equal((await db.query("select wc_cart_base_package('cart-shelf-new',1) id")).rows[0].id,addonPackage.id);
 for(const signature of ['cart-shelf-no','cart-shelf-custom'])assert.equal((await db.query('select wc_cart_base_package($1,1) id',[signature])).rows[0].id,null);
 await assert.rejects(db.query('update wc_shipping_rules set length_mm=301 where id=$1',[shelfRule]),/shared RD files/);
 await db.exec('set role authenticated');
 const addonDrawing=(await db.query('select wc_save_cart_base_box_drawing($1,$2,$3,$4,5,$5) result',[addonPackage.id,{package_name:'Shelf',length_mm:300,width_mm:200,height_mm:40},addonDrawingNewPath,'shelf-new.cdr',(await db.query('select revision from wc_cart_base_box_drawings where cart_base_package_id=$1',[addonPackage.id])).rows[0].revision])).rows[0].result;
 assert.equal(addonDrawing.filename,'shelf-new.cdr');
 const addonReplace=(await db.query('select to_jsonb(wc_save_cart_base_rd_file_for_package($1,$2,$3,$4,5,2,$5)) result',[addonFile.id,addonPackage.id,cartNewPath,'shelf-new.rd',addonFile.revision])).rows[0].result;
 assert.equal((await db.query('select files from wc_packing_tasks where id=$1',[cartTask.id])).rows[0].files[1].filename,'shelf-new.rd');
 assert.equal((await db.query('select * from wc_cart_packing_file_boxes() where signature=$1 and box_index=1',['cart-shelf-new'])).rows[0].package_id,addonPackage.id);
 await db.exec('reset role');
 const addonUnit=randomUUID(),sideRule=randomUUID(),doorsRule=randomUUID();
 await db.query("insert into wc_production_units values($1,$2,'New')",[addonUnit,cartItem]);
 await db.query(`insert into wc_shipping_rules(id,shipping_product_id,size_key,rule_type,match_name,match_value,effect_type,package_count_delta,package_name,length_mm,width_mm,height_mm,weight_kg,active)
  values($1,$2,'regular','Option','Side shelves','Yes','Add package',2,'Side',600,250,50,2,true),
        ($3,$2,'regular','Add-on','Back panel doors',null,'Add package',1,'Doors',1180,670,49,13,true)`,[sideRule,cart,doorsRule]);
 const sideBox={package_name:'Side',length_mm:600,width_mm:250,height_mm:50,contents:[{component_key:'option:side shelves'}]},doorsBox={package_name:'Doors',length_mm:1180,width_mm:670,height_mm:49,contents:[{component_key:'main',product_name:'Back panel doors'}]};
 await db.query('insert into wc_delivery_packaging_profiles values($1,$2,$3,$4),($5,$2,$3,$6)',
  ['cart-side',cart,{wix_options:{Size:'Regular','Side shelves':'Yes'}},[cartBox,sideBox,sideBox,doorsBox],'cart-side-incomplete',[cartBox,sideBox]]);
 const sidePackages=(await db.query('select * from wc_shipping_packages where shipping_rule_id=$1 order by package_no',[sideRule])).rows;
 assert.equal(sidePackages.length,2);
 assert.equal((await db.query("select wc_cart_base_package('cart-side',1) id")).rows[0].id,sidePackages[0].id);
 assert.equal((await db.query("select wc_cart_base_package('cart-side',2) id")).rows[0].id,sidePackages[1].id);
 assert.equal((await db.query("select wc_cart_base_package('cart-side-incomplete',1) id")).rows[0].id,null);
 assert.notEqual((await db.query("select wc_cart_base_package('cart-side',3) id")).rows[0].id,null);
 await assert.rejects(db.query('update wc_shipping_rules set match_value=$1 where id=$2',['No',shelfRule]),/saved files/);
 await db.exec('set role authenticated');
 const freshAddonTask=(await db.query('select to_jsonb(wc_send_packing_task($1,$2)) result',[addonUnit,'cart-shelf-new'])).rows[0].result;
 assert.deepEqual(freshAddonTask.files.map(file=>file.filename),['base-final.rd','shelf-new.rd']);
 assert.equal(freshAddonTask.files[1].file_id,addonFile.id);
 await db.query("select set_config('test.actor',$1,false)",[worker]);
 assert.equal((await db.query('select * from wc_cart_packing_file_boxes()')).rows.length,0);
 await assert.rejects(db.query('select wc_save_cart_base_rd_file_for_package($1,$2,null,null,null,2,$3)',[addonFile.id,addonPackage.id,addonReplace.revision]),/Manager access/);
 await assert.rejects(db.query('select wc_save_cart_base_box_drawing($1,$2,$3,$4,5,$5)',[basePackage,sharedDrawing.box_snapshot,drawingReplacement,'updated.cdr',updatedDrawing.revision]),/Manager access/);
 await assert.rejects(db.query('select wc_save_cart_base_rd_file_for_package($1,$2,null,null,null,4,$3)',[legacyCart.id,basePackage,fromProduct.revision]),/Manager access/);
 // Cart Constructor: three private references committed together, with retry receipts.
 await db.exec('reset role');
 await db.exec(await readFile('supabase/migrations/20261003000400_cart_constructor_files.sql','utf8'));
 const constructorPackage=randomUUID();
 await db.query("insert into wc_shipping_packages(id,shipping_product_id,source_type,active,size_key,package_name,length_mm,width_mm,height_mm,package_no) values($1,$2,'Base',true,'constructor','Top/Bottom',1230,630,80,1)",[constructorPackage,cart]);
 const constructorBox={package_name:'Top/Bottom',length_mm:1230,width_mm:630,height_mm:80};
 const constructorDimensions={bottom:{length:1215,width:615,depth:80},lid:{length:1225,width:625,depth:80}};
 const constructorPaths=[0,1,2].map(()=>`${managerA}/${randomUUID()}`);
 for(let i=0;i<3;i++)await db.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',[i?'box-rd-files':'box-drawings',constructorPaths[i],{size:100+i}]);
 const constructorArgs=[randomUUID(),constructorPackage,constructorBox,constructorDimensions,{path:constructorPaths[0],filename:'drawing.svg',bytes:100,expected:null},[0,1].map(i=>({id:null,expected:null,path:constructorPaths[i+1],filename:i?'lid.rd':'bottom.rd',bytes:101+i}))];
 const constructorSql='select wc_save_cart_constructor_files($1,$2,$3,$4,$5,$6) result';
 await db.exec('set role authenticated');
 await assert.rejects(db.query(constructorSql,constructorArgs),/Manager access/);
 await db.query("select set_config('test.actor',$1,false)",[managerA]);
 await assert.rejects(db.query(constructorSql,[...constructorArgs.slice(0,3),{...constructorDimensions,lid:{length:1250,width:625,depth:80}},...constructorArgs.slice(4)]),/Use Cart dimensions/);
 const badRd=structuredClone(constructorArgs[5]);badRd[1].bytes=999;
 await assert.rejects(db.query(constructorSql,[...constructorArgs.slice(0,5),badRd]),/upload|Upload|bytes|size/);
 assert.equal((await db.query('select * from wc_box_rd_files where cart_base_package_id=$1',[constructorPackage])).rows.length,0);
 assert.equal((await db.query('select * from wc_cart_box_svg_drawings where cart_base_package_id=$1',[constructorPackage])).rows.length,0);
 const constructorSaved=(await db.query(constructorSql,constructorArgs)).rows[0].result;
 assert.deepEqual(constructorSaved.rd_files.map(f=>f.copies),[2,2]);
 assert.equal(constructorSaved.drawing.constructor_data.lid.length,1225);
 assert.deepEqual((await db.query(constructorSql,constructorArgs)).rows[0].result,constructorSaved);
 // A stale second RD must roll back the first replacement and the SVG together.
 await db.exec('reset role');
 const replacementPaths=[0,1,2].map(()=>`${managerA}/${randomUUID()}`);
 for(let i=0;i<3;i++)await db.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',[i?'box-rd-files':'box-drawings',replacementPaths[i],{size:100+i}]);
 await db.exec('set role authenticated');
 const replacementRd=constructorSaved.rd_files.map((file,i)=>({id:file.id,expected:i?randomUUID():file.revision,path:replacementPaths[i+1],filename:file.filename,bytes:101+i}));
 const replacementArgs=[randomUUID(),constructorPackage,constructorBox,constructorDimensions,{path:replacementPaths[0],filename:'updated.svg',bytes:100,expected:constructorSaved.drawing.revision},replacementRd];
 await assert.rejects(db.query(constructorSql,replacementArgs),/RD file changed/);
 assert.equal((await db.query('select object_path from wc_box_rd_files where id=$1',[constructorSaved.rd_files[0].id])).rows[0].object_path,constructorPaths[1]);
 assert.equal((await db.query('select object_path from wc_cart_box_svg_drawings where cart_base_package_id=$1',[constructorPackage])).rows[0].object_path,constructorPaths[0]);
 replacementRd[1].expected=constructorSaved.rd_files[1].revision;
 const replacementSaved=(await db.query(constructorSql,replacementArgs)).rows[0].result;
 assert.deepEqual(replacementSaved.rd_files.map(file=>file.id),constructorSaved.rd_files.map(file=>file.id));
 await assert.rejects(db.query(constructorSql,[constructorArgs[0],constructorPackage,{...constructorBox,height_mm:81},...constructorArgs.slice(3)]),/Save request changed/);
 await assert.rejects(db.query(constructorSql,[randomUUID(),...constructorArgs.slice(1)]),/SVG drawing changed/);
 await db.query("select set_config('test.actor',$1,false)",[worker]);
 assert.equal((await db.query('select * from wc_cart_box_svg_drawings where cart_base_package_id=$1',[constructorPackage])).rows.length,1);
 await assert.rejects(db.query('delete from wc_cart_box_svg_drawings where cart_base_package_id=$1',[constructorPackage]),/permission denied/);
 await db.exec('reset role');
 await db.exec(await readFile('supabase/migrations/20261003000500_cart_file_mapping_access.sql','utf8'));
 await db.exec('set role authenticated');
 assert.equal((await db.query("select wc_cart_base_package('cart-shelf-new',1) id")).rows[0].id,addonPackage.id);
 for(const actor of ['',randomUUID()]){
  await db.query("select set_config('test.actor',$1,false)",[actor]);
  for(const rpc of ['wc_cart_standard_base_package','wc_cart_addon_rule','wc_cart_base_package'])await assert.rejects(db.query(`select ${rpc}(null,null)`),/Active Hub membership required/);
  await assert.rejects(db.query('select * from wc_cart_packing_file_boxes()'),/Active Hub membership required/);
 }
 await db.exec('reset role');
 await db.exec(await readFile('supabase/migrations/20261003000600_packaging_svg_sources.sql','utf8'));
 await db.query("select set_config('test.actor',$1,false)",[managerA]);
 await db.exec('set role authenticated');
 const sourceSql='select wc_save_cart_base_box_drawing($1,$2,$3,$4,100,$5) result';
 const manualSvg=(await db.query(sourceSql,[constructorPackage,constructorBox,replacementPaths[0],'manual.SVG',null])).rows[0].result;
 assert.equal(manualSvg.filename,'manual.SVG');
 await assert.rejects(db.query(sourceSql,[constructorPackage,constructorBox,replacementPaths[0],'manual.pdf',manualSvg.revision]),/SVG or CDR/);
 await assert.rejects(db.query(sourceSql,[constructorPackage,constructorBox,replacementPaths[0],'manual.svg',randomUUID()]),/Drawing changed/);
 assert.equal((await db.query('select filename from wc_cart_base_box_drawings where cart_base_package_id=$1',[constructorPackage])).rows[0].filename,'manual.SVG');
 const manualCdr=(await db.query(sourceSql,[constructorPackage,constructorBox,replacementPaths[0],'manual.cdr',manualSvg.revision])).rows[0].result;
 assert.equal(manualCdr.filename,'manual.cdr');
 assert.equal((await db.query('select object_path from wc_cart_box_svg_drawings where cart_base_package_id=$1',[constructorPackage])).rows[0].object_path,replacementPaths[0]);
 await db.query("select set_config('test.actor',$1,false)",[worker]);
 await assert.rejects(db.query(sourceSql,[constructorPackage,constructorBox,replacementPaths[0],'manual.svg',manualCdr.revision]),/Manager access/);
 await db.exec('reset role');
 await db.exec(await readFile('supabase/migrations/20261004000100_constructor_custom_jobs.sql','utf8'));
 const customPaths=[0,1,2].map(()=>`${managerA}/${randomUUID()}`);
 for(let i=0;i<3;i++)await db.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',[i?'box-rd-files':'custom-packing-drawings',customPaths[i],{size:200+i}]);
 await db.exec('set role authenticated');
 const customSql='select wc_create_constructor_custom_job($1,$2,$3,$4,$5) result';
 const customArgs=[randomUUID(),'Card box 1215 × 615 × 80',constructorDimensions,{path:customPaths[0],filename:'card.svg',bytes:200},[0,1].map(i=>({path:customPaths[i+1],filename:i?'lid.rd':'bottom.rd',bytes:201+i}))];
 await assert.rejects(db.query(customSql,customArgs),/Manager access/);
 await db.query("select set_config('test.actor',$1,false)",[managerA]);
 const jobsBefore=(await db.query('select count(*)::int n from wc_custom_packing_jobs')).rows[0].n;
 const tasksBefore=(await db.query('select count(*)::int n from wc_packing_tasks')).rows[0].n;
 const invalidCustom=structuredClone(customArgs);invalidCustom[4][1].bytes=999;
 await assert.rejects(db.query(customSql,invalidCustom),/RD upload/);
 assert.equal((await db.query('select count(*)::int n from wc_custom_packing_jobs')).rows[0].n,jobsBefore);
 const customSaved=(await db.query(customSql,customArgs)).rows[0].result;
 assert.deepEqual(customSaved.rd_files.map(file=>file.copies),[2,2]);
 assert.equal(customSaved.drawing.filename,'card.svg');
 assert.deepEqual((await db.query(customSql,customArgs)).rows[0].result,customSaved);
 assert.equal((await db.query('select count(*)::int n from wc_custom_packing_jobs')).rows[0].n,jobsBefore+1);
 assert.equal((await db.query('select count(*)::int n from wc_packing_tasks')).rows[0].n,tasksBefore);
 await assert.rejects(db.query(customSql,[customArgs[0],'Changed',...customArgs.slice(2)]),/Save request changed/);
 await assert.rejects(db.query('select * from wc_constructor_custom_saves'),/permission denied/);
 console.log('Packing checks passed, including atomic Custom creation, rollback and idempotent retry.');
}finally{await db.close();}
