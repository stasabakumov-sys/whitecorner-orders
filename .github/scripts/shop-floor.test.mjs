// Isolated PostgreSQL-compatible engine; no production credentials or integrations.
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const {PGlite}=await import(pathToFileURL(path.resolve(process.argv[2])).href);
const db=new PGlite();
try {
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
 grant usage on schema auth to authenticated,anon;
 create table wc_production_units(id uuid primary key,production_status text not null default 'New');`);
 const actor=randomUUID(),unit=randomUUID(),legacy=randomUUID();
 await db.query('insert into auth.users values($1)',[actor]);
 await db.query("insert into wc_production_units values($1,'New'),($2,'Assembly')",[unit,legacy]);
 await db.exec(await readFile('supabase/migrations/20260912000100_shop_floor_tracker.sql','utf8'));
 const command=async(action,p={},id=randomUUID())=>(await db.query('select wc_shop_command($1,$2,$3) result',[id,action,p])).rows[0].result;
 await assert.rejects(command('shift-start'),/Sign in/);
 await db.query("select set_config('test.actor',$1,false)",[actor]);
 await db.exec('set role anon');await assert.rejects(command('shift-start'),/permission denied/);await db.exec('reset role');
 await assert.rejects(db.query("update wc_production_units set production_status='CNC' where id=$1",[unit]),/parts/);
 await assert.rejects(db.query("update wc_production_units set production_status='Assembly' where id=$1",[unit]),/parts/);
 await db.query("update wc_production_units set production_status='Sanding' where id=$1",[legacy]);
 await db.exec('set role authenticated');
 await assert.rejects(db.exec("insert into wc_shop_templates(name,parts) values('bypass','[]')"),/permission denied/);
 const parts=[{id:'top',name:'Top'},{id:'sides',name:'Sides'}];
 await assert.rejects(command('template',{name:'Empty',parts:[]}),/parts/);
 const t=await command('template',{name:'Fixture',parts,estimates:{}});
 await command('assign',{unitId:unit,templateId:t.id,finish:'painted'});
 await db.exec('reset role');await db.query("update wc_production_units set production_status='CNC' where id=$1",[unit]);await db.exec('set role authenticated');
 const day='2026-09-10T';let tick=0;const at=()=>day+`08:${String(tick++).padStart(2,'0')}:00Z`;
 const startId=randomUUID(),startTime=at();await command('shift-start',{at:startTime},startId);await command('shift-start',{at:startTime},startId);
 await assert.rejects(command('pause',{at:at(),expectedActiveStart:null}),/another device/);
 assert.equal((await db.query('select count(*)::int n from wc_shop_shifts')).rows[0].n,1);
 await command('start',{unitId:unit,stage:'CNC',operation:'CNC',at:at()});
 await command('pause',{at:at()});
 await command('start',{stage:'Other',operation:'Design',at:at()});
 assert.equal((await db.query("select count(*)::int n from wc_shop_intervals where ended_at is null")).rows[0].n,1);
 assert.equal((await db.query("select unit_id from wc_shop_intervals where stage='Pause' limit 1")).rows[0].unit_id,null);
 await command('start',{unitId:unit,stage:'CNC',operation:'CNC',at:at()});
 await command('finish-stage',{at:at()});
 await db.exec('reset role');await db.query("update wc_production_units set production_status='Assembly' where id=$1",[unit]);await db.exec('set role authenticated');
 for(const partId of ['top','sides']){await command('start',{unitId:unit,stage:'Assembly',partId,at:at()});await command('finish-operation',{at:at()});}
 assert.ok((await db.query('select completed from wc_shop_units where unit_id=$1',[unit])).rows[0].completed.includes('Assembly:finished'));
 await db.exec('reset role');await db.query("update wc_production_units set production_status='Sanding' where id=$1",[unit]);await db.exec('set role authenticated');
 for(const partId of ['top','sides']){await command('start',{unitId:unit,stage:'Sanding',partId,at:at()});await command('finish-operation',{at:at()});}
 await db.exec('reset role');await db.query("update wc_production_units set production_status='Painting' where id=$1",[unit]);await db.exec('set role authenticated');
 await assert.rejects(command('start',{unitId:unit,stage:'Painting',operation:'Second primer',at:at()}),/previous/);
 await command('start',{unitId:unit,stage:'Painting',operation:'Repaint',at:at()});await command('finish-operation',{at:at()});
 await assert.rejects(command('finish-painting',{unitId:unit}),/five/);
 for(const operation of ['First primer','First sanding','Second primer','Second sanding','Finish coat']){await command('start',{unitId:unit,stage:'Painting',operation,at:at()});await command('finish-operation',{at:at()});}
 await command('finish-painting',{unitId:unit,at:at()});
 await command('start',{stage:'Other',operation:'Rest',at:at()});await command('shift-end',{at:at()});
 assert.equal((await db.query('select count(*)::int n from wc_shop_intervals where ended_at is null')).rows[0].n,0);
 await command('shift-start',{at:'2026-09-11T08:00:00Z'});
 await command('start',{stage:'Other',operation:'Cleaning',at:'2026-09-11T08:01:00Z'});
 const shift=(await db.query('select * from wc_shop_shifts where ended_at is null')).rows[0];
 await command('edit-shift',{id:shift.id,start:shift.started_at,end:'2026-09-11T17:00:00Z'});
 assert.equal((await db.query('select count(*)::int n from wc_shop_intervals where ended_at is null')).rows[0].n,0);
 assert.equal((await db.query('select count(*)::int n from wc_shop_audit')).rows[0].n,1);
 const raw=randomUUID();await db.exec('reset role');await db.query("insert into wc_production_units values($1,'Sanding')",[raw]);await db.exec('set role authenticated');
 await command('assign',{unitId:raw,templateId:t.id,finish:'raw'});
 await db.exec('reset role');await db.query("update wc_shop_units set completed=array['Sanding:finished'] where unit_id=$1",[raw]);
 await assert.rejects(db.query("update wc_production_units set production_status='Painting' where id=$1",[raw]),/RAW/);
 await db.query("update wc_production_units set production_status='Packing' where id=$1",[raw]);await db.exec('set role authenticated');
 await db.query("select set_config('test.actor',$1,false)",[randomUUID()]);
 assert.equal((await db.query('select count(*)::int n from wc_shop_intervals')).rows[0].n,0);
 console.log('Shop Floor: SQL/RLS, idempotency, parts gate, global pause, single task, part completion, paint ordering, optional repaint, shift correction passed.');
}catch(error){console.error(error.message,error.where||'',error.position||'');process.exitCode=1;}finally{await db.close();}
if(!process.exitCode){
 const release=new PGlite();
 try{
  await release.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select null::uuid$$;
   create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);
   create table wc_production_units(id uuid primary key,production_status text check(production_status in ('New','CNC','Assembly','Sanding','Painting','Packing','Ready')));`);
  const sql=execFileSync(process.execPath,['.github/scripts/apply-shop-floor.mjs','--print-sql'],{encoding:'utf8'});
  await release.exec(sql);await release.exec(sql);
  assert.equal((await release.query('select count(*)::int n from supabase_migrations.schema_migrations')).rows[0].n,1);
  console.log('Production wrapper: first application, schema/RLS verification and exact replay passed.');
 }catch(error){console.error(error.message);process.exitCode=1;}finally{await release.close();}
}
