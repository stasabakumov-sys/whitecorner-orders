import {readFile} from 'node:fs/promises';import {pathToFileURL} from 'node:url';import path from 'node:path';import assert from 'node:assert/strict';
const {PGlite}=await import(pathToFileURL(path.resolve(process.argv[2])).href);const db=new PGlite();
try{
 await db.exec('create role anon;create role authenticated;');
 const base=(await readFile('supabase/migrations/20260830000200_create_wc_shipping_data.sql','utf8')).replace(/^create extension[^;]+;\s*/i,'');await db.exec(base);
 await db.exec("alter table wc_shipping_packages add column contents jsonb not null default '[]';create table wc_delivery_packaging_profiles(signature text primary key,shipping_product_id uuid,template_item jsonb,packages jsonb,updated_at timestamptz default now())");
 const mdf=(await db.query("select id from wc_shipping_products where product_name like 'MDF Mobile%'" )).rows[0].id;
 await db.query("insert into wc_delivery_packaging_profiles(signature,shipping_product_id,template_item,packages) values('base',$1,$2,$3)",[mdf,{wix_options:{'Internal Shelf':'No','Side shelves':'No'}},[{package_name:'Front',length_mm:1180,width_mm:670,height_mm:60,weight_kg:22.5,contents:[]},{package_name:'Top',length_mm:1230,width_mm:630,height_mm:150,weight_kg:25,contents:[]},{package_name:'Castors',length_mm:280,width_mm:150,height_mm:150,weight_kg:3,contents:[]}]]);
 await db.exec("insert into wc_shipping_products(product_name,product_type) values('Another Mobile Cart','Other')");
 const migration=await readFile('supabase/migrations/20260914000600_cart_modular_packaging.sql','utf8');await db.exec(migration);await db.exec(migration);
 const carts=(await db.query("select id from wc_shipping_products where product_type='Cart'")).rows;
 assert.equal(carts.length,3);
 for(const cart of carts){
  const rules=(await db.query("select lower(match_name) name,count(*)::int n from wc_shipping_rules where shipping_product_id=$1 and effect_type='Add package' and lower(match_value)='yes' and lower(match_name) in('internal shelf','side shelves') group by lower(match_name) order by name",[cart.id])).rows;
  assert.deepEqual(rules,[{name:'internal shelf',n:1},{name:'side shelves',n:1}]);
 }
 const promoted=(await db.query("select package_name,length_mm::int length_mm from wc_shipping_packages where shipping_product_id=$1 and source_type='Base' order by package_no",[mdf])).rows;
 assert.deepEqual(promoted,[{package_name:'Front',length_mm:1180},{package_name:'Top',length_mm:1230},{package_name:'Castors',length_mm:280}]);
 console.log('PASS: every Cart has one reusable Internal Shelf and Side shelves package rule');
}catch(e){console.error(e.message);console.error(e.where||'');process.exitCode=1;}finally{await db.close();}
