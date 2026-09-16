import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const {PGlite}=await import(pathToFileURL(path.resolve(process.argv[2])).href);
const db=new PGlite();
try{
 await db.exec(String.raw`
  create role anon;create role authenticated;
  create table wc_shipping_products(id uuid primary key,product_name text,product_type text);
  create table wc_delivery_packaging_profiles(signature text primary key,shipping_product_id uuid references wc_shipping_products(id),template_item jsonb);
  create table wc_box_drawings(profile_signature text references wc_delivery_packaging_profiles(signature),box_index integer,object_path text,filename text,size_bytes integer,updated_at timestamptz default now());
  create table wc_backdrop_box_drawings(size_key text primary key,object_path text not null unique,filename text not null,size_bytes integer not null,revision uuid,updated_at timestamptz default now());
  create function wc_shop_metric_size(value text) returns text language plpgsql immutable as $$
  declare m text[];a numeric;b numeric;begin
   m=regexp_match(lower(btrim(value)),'^(\d+(?:\.\d+)?)\s*(mm|cm|m)?\s*[x×]\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)$');
   if m is null then return null;end if;a=m[1]::numeric*(case coalesce(m[2],m[4]) when 'm' then 1000 when 'cm' then 10 else 1 end);b=m[3]::numeric*(case m[4] when 'm' then 1000 when 'cm' then 10 else 1 end);
   return greatest(a,b)::int::text||'x'||least(a,b)::int::text;end $$;
 `);
 const ids={source:'00000000-0000-4000-8000-000000000001',other:'00000000-0000-4000-8000-000000000002',conflict:'00000000-0000-4000-8000-000000000003'};
 await db.query(`insert into wc_shipping_products values($1,'Ripple Arch Backdrop','Backdrop'),($2,'Display Cart','Cart'),($3,'Half Arch Backdrop','Backdrop')`,[ids.source,ids.other,ids.conflict]);
 const addProfile=(signature,product,size,foldable,colour='White',productName='Backdrop')=>db.query(`insert into wc_delivery_packaging_profiles values($1,$2,jsonb_build_object('product_name',$6::text,'wix_options',jsonb_build_object('Size',$3::text,'Foldable',$4::text,'Colour',$5::text)))`,[signature,product,size,foldable,colour,productName]);
 await addProfile('source',ids.source,'180cm x 90cm','YES');
 await addProfile('same-colourless',ids.source,'900 × 1800 mm','Foldable','Raw');
 await addProfile('other',ids.other,'180cm x 90cm','YES','White','Display Cart');
 await addProfile('conflict-a',ids.conflict,'190cm x 95cm','YES');
 await addProfile('conflict-b',ids.conflict,'950mm x 1900mm','true');
 await db.exec(`
  insert into wc_box_drawings values
   ('source',0,'private/shared-source','backdrop.cdr',100,now()),
   ('same-colourless',0,'private/shared-source','backdrop.cdr',100,now()),
   ('other',0,'private/cart','cart.cdr',100,now()),
   ('conflict-a',0,'private/a','a.cdr',100,now()),
   ('conflict-b',0,'private/b','b.cdr',100,now());
 `);
 const migration=await readFile('supabase/migrations/20260916000200_backdrop_drawing_links.sql','utf8');
 await db.exec(migration);await db.exec(migration);
 assert.deepEqual((await db.query(`select size_key,object_path,filename from wc_backdrop_box_drawings order by size_key`)).rows,[{size_key:'1800x900:foldable',object_path:'private/shared-source',filename:'backdrop.cdr'}]);
 assert.equal((await db.query(`select to_regprocedure('wc_backdrop_profile_drawing_key(jsonb)') is null removed`)).rows[0].removed,true);
 assert.equal((await db.query(`select count(*)::int n from wc_backdrop_box_drawings where size_key='1900x950:foldable'`)).rows[0].n,0);
 console.log('PASS: unambiguous legacy Backdrop file linked once by size and folding; colour/other products ignored; conflicts not guessed');
}finally{await db.close();}
