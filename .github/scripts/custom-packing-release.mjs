import {readFile} from 'node:fs/promises';

const mode=process.argv[2];
if(!['--verify','--apply'].includes(mode))throw Error('Use --verify or --apply');
const token=process.env.SUPABASE_ACCESS_TOKEN;
if(!token)throw Error('Supabase access token required');
const migrations=[
 ['20261001000100','custom_packing_jobs'],
 ['20261001000200','custom_packing_rd_and_dispatch'],
];
const sources=await Promise.all(migrations.map(async([version,name])=>({
 version,name,source:(await readFile(`supabase/migrations/${version}_${name}.sql`,'utf8')).replaceAll('\r',''),
})));
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
 exists(select 1 from supabase_migrations.schema_migrations where version='20260930000300') completion_prerequisite,
 exists(select 1 from supabase_migrations.schema_migrations where version='20260930000200') replacement_prerequisite,
 exists(select 1 from supabase_migrations.schema_migrations where version='20260929000100') access_prerequisite,
 (select count(*)::int from public.wc_packing_tasks where unit_id is null or profile_signature is null) incompatible_tasks,
 (select count(*)::int from public.wc_packing_tasks) existing_tasks,
 (select relrowsecurity from pg_class where oid='public.wc_packing_tasks'::regclass) tasks_rls,
 (select relrowsecurity from pg_class where oid='public.wc_hub_members'::regclass) members_rls;`);
if(!before?.completion_prerequisite||!before.replacement_prerequisite||!before.access_prerequisite||
 before.incompatible_tasks!==0||!before.tasks_rls||!before.members_rls)throw Error('Custom Packing production prerequisites differ; deployment stopped');
for(const {version,source} of sources){
 const [row]=await query(`select replace(statements[1],E'\\r','')=${quote(source)} source_matches
 from supabase_migrations.schema_migrations where version='${version}'`);
 if(row&&!row.source_matches)throw Error(`Registered migration ${version} differs from reviewed source`);
}
console.log(JSON.stringify({preflight:'passed',existingTasks:before.existing_tasks}));
if(mode==='--verify')process.exit(0);

const apply=sources.map(({version,name,source})=>`
 if exists(select 1 from supabase_migrations.schema_migrations where version='${version}') then
  if (select replace(statements[1],E'\\r','') from supabase_migrations.schema_migrations where version='${version}') is distinct from ${quote(source)} then raise exception 'Migration ${version} differs'; end if;
 else
  execute ${quote(source)};
  insert into supabase_migrations.schema_migrations(version,name,statements)
  values('${version}','${name}',array[${quote(source)}]);
 end if;`).join('\n');
await query(`begin;set local lock_timeout='15s';set local statement_timeout='90s';
 select pg_advisory_xact_lock(20260923,6);
 do $release$ begin ${apply} end $release$;
 commit;`,false);
const [after]=await query(`select
 exists(select 1 from supabase_migrations.schema_migrations where version='20261001000100') jobs_registered,
 exists(select 1 from supabase_migrations.schema_migrations where version='20261001000200') dispatch_registered,
 (select relrowsecurity from pg_class where oid='public.wc_custom_packing_jobs'::regclass) jobs_rls,
 (select relrowsecurity from pg_class where oid='public.wc_custom_packing_rd_files'::regclass) files_rls,
 not has_table_privilege('authenticated','public.wc_custom_packing_jobs','insert') direct_insert_denied,
 not has_table_privilege('authenticated','public.wc_custom_packing_rd_files','insert') direct_file_insert_denied,
 not has_function_privilege('anon','public.wc_send_custom_packing_job(uuid)','execute') anon_send_denied,
 has_function_privilege('authenticated','public.wc_send_custom_packing_job(uuid)','execute') manager_rpc_available,
 (select count(*)::int from public.wc_packing_tasks) task_count;`);
if(!after||Object.entries(after).some(([key,value])=>key!=='task_count'&&value!==true)||after.task_count<before.existing_tasks){
 throw Error('Custom Packing postflight failed');
}
console.log(JSON.stringify({release:'verified',existingTasksPreserved:after.task_count}));
