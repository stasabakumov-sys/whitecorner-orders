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
  create table wc_shipping_products(id uuid primary key,product_name text,product_type text,manual_sizes text default '',backdrop_paint_profile jsonb default '{}',active boolean default true);
  alter table wc_shipping_products enable row level security;
  create table wc_order_items(id uuid primary key,order_id uuid,product_id uuid,wix_options jsonb default '{}',size text);
  alter table wc_order_items enable row level security;
  create table wc_production_units(id uuid primary key,order_item_id uuid,production_status text);
  create table wc_shop_templates(id uuid primary key,product_id uuid,parts jsonb,estimates jsonb,size_key text,folding text);
  create table wc_shop_units(unit_id uuid primary key,template_id uuid,parts jsonb,estimates jsonb,completed text[] default '{}');
  alter table wc_shop_units enable row level security;
  create table wc_shop_intervals(id uuid primary key,unit_id uuid);
  create function wc_is_hub_manager() returns boolean language sql as $$select true$$;
  create function wc_shop_item_product(p_item uuid) returns uuid language sql as $$select product_id from wc_order_items where id=p_item$$;
  create function wc_cost_main(p_item uuid) returns uuid language sql as $$select p_item$$;
  create function wc_shop_manual_metric_size(value text) returns text language sql as $$select case when value='190cm x 100cm' then '1900x1000' end$$;
  create function wc_shop_part_matches_options(part jsonb,options jsonb) returns boolean language sql as $$
   select part->>'option_name' is null or exists(select 1 from jsonb_each_text(options) choice where lower(choice.key)=lower(part->>'option_name') and lower(choice.value)=lower(part->>'option_value'))$$;
  create function wc_shop_cnc_composition_key(parts jsonb,estimates jsonb,product uuid,options jsonb,components uuid[]) returns text language sql as $$
   select case when options->>'Internal Shelf'='Yes' then 'CNC@option:internal shelf=yes' else 'CNC' end$$;
  set check_function_bodies=off;
 `);
 await db.exec(await readFile('supabase/migrations/20261006000800_cart_scoped_estimates_order_size.sql','utf8'));
 const backdrop=randomUUID(),cart=randomUUID(),backdropItem=randomUUID(),cartItem=randomUUID(),backdropUnit=randomUUID(),cartUnit=randomUUID(),backdropTemplate=randomUUID(),cartTemplate=randomUUID(),order=randomUUID();
 await db.query('insert into wc_shipping_products(id,product_name,product_type) values($1,$2,$3),($4,$5,$6)',[backdrop,'Plywood Hollow Event Backdrop','Backdrop',cart,'Ply Classic Cart','Cart']);
 await db.query('insert into wc_order_items(id,order_id,product_id,wix_options) values($1,$3,$4,$5),($2,$3,$6,$7)',[backdropItem,cartItem,order,backdrop,{Foldable:'YES',Colour:'Raw'},cart,{'Internal Shelf':'Yes'}]);
 assert.equal((await db.query('select wc_set_order_item_size($1,$2) size',[backdropItem,'190cm x 100cm'])).rows[0].size,'190cm x 100cm');
 const effective=(await db.query('select wc_shop_effective_options(item) options from wc_order_items item where id=$1',[backdropItem])).rows[0].options;
 assert.deepEqual(effective,{Foldable:'YES',Colour:'Raw',Size:'190cm x 100cm'});
 await assert.rejects(db.query('select wc_set_order_item_size($1,$2)',[backdropItem,'wrong']),/two-dimensional size/);
 await db.exec('create or replace function wc_is_hub_manager() returns boolean language sql as $$select false$$');
 await assert.rejects(db.query('select wc_set_order_item_size($1,$2)',[backdropItem,'190cm x 100cm']),/Manager access required/);
 await db.exec('create or replace function wc_is_hub_manager() returns boolean language sql as $$select true$$');
 await db.query('update wc_order_items set wix_options=$2 where id=$1',[backdropItem,{Size:'190cm x 100cm',Foldable:'YES'}]);
 await assert.rejects(db.query('select wc_set_order_item_size($1,$2)',[backdropItem,'190cm x 100cm']),/Wix size/);
 await db.query('update wc_order_items set wix_options=$2 where id=$1',[backdropItem,{Foldable:'YES',Colour:'Raw'}]);
 await db.query('insert into wc_production_units values($1,$2,$3),($4,$5,$3)',[backdropUnit,backdropItem,'New',cartUnit,cartItem]);
 const backdropPart={id:randomUUID(),component_product_id:backdrop,option_name:'Size',option_value:'190cm x 100cm',name:'Arch'};
 const cartPart={id:randomUUID(),component_product_id:cart,option_name:'Internal Shelf',option_value:'Yes',name:'Shelf'};
 await db.query('insert into wc_shop_templates(id,product_id,parts,estimates) values($1,$2,$3,$4),($5,$6,$7,$8)',[backdropTemplate,backdrop,[backdropPart],{CNC:10,['CNC:'+backdropPart.id]:4,'CNC+option:size=190cm x 100cm':99},cartTemplate,cart,[cartPart],{CNC:10,'CNC+option:internal shelf=yes':7}]);
 await db.exec('create trigger wc_shop_unit_product_parts before insert or update of template_id,parts on wc_shop_units for each row execute function wc_shop_unit_product_parts()');
 await db.query('insert into wc_shop_units(unit_id,template_id,parts,estimates) values($1,$2,$3,$4),($5,$6,$7,$8)',[backdropUnit,backdropTemplate,[backdropPart],{CNC:10},cartUnit,cartTemplate,[cartPart],{CNC:10}]);
 const rows=(await db.query('select unit_id,parts,estimates from wc_shop_units')).rows;
 assert.equal(rows.find(row=>row.unit_id===backdropUnit).estimates.CNC,14,'Backdrop keeps Shared + part Extra CNC');
 assert.equal(rows.find(row=>row.unit_id===cartUnit).estimates.CNC,17,'Cart adds the selected option CNC');
 assert.equal(rows.find(row=>row.unit_id===backdropUnit).parts.length,1,'Hub size selects the Backdrop part');
 assert.equal((await db.query("select relrowsecurity from pg_class where oid='wc_order_items'::regclass")).rows[0].relrowsecurity,true);
 console.log('Cart-only additive CNC, legacy Backdrop CNC, historical order size, and RLS verified.');
}finally{await db.close();}
