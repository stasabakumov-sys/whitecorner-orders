import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const { PGlite } = await import(pathToFileURL(path.resolve(process.argv[2])).href);
const db = new PGlite();
try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(bucket_id text,name text,metadata jsonb);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated,anon;
    grant select,insert,delete on storage.objects to authenticated,anon;
    create function public.wc_is_active_hub_member() returns boolean language sql as
      $$select current_setting('test.member',true)='active'$$;
    create function public.wc_is_hub_manager() returns boolean language sql as
      $$select current_setting('test.manager',true)='yes' and public.wc_is_active_hub_member()$$;`);
  await db.exec(await readFile('supabase/migrations/20261004000200_modeling_models.sql','utf8'));
  await db.exec(await readFile('supabase/migrations/20261005000100_modeling_roof_cart.sql','utf8'));
  assert.equal((await db.query(`select public from storage.buckets where id='hub-modeling-models'`)).rows[0].public,false);
  await db.exec(`select set_config('test.member','active',false); select set_config('test.manager','yes',false); set role authenticated;`);
  assert.equal((await db.query('select count(*)::int n from wc_modeling_models')).rows[0].n,2);
  const uuid='00000000-0000-4000-8000-000000000001';
  const upload=slug=>db.query(`insert into storage.objects values('hub-modeling-models',$1,'{"size":256}')`,[slug+'/'+uuid+'.glb']);
  for (const slug of ['classic-bar-plywood','decorative-wheel-roof-cart-mdf']) await upload(slug);
  await assert.rejects(upload('unknown-model'),/row-level security/);
  await assert.rejects(db.exec(`insert into storage.objects values('hub-modeling-models','decorative-wheel-roof-cart-mdf/../public.glb','{}')`),/row-level security/);
  await db.query(`update wc_modeling_models set model_path=$1,model_filename='roof.glb',model_bytes=256 where slug='decorative-wheel-roof-cart-mdf'`,['decorative-wheel-roof-cart-mdf/'+uuid+'.glb']);
  assert.equal((await db.query(`select model_path from wc_modeling_models where slug='classic-bar-plywood'`)).rows[0].model_path,null);
  await assert.rejects(db.exec(`update wc_modeling_models set product_name='changed'`),/permission denied/);
  await db.exec(`select set_config('test.manager','no',false);`);
  assert.equal((await db.query('select count(*)::int n from wc_modeling_models')).rows[0].n,2);
  await assert.rejects(upload('decorative-wheel-roof-cart-mdf'),/row-level security/);
  await db.exec(`select set_config('test.member','inactive',false);`);
  assert.equal((await db.query('select count(*)::int n from wc_modeling_models')).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from storage.objects')).rows[0].n,0);
  await db.exec('reset role; set role anon');
  await assert.rejects(db.query('select * from wc_modeling_models'),/permission denied/);
  console.log('PASS: both model records, private bucket, manager-only scoped uploads, inactive/anonymous denial, Classic preserved');
} finally { await db.close(); }
