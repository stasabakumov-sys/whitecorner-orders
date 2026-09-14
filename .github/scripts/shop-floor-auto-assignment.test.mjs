// Isolated PostgreSQL-compatible engine; no production credentials or customer data.
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const {PGlite}=await import(pathToFileURL(path.resolve(process.argv[2])).href);
const db=new PGlite();
try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql as $$select null::uuid$$;
  create table wc_shipping_products(id uuid primary key,product_name text,manual_sizes text);
  create table wc_order_items(id uuid primary key,wix_options jsonb);
  create table wc_production_units(id uuid primary key,order_item_id uuid references wc_order_items(id));
  create table wc_shop_templates(id uuid primary key default gen_random_uuid(),product_id uuid references wc_shipping_products(id),name text,parts jsonb default '[]',estimates jsonb default '{}',version integer default 1);
  create table wc_shop_units(unit_id uuid primary key references wc_production_units(id),template_id uuid references wc_shop_templates(id));
  create function wc_cost_main(value uuid) returns uuid language sql immutable as $$select value$$;
  create function wc_shop_save_product_template(uuid,uuid,text,jsonb,jsonb,integer) returns jsonb language sql as $$select '{}'::jsonb$$;`);
 await db.exec(await readFile('supabase/migrations/20260914000100_production_template_variants.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/20260914000300_shop_floor_auto_assignment.sql','utf8'));
 const product=randomUUID(),itemId=randomUUID(),unit=randomUUID(),template=randomUUID();
 await db.query("insert into wc_shipping_products values($1,'Plywood Backdrop','190x100')",[product]);
 await db.query('insert into wc_order_items values($1,$2)',[itemId,{Foldable:'YES',Colour:'White'}]);
 await db.query('insert into wc_production_units values($1,$2)',[unit,itemId]);
 await db.query("insert into wc_shop_templates(id,product_id,name,size_key,folding) values($1,$2,'190 foldable','1900x1000','foldable')",[template,product]);
 await db.query('insert into wc_shop_units values($1,$2)',[unit,template]);
 assert.equal((await db.query('select count(*)::int n from wc_shop_units')).rows[0].n,1);
 await db.query('delete from wc_shop_units where unit_id=$1',[unit]);
 await db.query('update wc_order_items set wix_options=$2 where id=$1',[itemId,{Size:'180x90',Foldable:'YES'}]);
 await assert.rejects(db.query('insert into wc_shop_units values($1,$2)',[unit,template]),/does not match/);
 await db.query('update wc_order_items set wix_options=$2 where id=$1',[itemId,{Size:'200cm x 100cm',Foldable:'YES'}]);
 await assert.rejects(db.query('insert into wc_shop_units values($1,$2)',[unit,template]),/does not match/);
 await db.query('update wc_order_items set wix_options=$2 where id=$1',[itemId,{Foldable:'YES'}]);
 await db.query("update wc_shipping_products set manual_sizes=E'190x100\\n180x90' where id=$1",[product]);
 await assert.rejects(db.query('insert into wc_shop_units values($1,$2)',[unit,template]),/does not match/);
 console.log('Shop Floor auto assignment: order precedence, one manual-size fallback and ambiguity rejection passed.');
}catch(error){console.error(error.message,error.where||'');process.exitCode=1;}finally{await db.close();}
if(!process.exitCode){
 const release=new PGlite();
 try{
  await release.exec(`create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql as $$select null::uuid$$;
   create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);
   create table wc_shipping_products(id uuid primary key,product_name text,manual_sizes text);create table wc_order_items(id uuid primary key,wix_options jsonb);
   create table wc_production_units(id uuid primary key,order_item_id uuid references wc_order_items(id));
   create table wc_shop_templates(id uuid primary key default gen_random_uuid(),product_id uuid references wc_shipping_products(id),name text,parts jsonb default '[]',estimates jsonb default '{}',version integer default 1);
   create table wc_shop_units(unit_id uuid primary key references wc_production_units(id),template_id uuid references wc_shop_templates(id));
   create function wc_cost_main(value uuid) returns uuid language sql immutable as $$select value$$;
   create function wc_shop_save_product_template(uuid,uuid,text,jsonb,jsonb,integer) returns jsonb language sql as $$select '{}'::jsonb$$;`);
  await release.exec(await readFile('supabase/migrations/20260914000100_production_template_variants.sql','utf8'));
  const sql=execFileSync(process.execPath,['.github/scripts/shop-floor-auto-assignment-release.mjs','--print-sql'],{encoding:'utf8'});
  await release.exec(sql);await release.exec(sql);
  assert.equal((await release.query("select count(*)::int n from supabase_migrations.schema_migrations where version='20260914000300'")).rows[0].n,1);
  console.log('Shop Floor auto-assignment wrapper: first application and exact replay passed.');
 }catch(error){console.error(error.message,error.where||'');process.exitCode=1;}finally{await release.close();}
}
