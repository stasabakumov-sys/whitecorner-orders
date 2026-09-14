// Isolated PostgreSQL-compatible engine; no production credentials or customer data.
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const {PGlite}=await import(pathToFileURL(path.resolve(process.argv[2])).href);
const migration=await readFile('supabase/migrations/20260914000400_shop_floor_skip_zero_sanding.sql','utf8');
async function schema(db){await db.exec(`create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql as $$select null::uuid$$;
 create table wc_production_units(id uuid primary key,production_status text not null check(production_status in ('New','CNC','Assembly','Sanding','Painting','Packing','Ready')));
 create table wc_shop_units(unit_id uuid primary key references wc_production_units(id),template_id uuid,parts jsonb not null,estimates jsonb not null,finish text not null,completed text[] not null default '{}');
 create function wc_shop_status_guard() returns trigger language plpgsql as $$begin return new;end$$;
 create trigger wc_shop_status_guard before update of production_status on wc_production_units for each row execute function wc_shop_status_guard();`);}
const db=new PGlite();
try{
 await schema(db);await db.exec(migration);
 const rawZero=randomUUID(),paintedZero=randomUUID(),rawUnknown=randomUUID();
 await db.query("insert into wc_production_units values($1,'Assembly'),($2,'Assembly'),($3,'Assembly')",[rawZero,paintedZero,rawUnknown]);
 const parts=[{id:'body',name:'Body'}];
 await db.query("insert into wc_shop_units(unit_id,parts,estimates,finish,completed) values($1,$4,$5,'raw',array['Assembly:finished']),($2,$4,$5,'painted',array['Assembly:finished']),($3,$4,'{}','raw',array['Assembly:finished'])",[rawZero,paintedZero,rawUnknown,parts,{'Sanding:body':0}]);
 await assert.rejects(db.query("update wc_production_units set production_status='Sanding' where id=$1",[rawZero]),/next production stage/);
 await db.query("update wc_production_units set production_status='Packing' where id=$1",[rawZero]);
 await db.query("update wc_production_units set production_status='Painting' where id=$1",[paintedZero]);
 await assert.rejects(db.query("update wc_production_units set production_status='Packing' where id=$1",[rawUnknown]),/next production stage/);
 await db.query("update wc_production_units set production_status='Sanding' where id=$1",[rawUnknown]);
 console.log('Shop Floor zero Sanding: RAW, painted and blank-estimate routes passed.');
}catch(error){console.error(error.message,error.where||'');process.exitCode=1;}finally{await db.close();}
if(!process.exitCode){
 const release=new PGlite();
 try{
  await schema(release);await release.exec(`create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);
   insert into supabase_migrations.schema_migrations values('20260912000100','shop_floor_tracker',array['baseline']),('20260914000300','shop_floor_auto_assignment',array['automatic']);`);
  const sql=execFileSync(process.execPath,['.github/scripts/shop-floor-zero-sanding-release.mjs','--print-sql'],{encoding:'utf8'});
  await release.exec(sql);await release.exec(sql);
  assert.equal((await release.query("select count(*)::int n from supabase_migrations.schema_migrations where version='20260914000400'")).rows[0].n,1);
  console.log('Shop Floor zero-Sanding wrapper: first application and exact replay passed.');
 }catch(error){console.error(error.message,error.where||'');process.exitCode=1;}finally{await release.close();}
}
