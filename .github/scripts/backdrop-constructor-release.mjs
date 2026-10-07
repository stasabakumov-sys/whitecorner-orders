import {readFile} from 'node:fs/promises';
const mode=process.argv[2];
if(!['--verify','--apply'].includes(mode))throw Error('Use --verify or --apply');
const version='20261007000400',name='backdrop_constructor_files';
const source=(await readFile(`supabase/migrations/${version}_${name}.sql`,'utf8')).replaceAll('\r','');
const quote=value=>"'"+value.replaceAll("'","''")+"'";
const token=process.env.SUPABASE_ACCESS_TOKEN;
if(!token)throw Error('Supabase access token required');
async function query(sql,read_only=true){
 const response=await fetch('https://api.supabase.com/v1/projects/zgvnrpspwluapaxnycrg/database/query',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query:sql,read_only})});
 if(!response.ok)throw Error(`Backdrop Constructor release query failed: HTTP ${response.status}`);
 return response.json();
}
const [before]=await query(`select
 to_regprocedure('public.wc_is_hub_manager()') is not null manager_gate,
 to_regprocedure('public.wc_is_active_hub_member()') is not null member_gate,
 to_regprocedure('public.wc_save_backdrop_rd_file(uuid,text,text,text,integer,integer,uuid)') is not null rd_save,
 to_regprocedure('public.wc_delete_box_rd_file(uuid,uuid)') is not null rd_delete,
 to_regprocedure('public.wc_send_box_cutting_task(jsonb)') is not null box_dispatch,
 (select relrowsecurity from pg_class where oid='public.wc_backdrop_packaging_dimensions'::regclass) dimensions_rls,
 (select relrowsecurity from pg_class where oid='public.wc_box_rd_files'::regclass) rd_rls,
 exists(select 1 from storage.buckets where id='box-drawings' and not public and (allowed_mime_types is null or 'image/svg+xml'=any(allowed_mime_types))) private_svg_bucket,
 exists(select 1 from storage.buckets where id='box-rd-files' and not public) private_rd_bucket;`);
if(!before||Object.values(before).some(value=>value!==true))throw Error('Backdrop Constructor prerequisites differ');
const [registration]=await query(`select replace(statements[1],E'\\r','')=${quote(source)} source_matches from supabase_migrations.schema_migrations where version='${version}'`);
if(registration&&!registration.source_matches)throw Error('Registered migration differs');
console.log(JSON.stringify({preflight:'passed',registered:!!registration}));
if(mode==='--verify'&&!registration)process.exit(0);
if(mode==='--apply')await query(`begin;set local lock_timeout='15s';set local statement_timeout='120s';select pg_advisory_xact_lock(20260923,6);
 do $release$ begin
 if exists(select 1 from supabase_migrations.schema_migrations where version='${version}') then
  if (select replace(statements[1],E'\\r','') from supabase_migrations.schema_migrations where version='${version}') is distinct from ${quote(source)} then raise exception 'Registered migration differs';end if;
 else execute ${quote(source)};insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','${name}',array[${quote(source)}]);end if;
 end $release$;commit;`,false);
const [after]=await query(`select
 exists(select 1 from supabase_migrations.schema_migrations where version='${version}') registered,
 (select relrowsecurity from pg_class where oid='public.wc_backdrop_box_svg_drawings'::regclass) svg_rls,
 (select relrowsecurity from pg_class where oid='public.wc_backdrop_constructor_saves'::regclass) receipt_rls,
 not has_table_privilege('authenticated','public.wc_backdrop_box_svg_drawings','insert,update,delete') direct_svg_write_denied,
 not has_table_privilege('anon','public.wc_backdrop_box_svg_drawings','select') anon_svg_denied,
 not has_table_privilege('authenticated','public.wc_backdrop_constructor_saves','select,insert,update,delete') receipt_access_denied,
 (select p.prosecdef and p.prosrc like '%Manager access required%' and not has_function_privilege('anon',p.oid,'execute') and has_function_privilege('authenticated',p.oid,'execute') from pg_proc p where p.oid='public.wc_save_backdrop_constructor_files(uuid,text,jsonb,jsonb,jsonb,jsonb)'::regprocedure) constructor_rpc,
 (select p.prosecdef and p.prosrc like '%Manager access required%' and p.prosrc like '%Remove the existing RD files%' from pg_proc p where p.oid='public.wc_save_backdrop_packaging_dimensions(text,text,numeric,numeric,numeric,uuid)'::regprocedure) dimensions_guard,
 exists(select 1 from pg_policies where schemaname='public' and tablename='wc_backdrop_box_svg_drawings' and policyname='backdrop_svg_read' and qual like '%wc_is_active_hub_member%') svg_read_policy,
 exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='backdrop_svg_cleanup_guard' and permissive='RESTRICTIVE') svg_cleanup_guard;`);
if(!after||Object.values(after).some(value=>value!==true))throw Error('Backdrop Constructor postflight failed');
console.log(JSON.stringify({release:'verified',...after}));
