import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
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
 console.log('Catalogue migration, RLS and bucket isolation verified.');
}finally{await db.close();}
