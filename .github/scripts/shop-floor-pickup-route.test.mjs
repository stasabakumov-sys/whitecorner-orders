// Isolated PostgreSQL-compatible engine; no production credentials or customer data.
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const {PGlite}=await import(pathToFileURL(path.resolve(process.argv[2])).href);
const migration=await readFile('supabase/migrations/20260923000100_pickup_skip_packing.sql','utf8');
const db=new PGlite();
try{
 await db.exec(`
  create table wc_orders(id uuid primary key,delivery_type text,delivery_title text);
  create table wc_order_items(id uuid primary key,order_id uuid references wc_orders(id));
  create table wc_production_units(id uuid primary key,order_item_id uuid references wc_order_items(id),production_status text not null check(production_status in ('New','CNC','Assembly','Sanding','Painting','Packing','Ready')));
  create table wc_shop_units(unit_id uuid primary key references wc_production_units(id),template_id uuid,parts jsonb not null,estimates jsonb not null,finish text not null,completed text[] not null default '{}');
  create function wc_shop_status_guard() returns trigger language plpgsql as $$begin return new;end$$;
  create trigger wc_shop_status_guard before update of production_status on wc_production_units for each row execute function wc_shop_status_guard();`);
 const pickupOrder=randomUUID(),shippingOrder=randomUUID(),pickupItem=randomUUID(),shippingItem=randomUUID();
 const pickupRaw=randomUUID(),pickupPainted=randomUUID(),shippingRaw=randomUUID(),shippingPainted=randomUUID(),existingPacking=randomUUID();
 await db.query("insert into wc_orders values($1,'Pickup',null),($2,'Shipping','Courier')",[pickupOrder,shippingOrder]);
 await db.query('insert into wc_order_items values($1,$3),($2,$4)',[pickupItem,shippingItem,pickupOrder,shippingOrder]);
 await db.query("insert into wc_production_units values($1,$6,'Assembly'),($2,$6,'Painting'),($3,$7,'Assembly'),($4,$7,'Painting'),($5,$6,'Packing')",[pickupRaw,pickupPainted,shippingRaw,shippingPainted,existingPacking,pickupItem,shippingItem]);
 const parts=[{id:'body',name:'Body'}],zero={'Sanding:body':0};
 await db.query("insert into wc_shop_units(unit_id,parts,estimates,finish,completed) values($1,$6,$7,'raw',array['Assembly:finished']),($2,$6,$7,'painted',array['Painting:finished']),($3,$6,$7,'raw',array['Assembly:finished']),($4,$6,$7,'painted',array['Painting:finished']),($5,$6,$7,'painted','{}')",[pickupRaw,pickupPainted,shippingRaw,shippingPainted,existingPacking,parts,zero]);
 await db.exec(migration);
 assert.equal((await db.query('select production_status from wc_production_units where id=$1',[existingPacking])).rows[0].production_status,'Ready');
 await db.query("update wc_production_units set production_status='Ready' where id=$1",[pickupRaw]);
 await db.query("update wc_production_units set production_status='Ready' where id=$1",[pickupPainted]);
 await assert.rejects(db.query("update wc_production_units set production_status='Ready' where id=$1",[shippingRaw]),/next production stage/);
 await db.query("update wc_production_units set production_status='Packing' where id=$1",[shippingRaw]);
 await db.query("update wc_production_units set production_status='Packing' where id=$1",[shippingPainted]);
 console.log('Pickup skips Packing, Shipping retains Packing, and existing Pickup rows are corrected.');
}catch(error){console.error(error.message,error.where||'');process.exitCode=1;}finally{await db.close();}
if(!process.exitCode){
 const release=new PGlite();
 try{
  await release.exec(`
   create table wc_orders(id uuid primary key,delivery_type text,delivery_title text);
   create table wc_order_items(id uuid primary key,order_id uuid references wc_orders(id));
   create table wc_production_units(id uuid primary key,order_item_id uuid references wc_order_items(id),production_status text not null check(production_status in ('New','CNC','Assembly','Sanding','Painting','Packing','Ready')));
   create table wc_shop_units(unit_id uuid primary key references wc_production_units(id),template_id uuid,parts jsonb not null,estimates jsonb not null,finish text not null,completed text[] not null default '{}');
   create function wc_shop_status_guard() returns trigger language plpgsql as $$begin return new;end$$;
   create trigger wc_shop_status_guard before update of production_status on wc_production_units for each row execute function wc_shop_status_guard();
   create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);
   insert into supabase_migrations.schema_migrations values('20260914000400','shop_floor_skip_zero_sanding',array['baseline']);`);
  const sql=execFileSync(process.execPath,['.github/scripts/shop-floor-pickup-route-release.mjs','--print-sql'],{encoding:'utf8'});
  await release.exec(sql);await release.exec(sql);
  assert.equal((await release.query("select count(*)::int n from supabase_migrations.schema_migrations where version='20260923000100'")).rows[0].n,1);
  assert.match((await release.query("select pg_get_functiondef('wc_shop_status_guard()'::regprocedure) definition")).rows[0].definition,/pickup_order/);
  console.log('Pickup route release wrapper: first application and exact replay passed.');
 }catch(error){console.error(error.message,error.where||'');process.exitCode=1;}finally{await release.close();}
}
