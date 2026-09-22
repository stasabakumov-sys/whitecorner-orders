// Rehearse CNC sheet storage and RPCs with synthetic records only.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

const {PGlite}=await import(pathToFileURL(path.resolve(process.argv[2])).href);
const db=new PGlite();
try{
 await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
 create function storage.foldername(path text) returns text[] language sql immutable as $$select string_to_array(path,'/')$$;
 create table public.wc_shipping_products(id uuid primary key, product_name text);
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
 alter table storage.objects enable row level security;
 grant usage on schema public,storage,auth to authenticated;
 grant select,insert,delete on storage.objects to authenticated;`);
 await db.exec(await readFile('supabase/migrations/20260922000100_product_cnc_sheets.sql','utf8'));
 const actor=randomUUID(),product=randomUUID(),other=randomUUID();
 await db.query("select set_config('test.actor',$1,false)",[actor]);
 await db.query('insert into public.wc_shipping_products values($1,$2),($3,$4)',[product,'Market Table',other,'Other Product']);
 const parts=[{id:'side-panel',name:'Side panel'}];
 const saved=(await db.query('select to_jsonb(public.wc_save_product_cnc_sheet(null,$1,1,$2,$3,$4,null)) value',[product,'Birch sheet',parts,'Cut along grain'])).rows[0].value;
 assert.equal(saved.product_id,product);assert.deepEqual(saved.parts,parts);assert.equal(saved.comment,'Cut along grain');
 await assert.rejects(async()=>{await db.query('select public.wc_save_product_cnc_sheet(null,$1,1,$2,$3,$4,null)',[product,'Duplicate',[], '']);},/duplicate key/);
 await assert.rejects(async()=>{await db.query('select public.wc_save_product_cnc_sheet($1,$2,2,$3,$4,$5,$6)',[saved.id,other,'Moved',[], '',saved.revision]);},/changed/);
 await assert.rejects(async()=>{await db.query('select public.wc_save_product_cnc_sheet($1,$2,2,$3,$4,$5,$6)',[saved.id,product,'Changed',[], '',randomUUID()]);},/changed/);
 const updated=(await db.query('select to_jsonb(public.wc_save_product_cnc_sheet($1,$2,2,$3,$4,$5,$6)) value',[saved.id,product,'Second sheet',parts,'Revised',saved.revision])).rows[0].value;
 assert.equal(updated.sheet_number,2);assert.notEqual(updated.revision,saved.revision);
 const objectPath=`${actor}/${randomUUID()}`;
 await db.query("insert into storage.objects(bucket_id,name,metadata) values('cnc-files',$1,$2)",[objectPath,{size:123}]);
 await assert.rejects(async()=>{await db.query('select public.wc_attach_product_cnc_file($1,$2,$3,123,$4)',[saved.id,objectPath,'wrong.nc',updated.revision]);},/Invalid or missing TAP/);
 await assert.rejects(async()=>{await db.query('select public.wc_attach_product_cnc_file($1,$2,$3,124,$4)',[saved.id,objectPath,'cut.tap',updated.revision]);},/Invalid or missing TAP/);
 const attached=(await db.query('select to_jsonb(public.wc_attach_product_cnc_file($1,$2,$3,123,$4)) value',[saved.id,objectPath,'cut.tap',updated.revision])).rows[0].value;
 assert.equal(attached.filename,'cut.tap');assert.equal(attached.object_path,objectPath);
 await assert.rejects(async()=>{await db.query('select public.wc_attach_product_cnc_file($1,$2,$3,123,$4)',[saved.id,objectPath,'cut.tap',updated.revision]);},/changed/);
 await db.exec('set role authenticated');
 assert.equal((await db.query('select count(*)::int n from public.wc_product_cnc_sheets')).rows[0].n,1);
 await assert.rejects(async()=>{await db.query("update public.wc_product_cnc_sheets set name='bypass'");},/permission denied/);
 assert.equal((await db.query("select public.wc_save_product_cnc_sheet($1,$2,2,'Allowed',$3,'', $4) is not null ok",[saved.id,product,parts,attached.revision])).rows[0].ok,true);
 await db.exec('reset role');
 console.log('CNC cutting sheets: schema, product scope, revisions, TAP attachment and RLS passed.');
}catch(error){console.error(error.message,error.where||'',error.position||'');process.exitCode=1;}finally{await db.close();}
