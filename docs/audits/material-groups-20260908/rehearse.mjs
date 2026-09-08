import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

const {PGlite}=await import(pathToFileURL(process.argv[2]).href);
const db=new PGlite();
const versions=[
 '20260830000100','20260830000200','20260831000100','20260831000200',
 '20260831000300','20260901000200','20260903000100','20260903000200',
 '20260904000100','20260904193000','20260905000100','20260906000100',
 '20260907000100','20260907000200','20260907000300','20260907000400',
 '20260907000500','20260907000600','20260907000700','20260907000800'
];

try {
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
 create schema supabase_migrations;
 create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);`);
 await db.exec(await readFile('supabase/orders-schema.sql','utf8'));
 const order=(await db.query("insert into wc_orders(wix_order_id,order_number,currency) values('fixture','TEST','AUD') returning id")).rows[0].id;
 const item=(await db.query("insert into wc_order_items(order_id,product_name,catalog_reference) values($1,'Cart','{\"catalogItemId\":\"cart\"}') returning id",[order])).rows[0].id;
 await db.query("insert into wc_production_units(order_item_id,unit_index,production_status) values($1,1,'New')",[item]);
 await db.exec(await readFile('supabase/migrations/20260907000800_material_costing.sql','utf8'));
 await db.exec("select set_config('test.actor','00000000-0000-4000-8000-000000000009',false)");
 const legacy=(await db.query("select wc_save_material(null,'Legacy stock','piece',5,true,null) m")).rows[0].m;
 for(const version of versions)await db.query('insert into supabase_migrations.schema_migrations(version) values($1)',[version]);

 const sql=await readFile('docs/audits/material-groups-20260908/apply-groups-only.sql','utf8');
 const businessBefore={
  orders:(await db.query('select to_jsonb(o) row from wc_orders o order by id')).rows,
  items:(await db.query('select to_jsonb(i) row from wc_order_items i order by id')).rows,
  units:(await db.query('select to_jsonb(u) row from wc_production_units u order by id')).rows,
  costs:(await db.query('select to_jsonb(c) row from wc_product_costs c order by unit_id')).rows
 };

 await assert.rejects(db.exec(sql.replace("'20260907000800'", "'20260907000799'")),/Migration history differs/);
 await db.exec('rollback');
 assert.equal((await db.query("select to_regclass('public.wc_material_groups') t")).rows[0].t,null);

 const forcedFailure=sql.replace('insert into supabase_migrations.schema_migrations(version,name,statements)', 'select 1/0;\ninsert into supabase_migrations.schema_migrations(version,name,statements)');
 await assert.rejects(db.exec(forcedFailure),/division by zero/);
 await db.exec('rollback');
 assert.equal((await db.query("select to_regclass('public.wc_material_groups') t")).rows[0].t,null);
 assert.equal((await db.query("select count(*)::int n from information_schema.columns where table_schema='public' and table_name='wc_materials' and column_name='group_id'")).rows[0].n,0);

 await db.exec(sql);
 assert.equal((await db.query('select count(*)::int n from wc_material_groups')).rows[0].n,8);
 assert.equal((await db.query('select group_id from wc_materials where id=$1',[legacy.id])).rows[0].group_id,null);
 assert.equal((await db.query("select count(*)::int n from supabase_migrations.schema_migrations where version='20260908000100'")).rows[0].n,1);
 assert.equal((await db.query("select count(*)::int n from supabase_migrations.schema_migrations where version='20260901000100'")).rows[0].n,0);
 assert.deepEqual({
  orders:(await db.query('select to_jsonb(o) row from wc_orders o order by id')).rows,
  items:(await db.query('select to_jsonb(i) row from wc_order_items i order by id')).rows,
  units:(await db.query('select to_jsonb(u) row from wc_production_units u order by id')).rows,
  costs:(await db.query('select to_jsonb(c) row from wc_product_costs c order by unit_id')).rows
 },businessBefore);
 await assert.rejects(db.exec(sql),/Migration history differs/);
 await db.exec('rollback');
 console.log('PASS: exact history guard, atomic rollback, Email AI exclusion, legacy material preservation, and no order/item/unit/cost changes');
} finally {
 await db.close();
}
