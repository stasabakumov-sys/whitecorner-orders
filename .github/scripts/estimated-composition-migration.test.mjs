// Rehearse the additive Estimated min migration without production data.
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
  create table wc_shipping_products(id uuid primary key);
  create table wc_orders(id uuid primary key);
  create table wc_order_items(id uuid primary key,order_id uuid references wc_orders(id),main_item_id uuid,product_id uuid,wix_options jsonb);
  create table wc_production_units(id uuid primary key,order_item_id uuid references wc_order_items(id));
  create table wc_shop_templates(id uuid primary key,product_id uuid references wc_shipping_products(id),parts jsonb not null,estimates jsonb not null);
  alter table wc_shop_templates enable row level security;
  create table wc_shop_units(unit_id uuid primary key references wc_production_units(id),template_id uuid references wc_shop_templates(id),parts jsonb not null,estimates jsonb not null);
  create function wc_cost_main(p_item uuid) returns uuid language sql stable as $$select coalesce(main_item_id,id) from wc_order_items where id=p_item$$;
  create function wc_shop_item_product(p_item uuid) returns uuid language sql stable as $$select product_id from wc_order_items where id=p_item$$;
  create function wc_shop_option_text(value jsonb) returns text language sql immutable as $$select case jsonb_typeof(value) when 'object' then coalesce(value->>'original',value->>'value','') else value#>>'{}' end$$;
 `);
 const main=randomUUID(),addon=randomUUID(),order=randomUUID(),item=randomUUID(),addonItem=randomUUID(),unit=randomUUID(),template=randomUUID();
 const parts=[
  {id:'body',name:'Body',component_product_id:main},
  {id:'shelf',name:'Shelf',component_product_id:main,option_name:'Internal Shelf',option_value:'Yes'},
  {id:'side',name:'Side shelves',component_product_id:main,option_name:'Side Shelves',option_value:'Yes'},
  {id:'addon',name:'Add-on panel',component_product_id:addon},
 ];
 const estimates={CNC:10,'CNC:shelf':5,'CNC:side':7,'CNC:addon':3,'Assembly:body':20,'Assembly:shelf':12,'Assembly:side':14,'Assembly:addon':8};
 await db.query('insert into wc_shipping_products values($1),($2)',[main,addon]);
 await db.query('insert into wc_orders values($1)',[order]);
 await db.query('insert into wc_order_items values($1,$2,null,$3,$4),($5,$2,$1,$6,$7)',[item,order,main,{'Internal Shelf':{original:'YES'},'Side Shelves':'No'},addonItem,addon,{}]);
 await db.query('insert into wc_production_units values($1,$2)',[unit,item]);
 await db.query('insert into wc_shop_templates values($1,$2,$3,$4)',[template,main,parts,estimates]);
 const before=(await db.query('select parts,estimates from wc_shop_templates where id=$1',[template])).rows[0];
 await db.exec(await readFile('supabase/migrations/20261006000300_estimated_composition_parts.sql','utf8'));
 await db.exec('create trigger wc_shop_unit_product_parts before insert or update of template_id,parts on wc_shop_units for each row execute function wc_shop_unit_product_parts()');
 const after=(await db.query('select parts,estimates from wc_shop_templates where id=$1',[template])).rows[0];
 assert.deepEqual(after,before,'migration must preserve saved templates');
 assert.equal((await db.query("select relrowsecurity from pg_class where oid='wc_shop_templates'::regclass")).rows[0].relrowsecurity,true);
 await db.query('insert into wc_shop_units values($1,$2,$3,$4)',[unit,template,parts,estimates]);
 let snapshot=(await db.query('select parts,estimates from wc_shop_units where unit_id=$1',[unit])).rows[0];
 assert.deepEqual(snapshot.parts.map(part=>part.id),['body','shelf','addon']);
 assert.equal(snapshot.estimates.CNC,18);
 await db.query('update wc_shop_units set parts=$2 where unit_id=$1',[unit,parts]);
 snapshot=(await db.query('select parts,estimates from wc_shop_units where unit_id=$1',[unit])).rows[0];
 assert.equal(snapshot.estimates.CNC,18,'reapplying the trigger must not double count CNC');
 const secondOrder=randomUUID(),secondItem=randomUUID(),secondUnit=randomUUID();
 await db.query('insert into wc_orders values($1)',[secondOrder]);
 await db.query('insert into wc_order_items values($1,$2,null,$3,$4)',[secondItem,secondOrder,main,{'Internal Shelf':'No'}]);
 await db.query('insert into wc_production_units values($1,$2)',[secondUnit,secondItem]);
 await db.query('insert into wc_shop_units values($1,$2,$3,$4)',[secondUnit,template,parts,estimates]);
 snapshot=(await db.query('select parts,estimates from wc_shop_units where unit_id=$1',[secondUnit])).rows[0];
 assert.deepEqual(snapshot.parts.map(part=>part.id),['body']);
 assert.equal(snapshot.estimates.CNC,10);
 await assert.rejects(db.query('update wc_shop_templates set parts=$2 where id=$1',[template,[{...parts[0],option_name:'Internal Shelf'}]]),/Enter both option name and value/);
 await db.exec(await readFile('supabase/migrations/20261006000400_whole_composition_cnc.sql','utf8'));
 const totals={...estimates,[`CNC@component:${addon}`]:30,'CNC@option:internal shelf=yes':25,[`CNC@component:${addon}|option:internal shelf=yes`]:40};
 await db.query('update wc_shop_templates set estimates=$2 where id=$1',[template,totals]);
 await db.query('update wc_shop_units set parts=$2 where unit_id=$1',[unit,parts]);
 snapshot=(await db.query('select parts,estimates from wc_shop_units where unit_id=$1',[unit])).rows[0];
 assert.equal(snapshot.estimates.CNC,40,'combined configuration replaces Main CNC');
 assert.equal(snapshot.estimates['CNC:shelf'],undefined,'snapshot contains no part CNC');
 const shelfOrder=randomUUID(),shelfItem=randomUUID(),shelfUnit=randomUUID();
 await db.query('insert into wc_orders values($1)',[shelfOrder]);
 await db.query('insert into wc_order_items values($1,$2,null,$3,$4)',[shelfItem,shelfOrder,main,{'Internal Shelf':'Yes'}]);
 await db.query('insert into wc_production_units values($1,$2)',[shelfUnit,shelfItem]);
 await db.query('insert into wc_shop_units values($1,$2,$3,$4)',[shelfUnit,template,parts,totals]);
 snapshot=(await db.query('select parts,estimates from wc_shop_units where unit_id=$1',[shelfUnit])).rows[0];
 assert.equal(snapshot.estimates.CNC,25,'Main plus shelf uses its full CNC total');
 assert.equal(snapshot.estimates['CNC:shelf'],undefined);
 await db.query('update wc_shop_units set parts=$2 where unit_id=$1',[secondUnit,parts]);
 snapshot=(await db.query('select parts,estimates from wc_shop_units where unit_id=$1',[secondUnit])).rows[0];
 assert.equal(snapshot.estimates.CNC,10,'Main retains legacy base CNC');
 await db.query('update wc_shop_templates set estimates=$2 where id=$1',[template,{CNC:10,'CNC@option:internal shelf=yes':25,[`CNC@component:${addon}`]:30}]);
 await db.query('update wc_shop_units set parts=$2 where unit_id=$1',[unit,parts]);
 snapshot=(await db.query('select parts,estimates from wc_shop_units where unit_id=$1',[unit])).rows[0];
 assert.equal(snapshot.estimates.CNC,undefined,'unknown combination stays unestimated');
 const savedBefore=(await db.query('select parts,estimates from wc_shop_templates where id=$1',[template])).rows[0];
 await db.exec(await readFile('supabase/migrations/20261006000600_additive_addon_cnc.sql','utf8'));
 assert.deepEqual((await db.query('select parts,estimates from wc_shop_templates where id=$1',[template])).rows[0],savedBefore,'additive migration preserves templates');
 const additive={CNC:10,'CNC+option:internal shelf=yes':7,'CNC+option:side shelves=yes':5,[`CNC+component:${addon}`]:3,[`CNC@component:${addon}|option:internal shelf=yes`]:40};
 await db.query('update wc_shop_templates set estimates=$2 where id=$1',[template,additive]);
 await db.query('update wc_shop_units set parts=$2 where unit_id=$1',[unit,parts]);
 snapshot=(await db.query('select parts,estimates from wc_shop_units where unit_id=$1',[unit])).rows[0];
 assert.equal(snapshot.estimates.CNC,20,'configuration adds Main, shelf and product Add-on CNC instead of the old total');
 assert.equal(snapshot.estimates['CNC+option:internal shelf=yes'],undefined,'unit snapshot contains only the sum');
 await db.query("update wc_order_items set wix_options=$2 where id=$1",[item,{'Internal Shelf':'Yes','Side Shelves':'Yes'}]);
 await db.query('update wc_shop_units set parts=$2 where unit_id=$1',[unit,parts]);
 snapshot=(await db.query('select parts,estimates from wc_shop_units where unit_id=$1',[unit])).rows[0];
 assert.deepEqual(snapshot.parts.map(part=>part.id),['body','shelf','side','addon']);
 assert.equal(snapshot.estimates.CNC,25,'configuration adds both selected options without requiring a combined total');
 await db.query('update wc_shop_units set parts=$2 where unit_id=$1',[unit,parts]);
 assert.equal((await db.query('select estimates from wc_shop_units where unit_id=$1',[unit])).rows[0].estimates.CNC,25,'reapplying the trigger does not double count');
 delete additive['CNC+option:side shelves=yes'];
 await db.query('update wc_shop_templates set estimates=$2 where id=$1',[template,additive]);
 await db.query('update wc_shop_units set parts=$2 where unit_id=$1',[unit,parts]);
 assert.equal((await db.query('select estimates from wc_shop_units where unit_id=$1',[unit])).rows[0].estimates.CNC,undefined,'incomplete additive configuration stays unestimated');
 console.log('Estimated composition migration: templates preserved, RLS preserved, selected parts and CNC snapshots verified.');
}finally{await db.close();}
