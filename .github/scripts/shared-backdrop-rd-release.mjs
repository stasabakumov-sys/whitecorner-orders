import {readFile} from 'node:fs/promises';

const mode=process.argv[2];
if(!['--verify','--apply'].includes(mode))throw Error('Use --verify or --apply');
const token=process.env.SUPABASE_ACCESS_TOKEN;
if(!token)throw Error('Supabase access token required');
const version='20261002000100',name='shared_backdrop_rd';
const source=(await readFile(`supabase/migrations/${version}_${name}.sql`,'utf8')).replaceAll('\r','');
const quote=value=>"'"+value.replaceAll("'","''")+"'";
async function query(sql,read_only=true){
 const response=await fetch('https://api.supabase.com/v1/projects/zgvnrpspwluapaxnycrg/database/query',{
  method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
  body:JSON.stringify({query:sql,read_only}),
 });
 if(!response.ok)throw Error(`Production database query failed (HTTP ${response.status}): ${(await response.text()).slice(0,400)}`);
 return response.json();
}
const [before]=await query(`select
 exists(select 1 from supabase_migrations.schema_migrations where version='20260930000200') replacement_prerequisite,
 exists(select 1 from supabase_migrations.schema_migrations where version='20261001000200') custom_dispatch_prerequisite,
 (select relrowsecurity from pg_class where oid='public.wc_box_rd_files'::regclass) rd_rls,
 (select count(*)::int from public.wc_box_rd_files) rd_count,
 (select count(*)::int from public.wc_packing_tasks) task_count;`);
if(!before?.replacement_prerequisite||!before.custom_dispatch_prerequisite||!before.rd_rls)
 throw Error('Packing prerequisites differ; shared Backdrop RD migration stopped');
const [registered]=await query(`select replace(statements[1],E'\\r','')=${quote(source)} source_matches
 from supabase_migrations.schema_migrations where version='${version}'`);
if(registered&&!registered.source_matches)throw Error(`Registered migration ${version} differs from reviewed source`);
console.log(JSON.stringify({preflight:'passed',migrationRegistered:!!registered,rdCount:before.rd_count,taskCount:before.task_count}));
if(mode==='--verify')process.exit(0);

await query(`begin;set local lock_timeout='15s';set local statement_timeout='120s';
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
 exists(select 1 from supabase_migrations.schema_migrations where version='${version}') migration_registered,
 (select relrowsecurity from pg_class where oid='public.wc_box_rd_files'::regclass) rd_rls,
 has_function_privilege('authenticated','public.wc_save_backdrop_rd_file(uuid,text,text,text,integer,integer,uuid)','execute') save_available,
 not has_function_privilege('anon','public.wc_save_backdrop_rd_file(uuid,text,text,text,integer,integer,uuid)','execute') anon_save_denied,
 (select count(*)::int from public.wc_box_rd_files) rd_count,
 (select count(*)::int from public.wc_packing_tasks) task_count;`);
if(!after||Object.entries(after).some(([key,value])=>!['rd_count','task_count'].includes(key)&&value!==true)
 ||after.rd_count!==before.rd_count||after.task_count!==before.task_count)
 throw Error('Shared Backdrop RD postflight failed');
console.log(JSON.stringify({release:'verified',rdRowsPreserved:after.rd_count,tasksPreserved:after.task_count}));
