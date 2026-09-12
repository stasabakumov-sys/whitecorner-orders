import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const {PGlite}=await import(pathToFileURL(path.resolve(process.argv[2])).href);
const db=new PGlite();
try {
 await db.exec("create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql as $$select null::uuid$$;");
 await db.exec(await readFile('supabase/orders-schema.sql','utf8'));
 await db.exec(`create table wc_shipping_products(id uuid primary key default gen_random_uuid(),wix_product_id text unique,product_name text not null,product_type text default 'Other',active boolean default true,notes text,updated_at timestamptz default now());
 create unique index wc_shipping_products_name_ci_uq on wc_shipping_products(lower(product_name));
 create table wc_fulfilment(order_id uuid references wc_orders(id));create table wc_shipments(order_id uuid references wc_orders(id));`);
 for(const name of ['20260907000800_material_costing','20260908000300_tabletop_material_costing','20260908000400_catalog_product_costing','20260912000200_hub_test_orders','20260912000300_hub_test_products_catalog'])
  await db.exec(await readFile(`supabase/migrations/${name}.sql`,'utf8'));
 const seed=await readFile('supabase/seeds/shop-floor-test-orders.sql','utf8');await db.exec(seed);await db.exec(seed);
 const orders=(await db.query("select * from wc_orders where order_source='hub_test' order by order_number")).rows;
 assert.equal(orders.length,2);assert.ok(orders.every(o=>o.wix_order_id===null&&Number(o.total)===0&&o.delivery_type==='Pickup'&&!o.buyer_email));
 assert.equal((await db.query('select count(*)::int n from wc_production_units')).rows[0].n,2);
 assert.deepEqual((await db.query("select product_name,product_type,wix_product_id from wc_shipping_products order by product_name")).rows,[
  {product_name:'TEST Backdrop',product_type:'Backdrop',wix_product_id:null},
  {product_name:'TEST Cart',product_type:'Cart',wix_product_id:null},
 ]);
 for(const table of ['wc_product_costs','wc_order_pans_costs'])assert.equal((await db.query(`select count(*)::int n from ${table}`)).rows[0].n,0,table);
 for(const table of ['wc_fulfilment','wc_shipments'])await assert.rejects(db.query(`insert into ${table}(order_id) values($1)`,[orders[0].id]),/TEST orders/);
 await assert.rejects(db.query("update wc_orders set order_source='wix',wix_order_id='bad' where id=$1",[orders[0].id]),/source cannot/);
 await assert.rejects(db.query("update wc_orders set wix_order_id='bad' where id=$1",[orders[0].id]),/wc_order_source_identity/);
 await db.query("update wc_production_units set production_status='Assembly' where id='f076f530-6be8-458b-9606-693e0153c301'");await db.exec(seed);
 assert.equal((await db.query("select production_status from wc_production_units where id='f076f530-6be8-458b-9606-693e0153c301'")).rows[0].production_status,'Assembly');
 const real=(await db.query("insert into wc_orders(wix_order_id,order_number,total) values('real-fixture','REAL',100) returning *")).rows[0];
 assert.equal(real.order_source,'wix');assert.equal(Number(real.total),100);await db.query('insert into wc_fulfilment values($1)',[real.id]);
 await db.exec('set role anon');await assert.rejects(db.query('select * from wc_orders'),/permission denied/);await db.exec('reset role');
 console.log('PASS: two idempotent Hub fixtures and visible test catalogue products, no external identity, delivery blocked, no cost pollution, progress retained, real orders and RLS unchanged');
}finally{await db.close();}
