import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

if(!process.argv[2])throw Error('Pass the PGlite package path');
const {PGlite}=await import(pathToFileURL(path.resolve(process.argv[2])).href);
const db=new PGlite();
try{
 await db.exec(`
  create role anon;create role authenticated;
  create table wc_shipping_products(id uuid primary key,product_name text not null,product_type text not null,updated_at timestamptz default now());
  alter table wc_shipping_products enable row level security;
  create table wc_order_items(id uuid primary key,product_name text);
  create table wc_production_units(id uuid primary key,order_item_id uuid references wc_order_items(id));
  create table wc_shop_templates(id uuid primary key,product_id uuid references wc_shipping_products(id));
  create table wc_shop_units(unit_id uuid primary key,template_id uuid references wc_shop_templates(id),paint_operations text[],completed text[] not null default '{}');
  alter table wc_shop_units enable row level security;
  create table wc_shop_intervals(id uuid primary key,unit_id uuid,stage text);
  create table wc_delivery_packaging_profiles(signature text primary key,shipping_product_id uuid,template_item jsonb);
  create table wc_box_drawings(profile_signature text);
 `);
 const display=randomUUID(),other=randomUUID(),item=randomUUID(),template=randomUUID(),fresh=randomUUID(),started=randomUUID();
 const standard=['First primer','First sanding','Second primer','Second sanding','Finish coat'];
 const backdrop=['First primer','First sanding','Finish coat'];
 await db.query('insert into wc_shipping_products(id,product_name,product_type) values($1,$2,$3),($4,$5,$6)',[display,'Half Arch Shelf Wall – Plywood Display Arch with Shelves','Other',other,'Display shelf','Other']);
 await db.query('insert into wc_order_items values($1,$2)',[item,'Half Arch Shelf Wall – Plywood Display Arch with Shelves']);
 await db.query('insert into wc_shop_templates values($1,$2)',[template,display]);
 await db.query('insert into wc_production_units values($1,$3),($2,$3)',[fresh,started,item]);
 await db.query('insert into wc_shop_units values($1,$3,$4,$5),($2,$3,$4,$5)',[fresh,started,template,standard,[]]);
 await db.query('insert into wc_shop_intervals values($1,$2,$3)',[randomUUID(),started,'Painting']);
 await db.query('insert into wc_delivery_packaging_profiles values($1,$2,$3)', ['display-profile',display,{product_name:'Half Arch Shelf Wall – Plywood Display Arch with Shelves'}]);
 await db.exec(await readFile('supabase/migrations/20261006000700_display_arch_backdrops.sql','utf8'));
 assert.equal((await db.query('select product_type from wc_shipping_products where id=$1',[display])).rows[0].product_type,'Backdrop');
 assert.equal((await db.query('select product_type from wc_shipping_products where id=$1',[other])).rows[0].product_type,'Other');
 assert.deepEqual((await db.query('select paint_operations from wc_shop_units where unit_id=$1',[fresh])).rows[0].paint_operations,backdrop);
 assert.deepEqual((await db.query('select paint_operations from wc_shop_units where unit_id=$1',[started])).rows[0].paint_operations,standard,'started painting is preserved');
 assert.deepEqual((await db.query('select wc_shop_product_paint_operations($1,$2) route',[fresh,template])).rows[0].route,backdrop);
 await db.query('update wc_shipping_products set product_type=$2 where id=$1',[display,'Other']);
 assert.equal((await db.query('select product_type from wc_shipping_products where id=$1',[display])).rows[0].product_type,'Backdrop','catalogue refresh cannot reset the operational type');
 const newDisplay=randomUUID();await db.query('insert into wc_shipping_products(id,product_name,product_type) values($1,$2,$3)',[newDisplay,'MDF Display Arch with Shelves','Other']);
 assert.equal((await db.query('select product_type from wc_shipping_products where id=$1',[newDisplay])).rows[0].product_type,'Backdrop','new imports get the type');
 await db.exec('create trigger wc_box_drawings_shared_backdrop_guard before insert or update on wc_box_drawings for each row execute function wc_require_shared_backdrop_drawing()');
 await assert.rejects(db.query('insert into wc_box_drawings values($1)',['display-profile']),/Backdrops use one shared packaging drawing/);
 assert.equal((await db.query("select relrowsecurity from pg_class where oid='wc_shipping_products'::regclass")).rows[0].relrowsecurity,true);
 assert.equal((await db.query("select relrowsecurity from pg_class where oid='wc_shop_units'::regclass")).rows[0].relrowsecurity,true);
 console.log('Display Arch with Shelves: classification, import persistence, painting route, drawing guard and RLS verified.');
}finally{await db.close();}
