// Isolated PostgreSQL-compatible engine; no production credentials or customer data.
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const {PGlite}=await import(pathToFileURL(path.resolve(process.argv[2])).href);
const db=new PGlite();
const actor=randomUUID();

async function schema(target){await target.exec(`
 create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql as $$select null::uuid$$;
 create table wc_orders(id uuid primary key,updated_at timestamptz not null default now());
 create table wc_shipping_products(id uuid primary key,wix_product_id text,product_name text not null,manual_sizes text,active boolean not null default true);
 create table wc_order_items(id uuid primary key,order_id uuid not null references wc_orders(id),product_name text not null,catalog_reference jsonb,wix_options jsonb);
 create table wc_production_units(id uuid primary key,order_item_id uuid not null references wc_order_items(id),production_status text not null);
 create table wc_shop_templates(id uuid primary key default gen_random_uuid(),product_id uuid references wc_shipping_products(id),name text not null,parts jsonb not null,estimates jsonb not null,version integer not null default 1,size_key text,folding text);
 create table wc_shop_units(unit_id uuid primary key references wc_production_units(id),template_id uuid not null references wc_shop_templates(id),parts jsonb not null,estimates jsonb not null,finish text not null,completed text[] not null default '{}');
 create table wc_order_activity(id bigint generated always as identity primary key,order_id uuid,production_unit_id uuid,activity_type text,old_status text,new_status text,created_by text,created_at timestamptz default now());
 create function wc_cost_main(value uuid) returns uuid language sql immutable as $$select value$$;
 create function wc_shop_item_product(p_item uuid) returns uuid language sql stable as $$
  select p.id from wc_order_items i join wc_shipping_products p on
   ((p.wix_product_id is not null and p.wix_product_id=coalesce(i.catalog_reference->>'catalogItemId',i.catalog_reference->>'productId'))
    or (p.wix_product_id is null and lower(btrim(p.product_name))=lower(btrim(i.product_name))))
  where i.id=p_item order by (p.wix_product_id is not null) desc limit 1$$;
 create function wc_shop_option_text(value jsonb) returns text language sql immutable as $$select case jsonb_typeof(value) when 'object' then coalesce(value->>'original',value->>'value','') else value#>>'{}' end$$;
 create function wc_shop_variant_folding(options jsonb) returns text language sql immutable as $$
  with n as(select case regexp_replace(lower(btrim(wc_shop_option_text(value))),'[\\s_-]','','g') when 'yes' then 'foldable' when 'true' then 'foldable' when 'foldable' then 'foldable' when 'no' then 'nonfoldable' when 'false' then 'nonfoldable' when 'nonfoldable' then 'nonfoldable' else '' end value from jsonb_each(coalesce(options,'{}')) where lower(btrim(key))='foldable')
  select case when count(distinct value)=1 and min(value)<>'' then min(value) end from n$$;
 create function wc_shop_resolved_variant_size(options jsonb,manual_sizes text) returns text language sql immutable as $$
  select case when options ? 'Size' then replace(lower(options->>'Size'),'cm','') else replace(lower(btrim(manual_sizes)),'x','0x')||'0' end$$;
 create function wc_shop_validate_parts(parts jsonb,estimates jsonb) returns void language plpgsql as $$begin if jsonb_typeof(parts) is distinct from 'array' or jsonb_array_length(parts)=0 then raise exception 'Add product parts before CNC';end if;end$$;
 create function wc_assert_delivery_context(uuid,timestamptz,jsonb,jsonb,timestamptz) returns void language sql as $$select$$;
 create function wc_set_reviewed_production_status(uuid,uuid,text,uuid,text,timestamptz,jsonb,jsonb,timestamptz) returns jsonb language sql as $$select null::jsonb$$;
 create function wc_shop_status_guard() returns trigger language plpgsql as $$begin
  if new.production_status='CNC' and not exists(select 1 from wc_shop_units where unit_id=new.id) then raise exception 'Add and assign product parts in Shop Floor before CNC';end if;return new;end$$;
 create trigger wc_shop_status_guard before update of production_status on wc_production_units for each row execute function wc_shop_status_guard();
 `);}

