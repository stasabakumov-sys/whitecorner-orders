// Isolated PostgreSQL-compatible rehearsal. No production credentials or data.
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const {PGlite}=await import(pathToFileURL(path.resolve(process.argv[2])).href);const db=new PGlite();
try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
 create table wc_shipping_products(id uuid primary key,product_name text not null,product_type text,active boolean not null default true,manual_sizes text,updated_at timestamptz not null default now());
 create table wc_shop_templates(id uuid primary key default gen_random_uuid(),product_id uuid references wc_shipping_products(id),name text not null,parts jsonb not null,estimates jsonb not null,version integer not null default 1,size_key text,folding text,constraint wc_shop_template_scope check((size_key is null and folding is null) or (size_key is not null and folding is not null)));
 create table wc_materials(id uuid primary key,active boolean not null default true);
 create table wc_material_profiles(variant_key text primary key,product_name text,options jsonb,lines jsonb,updated_by uuid,updated_at timestamptz not null default now(),shipping_product_id uuid,template_item jsonb,work_costs jsonb,pans_cost_gst numeric,materials_confirmed boolean,costing_version integer);
 create table wc_order_items(id uuid primary key,wix_options jsonb);
 create table wc_production_units(id uuid primary key,order_item_id uuid);
 create table wc_shop_units(unit_id uuid primary key,template_id uuid,parts jsonb,estimates jsonb,finish text);
 create function wc_shop_validate_parts(jsonb,jsonb) returns void language sql as $$select$$;
 create function wc_shop_save_product_template(p_id uuid,p_product uuid,p_name text,p_parts jsonb,p_estimates jsonb,p_version integer) returns jsonb language plpgsql as $$declare row wc_shop_templates;begin if p_id is null then insert into wc_shop_templates(product_id,name,parts,estimates) values(p_product,p_name,p_parts,p_estimates) returning * into row;else update wc_shop_templates set name=p_name,parts=p_parts,estimates=p_estimates,version=version+1 where id=p_id returning * into row;end if;return to_jsonb(row);end$$;
 create function wc_shop_option_text(value jsonb) returns text language sql immutable as $$select case jsonb_typeof(value) when 'object' then coalesce(value->>'original',value->>'value','') else value#>>'{}' end$$;
 create function wc_cost_main(value uuid) returns uuid language sql immutable as $$select value$$;
 create function wc_shop_variant_folding(options jsonb) returns text language sql immutable as $$select case lower(coalesce(options->>'Foldable','')) when 'yes' then 'foldable' when 'no' then 'nonfoldable' end$$;
 create function wc_shop_resolved_variant_size(jsonb,text) returns text language sql immutable as $$select '1900x950'::text$$;
 create function wc_cart_size_key(jsonb) returns text language sql immutable as $$select null::text$$;
 create function wc_shop_order_finish(options jsonb,missing_default text) returns text language sql immutable as $$select case when options ? 'Colour' then 'painted' else missing_default end$$;
 create function wc_shop_item_product(uuid) returns uuid language sql stable as $$select id from wc_shipping_products limit 1$$;`);
 await db.exec(await readFile('supabase/migrations/20260916000300_backdrop_shared_costs.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/20260916000400_backdrop_paint_option_finish.sql','utf8'));
 const actor=randomUUID(),product=randomUUID(),material=randomUUID();await db.query("select set_config('test.actor',$1,false)",[actor]);
 await db.query("insert into wc_shipping_products(id,product_name,product_type) values($1,'Ripple Arch Backdrop','Backdrop')",[product]);await db.query('insert into wc_materials(id) values($1)',[material]);
 const parts=[{id:'body',name:'Body',component_product_id:product}],estimates={CNC:20,'Assembly:body':30,'Painting:First primer':10};
 const saved=(await db.query("select wc_shop_save_backdrop_template(null,$1,'Ripple',$2,$3,null,'foldable') value",[product,parts,estimates])).rows[0].value;
 assert.equal(saved.size_key,null);assert.equal(saved.folding,'foldable');assert.equal(saved.estimates.CNC,20);assert.equal(saved.estimates['Painting:First primer'],undefined);
 await db.query("select wc_save_shared_backdrop_material_profile($1,'foldable',$2,true,null)",[product,[{material_id:material,quantity:2}]]);
 const structure=(await db.query('select * from wc_material_profiles')).rows[0];assert.match(structure.variant_key,/backdrop-structure-v2/);assert.equal(structure.options.Size,undefined);
 const paint=(await db.query('select wc_save_backdrop_paint_profile($1,$2,$3,true,0) value',[product,[{material_id:material,quantity:0.5}],{'Painting:First primer':10,'Painting:First sanding':5,'Painting:Finish coat':15}])).rows[0].value;assert.equal(paint.version,1);
 const rawItem=randomUUID(),rawUnit=randomUUID();await db.query('insert into wc_order_items values($1,$2)',[rawItem,{Foldable:'YES'}]);await db.query('insert into wc_production_units values($1,$2)',[rawUnit,rawItem]);await db.query('select wc_shop_auto_snapshot($1)',[rawUnit]);let unit=(await db.query('select * from wc_shop_units where unit_id=$1',[rawUnit])).rows[0];assert.equal(unit.finish,'raw');assert.equal(unit.estimates['Painting:First primer'],undefined);
 const paintedItem=randomUUID(),paintedUnit=randomUUID();await db.query('insert into wc_order_items values($1,$2)',[paintedItem,{Foldable:'YES',Colour:'White'}]);await db.query('insert into wc_production_units values($1,$2)',[paintedUnit,paintedItem]);await db.query('select wc_shop_auto_snapshot($1)',[paintedUnit]);unit=(await db.query('select * from wc_shop_units where unit_id=$1',[paintedUnit])).rows[0];assert.equal(unit.finish,'painted');assert.equal(unit.estimates['Painting:First primer'],10);
 const paintOptionItem=randomUUID(),paintOptionUnit=randomUUID();await db.query('insert into wc_order_items values($1,$2)',[paintOptionItem,{Foldable:'YES',Paint:'Yes'}]);await db.query('insert into wc_production_units values($1,$2)',[paintOptionUnit,paintOptionItem]);await db.query('select wc_shop_auto_snapshot($1)',[paintOptionUnit]);unit=(await db.query('select * from wc_shop_units where unit_id=$1',[paintOptionUnit])).rows[0];assert.equal(unit.finish,'painted');assert.equal(unit.estimates['Painting:First primer'],10);
 assert.equal((await db.query("select wc_shop_order_finish($1,'raw') finish",[{Paint:'No'}])).rows[0].finish,'raw');
 await db.exec("create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[])");
 const releaseSql=execFileSync(process.execPath,['.github/scripts/backdrop-paint-option-release.mjs','--print-sql'],{encoding:'utf8'});await db.exec(releaseSql);await db.exec(releaseSql);
 assert.equal((await db.query("select count(*)::int n from supabase_migrations.schema_migrations where version='20260916000400'")).rows[0].n,1);
 console.log('Backdrop shared costs: product-wide folding templates, shared materials and one painting add-on passed.');
}catch(error){console.error(error.message,error.where||'',error.position||'');process.exitCode=1;}finally{await db.close();}
