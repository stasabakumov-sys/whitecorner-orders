import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {applySql, candidateSql, validateCandidate} from './historical-backdrop-size.sql.mjs';

const modulePath = process.argv[2];
if (!modulePath) throw Error('Pass the PGlite module path');
const {PGlite} = await import(pathToFileURL(modulePath).href);
const db = new PGlite();
await db.exec(`create table wc_orders(id uuid primary key,order_number text);
 create table wc_order_items(id uuid primary key,order_id uuid,product_name text,size text,wix_options jsonb default '{}');
 create table wc_shipping_products(id uuid primary key,product_type text);
 create function wc_shop_item_product(p_item uuid) returns uuid language sql stable as $$select '00000000-0000-0000-0000-000000000003'::uuid$$;
 create function wc_shop_effective_options(p_item wc_order_items) returns jsonb language sql stable as $$
  select coalesce(p_item.wix_options,'{}'::jsonb)||case when p_item.size is null then '{}'::jsonb else jsonb_build_object('Size',p_item.size) end$$;
 insert into wc_orders values('00000000-0000-0000-0000-000000000001','10846');
 insert into wc_shipping_products values('00000000-0000-0000-0000-000000000003','Backdrop');
 insert into wc_order_items values('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','Plywood Hollow Event Backdrop with Rectangular Top',null,'{"Foldable":"YES"}');`);
assert.equal(validateCandidate((await db.query(candidateSql)).rows), false);
await db.exec(applySql);
assert.equal(validateCandidate((await db.query(candidateSql)).rows, true), true);
await db.exec(applySql);
await db.query("update wc_order_items set size='200cm x 100cm'");
await assert.rejects(db.exec(applySql), /different Hub size/);
await db.exec('rollback');
await db.query(`update wc_order_items set size=null,wix_options='{"Size":"190cm x 100cm"}'`);
await assert.rejects(db.exec(applySql), /Wix already supplies a size/);
await db.exec('rollback');
console.log('Historical Backdrop size: exact item, idempotency and conflicting data guards verified.');
await db.close();