async function fixture({name='Mobile Bar',wixId=randomUUID(),options={Colour:'White'},templates=1,size=null,folding=null,manualSizes=null}={}){
 const order=randomUUID(),product=randomUUID(),item=randomUUID(),unit=randomUUID();
 await db.query('insert into wc_orders(id) values($1)',[order]);
 await db.query('insert into wc_shipping_products(id,wix_product_id,product_name,manual_sizes) values($1,$2,$3,$4)',[product,wixId,name,manualSizes]);
 await db.query('insert into wc_order_items values($1,$2,$3,$4,$5)',[item,order,name,{catalogItemId:wixId},options]);
 await db.query("insert into wc_production_units values($1,$2,'New')",[unit,item]);
 for(let index=0;index<templates;index++)await db.query("insert into wc_shop_templates(product_id,name,parts,estimates,size_key,folding) values($1,$2,$3,$4,$5,$6)",[product,`Template ${index+1}`,[{id:'body',name:'Body'}],{'Assembly:body':30,'Sanding:body':0},size,folding]);
 return {order,product,item,unit};
}

async function moveToCnc(value){return db.query("select wc_set_reviewed_production_status($1,$2,'CNC',$3,'not_required',null,'[]','[]',null)",[value.order,value.unit,actor]);}

try{
 await schema(db);
 await db.exec(await readFile('supabase/migrations/20260914000500_shop_floor_cnc_auto_snapshot.sql','utf8'));

 const painted=await fixture();await moveToCnc(painted);
 let snapshot=(await db.query('select s.*,u.production_status from wc_shop_units s join wc_production_units u on u.id=s.unit_id where s.unit_id=$1',[painted.unit])).rows[0];
 assert.equal(snapshot.finish,'painted');assert.equal(snapshot.production_status,'CNC');assert.equal(snapshot.parts[0].id,'body');
 await db.query("update wc_shop_templates set estimates='{}' where product_id=$1",[painted.product]);
 snapshot=(await db.query('select estimates from wc_shop_units where unit_id=$1',[painted.unit])).rows[0];
 assert.equal(snapshot.estimates['Assembly:body'],30,'the per-unit snapshot must remain immutable after Product edits');

 const raw=await fixture({options:{Finish:{value:'Natural'}}});await moveToCnc(raw);
 assert.equal((await db.query('select finish from wc_shop_units where unit_id=$1',[raw.unit])).rows[0].finish,'raw');

 const backdrop=await fixture({name:'Plywood Backdrop',options:{Foldable:'YES',Colour:'White'},size:'1900x1000',folding:'foldable',manualSizes:'190x100'});await moveToCnc(backdrop);
 assert.equal((await db.query('select finish from wc_shop_units where unit_id=$1',[backdrop.unit])).rows[0].finish,'painted');

 const ambiguous=await fixture({templates:2});await assert.rejects(moveToCnc(ambiguous),/Multiple Estimated min templates match/);
 assert.equal((await db.query('select production_status from wc_production_units where id=$1',[ambiguous.unit])).rows[0].production_status,'New');
 const noTemplate=await fixture({templates:0});await assert.rejects(moveToCnc(noTemplate),/No Estimated min template matches/);
 const noFinish=await fixture({options:{Size:'100x50'}});await assert.rejects(moveToCnc(noFinish),/order finish is unclear/);

 const noProductOrder=randomUUID(),noProductItem=randomUUID(),noProductUnit=randomUUID();
 await db.query('insert into wc_orders(id) values($1)',[noProductOrder]);
 await db.query("insert into wc_order_items values($1,$2,'Unknown','{}',$3)",[noProductItem,noProductOrder,{Colour:'White'}]);
 await db.query("insert into wc_production_units values($1,$2,'New')",[noProductUnit,noProductItem]);
 await assert.rejects(moveToCnc({order:noProductOrder,unit:noProductUnit}),/No Product card matches/);

 assert.equal((await db.query("select count(*)::int n from wc_order_activity where activity_type='status_change'")).rows[0].n,3);
 console.log('Automatic CNC snapshot: painted/raw success, immutable snapshot and actionable ambiguity errors passed.');
}catch(error){console.error(error.message,error.where||'');process.exitCode=1;}finally{await db.close();}

if(!process.exitCode){
 const release=new PGlite();
 try{
  await schema(release);
  await release.exec(`create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);
   insert into supabase_migrations.schema_migrations values
   ('20260912000100','shop_floor_tracker',array['baseline']),
   ('20260914000300','shop_floor_auto_assignment',array['automatic']),
   ('20260914000400','shop_floor_skip_zero_sanding',array['zero']);`);
  const sql=execFileSync(process.execPath,['.github/scripts/shop-floor-cnc-auto-snapshot-release.mjs','--print-sql'],{encoding:'utf8'});
  await release.exec(sql);await release.exec(sql);
  assert.equal((await release.query("select count(*)::int n from supabase_migrations.schema_migrations where version='20260914000500'")).rows[0].n,1);
  console.log('Automatic CNC snapshot wrapper: first application and exact replay passed.');
 }catch(error){console.error(error.message,error.where||'');process.exitCode=1;}finally{await release.close();}
}
