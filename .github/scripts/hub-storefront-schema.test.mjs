import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {freshnessQuery} from './hub-storefront-freshness.mjs';
const {PGlite}=await import(pathToFileURL(process.argv[2]).href);
const db=new PGlite();
try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
 await db.exec(await readFile('supabase/migrations/20260928000100_storefront_catalog.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/20260928000200_catalog_import_access.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/20260928000300_catalog_media_issues.sql','utf8'));
 await db.exec(`insert into wc_wix_catalog_collections values('private','{"name":"Hidden"}',now());insert into wc_storefront_catalog(id,payload) values('live','{"schemaVersion":1,"products":[],"categories":[]}');set role anon;`);
 assert.equal((await db.query('select * from wc_storefront_catalog')).rows.length,1);
 await assert.rejects(()=>db.query('select * from wc_wix_catalog_collections'));
 await assert.rejects(()=>db.query('select * from wc_catalog_media'));
 await assert.rejects(()=>db.query('select * from wc_catalog_import_access'));
 await assert.rejects(()=>db.query('select * from wc_catalog_media_issues'));
 await assert.rejects(()=>db.query("insert into wc_catalog_import_access values(repeat('a',64),now()+interval '1 hour')"));
 await assert.rejects(()=>db.query('delete from wc_storefront_catalog'));
 await db.exec('reset role;set role authenticated;');
 await assert.rejects(()=>db.query('delete from wc_storefront_catalog'));
 await db.exec('reset role;');
 await assert.rejects(()=>db.query("insert into wc_catalog_import_access values(repeat('a',64),now()+interval '3 hours')"));
 assert.equal((await db.query("select count(*)::int n from pg_class where relname in ('wc_wix_catalog_collections','wc_catalog_media','wc_storefront_catalog') and relrowsecurity")).rows[0].n,3);
 assert.deepEqual((await db.query('select id,public from storage.buckets order by id')).rows,[{id:'catalog-media',public:true},{id:'catalog-source-media',public:false}]);
 // Rehearse the actual read-only audit SQL on synthetic data, never customer records.
 await db.exec(`create table wc_shipping_products(id text primary key,wix_product_id text);
 create table wc_wix_catalog_jobs(site_id text,run_id text,next_offset int,expected_total int,complete boolean,updated_at timestamptz);
 create table wc_wix_catalog_products(site_id text,run_id text,shipping_product_id text,source_product jsonb,synced_at timestamptz);
 insert into wc_wix_catalog_jobs values('site','run',1,1,true,now());
 insert into wc_shipping_products values('hub','wix');`);
 const source={visible:true,manageVariants:true,variants:[{id:'v',variant:{priceData:{price:100,discountedPrice:90,currency:'AUD'}},stock:{inStock:true,trackQuantity:false}}]};
 const payload={schemaVersion:1,categories:[],products:[{id:'hub',price:90,variants:[{id:'v',price:90,inStock:true,trackQuantity:false,quantity:null}]}]};
 const saveSource=async(value)=>{await db.exec('delete from wc_wix_catalog_products');await db.query("insert into wc_wix_catalog_products values('site','run','hub',$1,now())",[JSON.stringify(value)]);};
 await saveSource(source);
 await db.query("update wc_storefront_catalog set payload=$1,published_at=now()-interval '1 hour'",[JSON.stringify(payload)]);
 const audit=async()=>(await db.query(freshnessQuery)).rows[0].audit;
 let report=await audit();
 assert.equal(report.import_complete,true);assert.equal(report.variant_price_or_stock_changes,0);assert.equal(report.snapshots_read_after_publication,1);
 assert.equal(report.visible_not_published,0);assert.equal(report.published_hidden_or_missing,0);
 assert(Object.values(report).every(v=>typeof v==='number'||typeof v==='boolean'||v===null||typeof v==='string'&&Number.isFinite(Date.parse(v))),'only aggregate values and timestamps may leave the database');
 for(const modify of [s=>s.variants[0].variant.priceData.discountedPrice=110,s=>s.variants[0].stock.inStock=false,s=>{s.variants[0].stock.trackQuantity=true;s.variants[0].stock.quantity=2;}]){
  const changed=structuredClone(source);modify(changed);await saveSource(changed);assert.equal((await audit()).variant_price_or_stock_changes,1);
 }
 await saveSource({...source,visible:false});report=await audit();assert.equal(report.published_hidden_or_missing,1);assert.equal(report.published_variants_missing_or_hidden,1);
 const variantChanged=structuredClone(source);variantChanged.variants[0].id='new';await saveSource(variantChanged);report=await audit();assert.equal(report.variants_not_published,1);assert.equal(report.published_variants_missing_or_hidden,1);
 await saveSource({...source,manageVariants:false,priceData:{price:120,currency:'AUD'}});assert.equal((await audit()).simple_product_price_changes,1);
 await db.exec('update wc_wix_catalog_jobs set complete=false');assert.equal((await audit()).import_complete,false);
 console.log('Catalogue migration, RLS and bucket isolation verified.');
}finally{await db.close();}
