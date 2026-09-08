import {readFile} from 'node:fs/promises';import {pathToFileURL} from 'node:url';import path from 'node:path';import assert from 'node:assert/strict';
const {PGlite}=await import(pathToFileURL(path.resolve(process.argv[2])).href);const db=new PGlite();
try{
 await db.exec("create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.actor',true),'')::uuid$$;");
 await db.exec(await readFile('supabase/orders-schema.sql','utf8'));
 // Only the registry is needed; packaging is deliberately left untouched.
 await db.exec("create table wc_shipping_products(id uuid primary key default gen_random_uuid(),wix_product_id text unique,product_name text not null,product_type text default 'Other',active boolean default true);create unique index wc_shipping_products_name_ci_uq on wc_shipping_products(lower(product_name));");
 for(const f of ['20260907000800_material_costing.sql','20260908000300_tabletop_material_costing.sql','20260908000400_catalog_product_costing.sql'])await db.exec(await readFile('supabase/migrations/'+f,'utf8'));
 await db.exec("select set_config('test.actor','00000000-0000-4000-8000-000000000009',false)");
 const create=async(n,qty=2,status='Painting')=>{
  const o=(await db.query("insert into wc_orders(wix_order_id,order_number,currency) values($1,$1,'AUD') returning id",[n])).rows[0].id;
  const item=async(name,key,pans)=>{const i=(await db.query("insert into wc_order_items(order_id,product_name,quantity,wix_options,catalog_reference) values($1,$2,$3,$4,jsonb_build_object('catalogItemId',$5::text)) returning id",[o,name,qty,{Pans:pans,'Tabletop design':'Plain - without cutouts'},key])).rows[0].id;return i;};
  const main=await item('Mobile Cart','cart','With 13 pans'),addon=await item('Additional Tabletop','top','Without steel pans');
  for(const i of [main,addon])await db.query('insert into wc_production_units(order_item_id,unit_index,production_status) select $1,n,$3 from generate_series(1,$2::int)n',[i,qty,status]);
  return {o,main,addon};
 };
 const a=await create('A');
 const descriptors=async()=> (await db.query('select * from wc_catalog_cost_parts()')).rows.map(r=>r.wc_catalog_cost_parts);
 const parts=(await descriptors()).filter(p=>p.order_id===a.o);assert.equal(parts.length,2);assert.equal(parts.filter(p=>p.has_pans).length,1);
 assert.equal((await db.query('select count(*)::int n from wc_shipping_products')).rows[0].n,2);
 const material=(await db.query("select wc_save_material(null,'Ply','sheet',11,true,null) m")).rows[0].m;
 const save=async(part,work,pans,confirmed=true)=>{const version=(await db.query('select updated_at from wc_material_profiles where variant_key=$1',[part.variant_key])).rows[0]?.updated_at??null;return db.query('select wc_save_catalog_cost_profile($1,$2,$3,$4,$5,$6,$7,$8)',[part.main_item_id,part.item_id,part.variant_key,[{material_id:material.id,quantity:1}],work,pans,confirmed,version]);};
 const main=parts.find(p=>p.kind==='main'),addon=parts.find(p=>p.kind==='addon');
 const work={cnc:2,assembly:3,sanding:4,painting:5};
 await save(main,{cnc:null,assembly:null,sanding:null,painting:null},40,false);
 assert.equal(Number((await db.query('select total_gst from wc_order_pans_costs where order_id=$1',[a.o])).rows[0].total_gst),80);
 await save(addon,work,null);await save(main,work,40);
 const costs=async o=>(await db.query('select * from wc_product_costs where order_id=$1 order by unit_id',[o])).rows;
 const locked=await costs(a.o);assert.equal(locked.length,2);assert.ok(locked.every(c=>Number(c.total_gst)===50&&c.snapshot.components.length===2&&c.item_id===a.main));
 await save(main,{...work,cnc:20},55);assert.deepEqual(await costs(a.o),locked);assert.equal(Number((await db.query('select total_gst from wc_order_pans_costs where order_id=$1',[a.o])).rows[0].total_gst),80);
 const b=await create('B',1);assert.equal((await costs(b.o)).length,1);assert.equal(Number((await costs(b.o))[0].total_gst),68);
 assert.equal((await db.query('select count(*)::int n from wc_shipping_products')).rows[0].n,2);
 const ready=await create('Ready',1,'Ready');assert.equal((await costs(ready.o)).length,0);
 // The catalogue and its editable profile survive removal of the example order lines.
 await db.query('delete from wc_order_items where order_id=$1',[a.o]);
 await save(main,work,60);
 assert.equal((await db.query('select count(*)::int n from wc_shipping_products')).rows[0].n,2);
 assert.equal(Number((await db.query('select pans_cost_gst from wc_material_profiles where variant_key=$1',[main.variant_key])).rows[0].pans_cost_gst),60);
 await assert.rejects(save(main,{...work,cnc:-1},40),/work cost/);
 await db.exec('set role authenticated');await assert.rejects(db.query('update wc_product_costs set total_gst=0'),/permission denied/);await assert.rejects(db.query('select wc_catalog_register($1)',[main.item_id]),/permission denied/);await db.exec('reset role');
 console.log('PASS: shared registry, separate main/addon profiles, draft Pans totals, work/GST arithmetic, future reuse, immutable snapshots, Ready and RLS');
}catch(e){console.error(e.message);console.error(e.where||'');if(e.position)console.error(e.query?.slice(Number(e.position)-100,Number(e.position)+100));process.exitCode=1;}finally{await db.close();}
