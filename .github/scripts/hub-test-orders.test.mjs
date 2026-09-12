import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const {PGlite}=await import(pathToFileURL(path.resolve(process.argv[2])).href);
const db=new PGlite();
try {
 await db.exec("create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.actor',true),'')::uuid$$;");
 await db.exec(await readFile('supabase/orders-schema.sql','utf8'));
 await db.exec(`create table wc_shipping_products(id uuid primary key default gen_random_uuid(),wix_product_id text unique,product_name text not null,product_type text default 'Other',active boolean default true,notes text,updated_at timestamptz default now());
 create unique index wc_shipping_products_name_ci_uq on wc_shipping_products(lower(product_name));
 create table wc_fulfilment(order_id uuid references wc_orders(id));create table wc_shipments(order_id uuid references wc_orders(id));`);
 for(const name of ['20260907000800_material_costing','20260908000300_tabletop_material_costing','20260908000400_catalog_product_costing','20260912000100_shop_floor_tracker','20260912000200_hub_test_orders','20260912000300_hub_test_products_catalog','20260912000400_product_parts_templates','20260912000500_work_rates'])
  await db.exec(await readFile(`supabase/migrations/${name}.sql`,'utf8'));
 const seed=await readFile('supabase/seeds/shop-floor-test-orders.sql','utf8');await db.exec(seed);await db.exec(seed);
 const orders=(await db.query("select * from wc_orders where order_source='hub_test' order by order_number")).rows;
 assert.equal(orders.length,2);assert.ok(orders.every(o=>o.wix_order_id===null&&Number(o.total)===0&&o.delivery_type==='Pickup'&&!o.buyer_email));
 assert.equal((await db.query('select count(*)::int n from wc_production_units')).rows[0].n,2);
 assert.deepEqual((await db.query("select product_name,product_type,wix_product_id from wc_shipping_products order by product_name")).rows,[
  {product_name:'TEST Backdrop',product_type:'Backdrop',wix_product_id:null},
  {product_name:'TEST Cart',product_type:'Cart',wix_product_id:null},
 ]);
 const actor='00000000-0000-4000-8000-000000000009';await db.query('insert into auth.users values($1)',[actor]);await db.query("select set_config('test.actor',$1,false)",[actor]);
 assert.equal((await db.query('select count(*)::int n from wc_work_rates')).rows[0].n,4);
 await db.query("select wc_save_work_rate('sanding',45,(select updated_at from wc_work_rates where work_type='sanding'))");
 assert.equal(Number((await db.query("select rate_gst_hour from wc_work_rates where work_type='sanding'")).rows[0].rate_gst_hour),45);
 const testCart=(await db.query("select id from wc_shipping_products where product_name='TEST Cart'")).rows[0].id;
 assert.deepEqual((await db.query('select product_name,component_role from wc_shop_product_components($1)',[testCart])).rows,[{product_name:'TEST Cart',component_role:'Product'}]);
 const template=(await db.query("select wc_shop_save_product_template(null,$1,'Cart standard',$2,$3,null) saved",[testCart,[{id:'body',name:'Body',component_product_id:testCart}],{'Painting:Repaint':30}])).rows[0].saved;
 assert.equal(Object.hasOwn(template.estimates,'Painting:Repaint'),false);
 const command=async(action,p)=>(await db.query('select wc_shop_command($1,$2,$3) result',[randomUUID(),action,p])).rows[0].result;
 await command('assign',{unitId:'f076f530-6be8-458b-9606-693e0153c302',templateId:template.id,finish:'painted'});
 assert.equal((await db.query("select parts->0->>'name' name from wc_shop_units where unit_id='f076f530-6be8-458b-9606-693e0153c302'")).rows[0].name,'Body');
 const mainProduct=randomUUID(),addonProduct=randomUUID();
 await db.query("insert into wc_shipping_products(id,product_name,product_type) values($1,'Pilot Cart','Cart'),($2,'Integrated ice storage shelf','Other')",[mainProduct,addonProduct]);
 const makeOrder=async(withAddon)=>{const order=randomUUID(),main=randomUUID(),unit=randomUUID();await db.query("insert into wc_orders(id,wix_order_id,order_number,currency) values($1,$2,$2,'AUD')",[order,randomUUID()]);await db.query("insert into wc_order_items(id,order_id,product_name,quantity) values($1,$2,'Pilot Cart',1)",[main,order]);if(withAddon)await db.query("insert into wc_order_items(order_id,product_name,quantity) values($1,'Integrated ice storage shelf',1)",[order]);await db.query("insert into wc_production_units(id,order_item_id,unit_index) values($1,$2,1)",[unit,main]);return unit;};
 const withAddon=await makeOrder(true),withoutAddon=await makeOrder(false);
 const composition=(await db.query("select wc_shop_save_product_template(null,$1,'With optional shelf',$2,$3,null) saved",[mainProduct,[{id:'body',name:'Body',component_product_id:mainProduct},{id:'shelf',name:'Shelf',component_product_id:addonProduct}],{}])).rows[0].saved;
 await command('assign',{unitId:withAddon,templateId:composition.id,finish:'painted'});await command('assign',{unitId:withoutAddon,templateId:composition.id,finish:'painted'});
 assert.equal((await db.query('select jsonb_array_length(parts) n from wc_shop_units where unit_id=$1',[withAddon])).rows[0].n,2);
 assert.equal((await db.query('select jsonb_array_length(parts) n from wc_shop_units where unit_id=$1',[withoutAddon])).rows[0].n,1);
 for(const table of ['wc_product_costs','wc_order_pans_costs'])assert.equal((await db.query(`select count(*)::int n from ${table} c join wc_orders o on o.id=c.order_id where o.order_source='hub_test'`)).rows[0].n,0,table);
 for(const table of ['wc_fulfilment','wc_shipments'])await assert.rejects(db.query(`insert into ${table}(order_id) values($1)`,[orders[0].id]),/TEST orders/);
 await assert.rejects(db.query("update wc_orders set order_source='wix',wix_order_id='bad' where id=$1",[orders[0].id]),/source cannot/);
 await assert.rejects(db.query("update wc_orders set wix_order_id='bad' where id=$1",[orders[0].id]),/wc_order_source_identity/);
 await db.exec('alter table wc_production_units disable trigger wc_shop_status_guard');
 await db.query("update wc_production_units set production_status='Assembly' where id='f076f530-6be8-458b-9606-693e0153c301'");
 await db.exec('alter table wc_production_units enable trigger wc_shop_status_guard');await db.exec(seed);
 assert.equal((await db.query("select production_status from wc_production_units where id='f076f530-6be8-458b-9606-693e0153c301'")).rows[0].production_status,'Assembly');
 const real=(await db.query("insert into wc_orders(wix_order_id,order_number,total) values('real-fixture','REAL',100) returning *")).rows[0];
 assert.equal(real.order_source,'wix');assert.equal(Number(real.total),100);await db.query('insert into wc_fulfilment values($1)',[real.id]);
 await db.exec('set role anon');await assert.rejects(db.query('select * from wc_orders'),/permission denied/);await db.exec('reset role');
 console.log('PASS: two idempotent Hub fixtures and visible test catalogue products, no external identity, delivery blocked, no cost pollution, progress retained, real orders and RLS unchanged');
}finally{await db.close();}
