import {pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const {PGlite}=await import(pathToFileURL(path.resolve(process.argv[2])).href);
const db=new PGlite();
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
  create schema supabase_migrations;
  create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);
  insert into supabase_migrations.schema_migrations values('20260913000200','backdrop_paint_operations',array['baseline']);
  create table public.wc_shop_intervals(id uuid primary key,stage text not null,operation text not null,started_at timestamptz not null,ended_at timestamptz);
  create function public.wc_shop_command(p_id uuid,p_action text,p jsonb) returns jsonb language plpgsql as $$
   begin update public.wc_shop_intervals set ended_at=now() where id=(p->>'id')::uuid;return '{"ok":true}'::jsonb;end $$;
  grant execute on function public.wc_shop_command(uuid,text,jsonb) to authenticated;`);
 const release=execFileSync(process.execPath,['.github/scripts/contacts-paint-release.mjs','--print-sql'],{encoding:'utf8'});
 await db.exec(release);await db.exec(release);
 const registered=await db.query("select version from supabase_migrations.schema_migrations where version in ('20260923000300','20260923000400')");
 assert.equal(registered.rows.length,2);
 const first=randomUUID(),paused=randomUUID();
 await db.query("insert into public.wc_shop_intervals(id,stage,operation,started_at) values($1,'Painting','First primer',now()),($2,'Painting','First primer',now())",[first,paused]);
 await assert.rejects(db.query("select public.wc_shop_command($1,'finish-operation',jsonb_build_object('id',$2::text))",[randomUUID(),first]),/Enter paint used/);
 assert.equal((await db.query('select ended_at from public.wc_shop_intervals where id=$1',[first])).rows[0].ended_at,null);
 await db.query("select public.wc_shop_command($1,'finish-operation',jsonb_build_object('id',$2::text,'paintVolumeMl',12.5))",[randomUUID(),first]);
 assert.equal(Number((await db.query('select paint_volume_ml from public.wc_shop_intervals where id=$1',[first])).rows[0].paint_volume_ml),12.5);
 await db.query("select public.wc_shop_command($1,'pause',jsonb_build_object('id',$2::text))",[randomUUID(),paused]);
 assert.equal((await db.query('select paint_volume_ml from public.wc_shop_intervals where id=$1',[paused])).rows[0].paint_volume_ml,null);
 await db.query("select public.wc_replace_wix_contacts('site',2,'[{\"id\":\"one\"},{\"id\":\"two\"}]'::jsonb)");
 await assert.rejects(db.query("select public.wc_replace_wix_contacts('site',2,'[{\"id\":\"one\"}]'::jsonb)"),/Incomplete/);
 assert.equal((await db.query('select count(*)::int n from public.wc_wix_contacts')).rows[0].n,2);
 console.log('Contacts and paint migrations: exact replay, required paint, pause, and snapshot rollback passed.');
}catch(error){console.error(error.message,error.where||'');process.exitCode=1;}finally{await db.close();}
