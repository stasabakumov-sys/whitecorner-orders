// Apply only the reviewed Constructor migration, using the existing management boundary.
import {readFile} from 'node:fs/promises';

const mode=process.argv[2];
if(!['--verify','--apply'].includes(mode))throw Error('Use --verify or --apply');
const token=process.env.SUPABASE_ACCESS_TOKEN;
if(!token)throw Error('Supabase access token required');
const version='20261003000400',name='cart_constructor_files';
const source=(await readFile(`supabase/migrations/${version}_${name}.sql`,'utf8')).replaceAll('\r','');
const quote=value=>"'"+value.replaceAll("'","''")+"'";
async function query(sql,read_only=true){
 const response=await fetch('https://api.supabase.com/v1/projects/zgvnrpspwluapaxnycrg/database/query',{
  method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query:sql,read_only}),
 });
 if(!response.ok)throw Error(`Production database query failed (HTTP ${response.status})`);
 return response.json();
}
const [before]=await query(`select
 exists(select 1 from supabase_migrations.schema_migrations where version='20261003000300') cart_prerequisite,
 to_regprocedure('public.wc_is_active_hub_member()') is not null membership_prerequisite,
 to_regprocedure('public.wc_save_cart_base_rd_file_for_package(uuid,uuid,text,text,integer,integer,uuid)') is not null save_prerequisite,
 (select relrowsecurity from pg_class where oid='public.wc_box_rd_files'::regclass) rd_rls,
 exists(select 1 from storage.buckets where id='box-drawings' and not public and file_size_limit=20971520) private_drawing_bucket,
 exists(select 1 from storage.buckets where id='box-rd-files' and not public) private_rd_bucket,
 (select count(*)::int from public.wc_box_rd_files) rd_count,
 (select count(*)::int from public.wc_packing_tasks) task_count,
 (select count(*)::int from public.wc_cart_base_box_drawings) cdr_count,
 (select count(*)::int from public.wc_shipping_packages) package_count;`);
const counters=['rd_count','task_count','cdr_count','package_count'];
if(!before||Object.entries(before).some(([key,value])=>!counters.includes(key)&&value!==true))throw Error('Cart Constructor prerequisites differ; release stopped');
const [registered]=await query(`select replace(statements[1],E'\\r','')=${quote(source)} source_matches
 from supabase_migrations.schema_migrations where version='${version}'`);
if(registered&&!registered.source_matches)throw Error(`Registered migration ${version} differs from reviewed source`);
console.log(JSON.stringify({preflight:'passed',migrationRegistered:!!registered,...Object.fromEntries(counters.map(key=>[key,before[key]]))}));
if(mode==='--verify')process.exit(0);

await query(`begin;set local lock_timeout='15s';set local statement_timeout='120s';
 select pg_advisory_xact_lock(20260923,6);
 do $release$ begin
  if exists(select 1 from supabase_migrations.schema_migrations where version='${version}') then
   if (select replace(statements[1],E'\\r','') from supabase_migrations.schema_migrations where version='${version}') is distinct from ${quote(source)}
    then raise exception 'Migration ${version} differs'; end if;
  else
   execute ${quote(source)};
   insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','${name}',array[${quote(source)}]);
  end if;
 end $release$;commit;`,false);
const [after]=await query(`select
 exists(select 1 from supabase_migrations.schema_migrations where version='${version}') migration_registered,
 (select relrowsecurity from pg_class where oid='public.wc_cart_box_svg_drawings'::regclass) svg_rls,
 (select relrowsecurity from pg_class where oid='public.wc_cart_constructor_saves'::regclass) receipt_rls,
 not has_table_privilege('anon','public.wc_cart_box_svg_drawings','select') anon_svg_denied,
 not has_table_privilege('authenticated','public.wc_cart_box_svg_drawings','insert,update,delete') direct_svg_write_denied,
 not has_table_privilege('authenticated','public.wc_cart_constructor_saves','select,insert,update,delete') receipt_access_denied,
 has_function_privilege('authenticated','public.wc_save_cart_constructor_files(uuid,uuid,jsonb,jsonb,jsonb,jsonb)','execute') save_rpc_available,
 not has_function_privilege('anon','public.wc_save_cart_constructor_files(uuid,uuid,jsonb,jsonb,jsonb,jsonb)','execute') anon_save_denied,
 exists(select 1 from storage.buckets where id='box-drawings' and not public and (allowed_mime_types is null or 'image/svg+xml'=any(allowed_mime_types))) private_svg_bucket,
 exists(select 1 from pg_policies where schemaname='public' and tablename='wc_cart_box_svg_drawings' and policyname='cart_svg_read') svg_read_policy,
 exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='cart_svg_cleanup_guard' and permissive='RESTRICTIVE') svg_cleanup_guard,
 (select count(*)::int from public.wc_box_rd_files) rd_count,
 (select count(*)::int from public.wc_packing_tasks) task_count,
 (select count(*)::int from public.wc_cart_base_box_drawings) cdr_count,
 (select count(*)::int from public.wc_shipping_packages) package_count;`);
if(!after||Object.entries(after).some(([key,value])=>counters.includes(key)?value!==before[key]:value!==true))throw Error('Cart Constructor postflight failed');
console.log(JSON.stringify({release:'verified',...Object.fromEntries(counters.map(key=>[key,after[key]]))}));
