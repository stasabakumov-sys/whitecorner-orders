import {readFile} from 'node:fs/promises';

const mode=process.argv[2];
if(!['--verify','--apply'].includes(mode))throw Error('Use --verify or --apply');
const token=process.env.SUPABASE_ACCESS_TOKEN;
if(!token)throw Error('Supabase access token required');
const version='20261001000300',name='custom_packing_cdr_drawings';
const source=(await readFile(`supabase/migrations/${version}_${name}.sql`,'utf8')).replaceAll('\r','');
const quote=value=>"'"+value.replaceAll("'","''")+"'";
async function query(sql,read_only=true){
 const response=await fetch('https://api.supabase.com/v1/projects/zgvnrpspwluapaxnycrg/database/query',{
  method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
  body:JSON.stringify({query:sql,read_only}),
 });
 if(!response.ok)throw Error(`Supabase production query failed (HTTP ${response.status}): ${(await response.text()).slice(0,500)}`);
 return response.json();
}
const [before]=await query(`select
 exists(select 1 from supabase_migrations.schema_migrations where version='20261001000100') jobs_prerequisite,
 exists(select 1 from supabase_migrations.schema_migrations where version='20261001000200') dispatch_prerequisite,
 (select relrowsecurity from pg_class where oid='public.wc_custom_packing_jobs'::regclass) jobs_rls,
 (select relrowsecurity from pg_class where oid='public.wc_custom_packing_rd_files'::regclass) rd_rls,
 (select count(*)::int from public.wc_packing_tasks) task_count,
 (select count(*)::int from public.wc_custom_packing_jobs) job_count;`);
if(!before?.jobs_prerequisite||!before.dispatch_prerequisite||!before.jobs_rls||!before.rd_rls)
 throw Error('Custom Packing prerequisites differ; CDR migration stopped');
const [registered]=await query(`select replace(statements[1],E'\\r','')=${quote(source)} source_matches
 from supabase_migrations.schema_migrations where version='${version}'`);
if(registered&&!registered.source_matches)throw Error(`Registered migration ${version} differs from reviewed source`);
console.log(JSON.stringify({preflight:'passed',migrationRegistered:!!registered,taskCount:before.task_count,jobCount:before.job_count}));
if(mode==='--verify')process.exit(0);

await query(`begin;set local lock_timeout='15s';set local statement_timeout='90s';
 select pg_advisory_xact_lock(20260923,6);
 do $release$ begin
  if exists(select 1 from supabase_migrations.schema_migrations where version='${version}') then
   if (select replace(statements[1],E'\\r','') from supabase_migrations.schema_migrations where version='${version}') is distinct from ${quote(source)}
    then raise exception 'Migration ${version} differs'; end if;
  else
   execute ${quote(source)};
   insert into supabase_migrations.schema_migrations(version,name,statements)
   values('${version}','${name}',array[${quote(source)}]);
  end if;
 end $release$;commit;`,false);
const [after]=await query(`select
 exists(select 1 from supabase_migrations.schema_migrations where version='${version}') drawing_registered,
 (select relrowsecurity from pg_class where oid='public.wc_custom_packing_drawings'::regclass) drawings_rls,
 not has_table_privilege('authenticated','public.wc_custom_packing_drawings','insert') direct_insert_denied,
 not has_table_privilege('anon','public.wc_custom_packing_drawings','select') anon_read_denied,
 not has_function_privilege('anon','public.wc_save_custom_packing_drawing(uuid,text,text,integer)','execute') anon_save_denied,
 has_function_privilege('authenticated','public.wc_save_custom_packing_drawing(uuid,text,text,integer)','execute') manager_rpc_available,
 (select not b.public from storage.buckets b where b.id='custom-packing-drawings') private_bucket,
 (select count(*)::int from pg_policies where schemaname='storage' and tablename='objects'
  and policyname in ('custom_packing_drawings_upload','custom_packing_drawings_download','custom_packing_drawings_cleanup')) storage_policy_count,
 (select count(*)::int from public.wc_packing_tasks) task_count,
 (select count(*)::int from public.wc_custom_packing_jobs) job_count;`);
if(!after||Object.entries(after).some(([key,value])=>!['task_count','job_count','storage_policy_count'].includes(key)&&value!==true)
 ||after.storage_policy_count!==3||after.task_count!==before.task_count||after.job_count!==before.job_count)
 throw Error('CDR drawing postflight failed');
console.log(JSON.stringify({release:'verified',tasksPreserved:after.task_count,jobsPreserved:after.job_count}));
