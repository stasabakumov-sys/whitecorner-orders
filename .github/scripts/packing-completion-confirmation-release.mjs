import {readFile} from 'node:fs/promises';
const version='20260930000300',name='packing_completion_confirmation';
const source=(await readFile(`supabase/migrations/${version}_${name}.sql`,'utf8')).replaceAll('\r','');
const quote=value=>"'"+value.replaceAll("'","''")+"'";
const token=process.env.SUPABASE_ACCESS_TOKEN;
if(!token)throw Error('Supabase access token required');
async function query(sql,read_only){
 const response=await fetch('https://api.supabase.com/v1/projects/zgvnrpspwluapaxnycrg/database/query',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query:sql,read_only})});
 if(!response.ok)throw Error(`Packing completion confirmation migration failed: HTTP ${response.status}`);
 return response.json();
}
await query(`begin;set local lock_timeout='15s';select pg_advisory_xact_lock(20260923,6);do $release$ begin
 if not exists(select 1 from supabase_migrations.schema_migrations where version='20260930000100') then raise exception 'Packing file progress prerequisite missing';end if;
 if not exists(select 1 from supabase_migrations.schema_migrations where version='20260929000100') then raise exception 'Hub access hardening prerequisite missing';end if;
 if exists(select 1 from supabase_migrations.schema_migrations where version='${version}') then
  if (select replace(statements[1],E'\\r','') from supabase_migrations.schema_migrations where version='${version}') is distinct from ${quote(source)} then raise exception 'Registered migration differs';end if;
 else execute ${quote(source)};insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','${name}',array[${quote(source)}]);end if;
 end $release$;commit;`,false);
const [result]=await query(`select
 exists(select 1 from supabase_migrations.schema_migrations where version='${version}') registered,
 position('set cut_file_ids=next_ids,revision=' in pg_get_functiondef('public.wc_set_packing_file_done(uuid,uuid,boolean)'::regprocedure))>0 progress_only,
 position('Mark every RD file done' in pg_get_functiondef('public.wc_complete_packing_task(uuid)'::regprocedure))>0 completion_guard,
 has_function_privilege('authenticated','public.wc_set_packing_file_done(uuid,uuid,boolean)','execute') progress_rpc_access,
 has_function_privilege('authenticated','public.wc_complete_packing_task(uuid)','execute') completion_rpc_access,
 not has_function_privilege('anon','public.wc_set_packing_file_done(uuid,uuid,boolean)','execute') anonymous_progress_denied,
 not has_function_privilege('anon','public.wc_complete_packing_task(uuid)','execute') anonymous_completion_denied,
 (select relrowsecurity from pg_class where oid='public.wc_packing_tasks'::regclass) tasks_rls,
 (select relrowsecurity from pg_class where oid='public.wc_box_rd_files'::regclass) files_rls;`,true);
if(!result||Object.values(result).some(value=>value!==true))throw Error('Packing completion confirmation postflight failed');
console.log('Packing completion confirmation migration registered and verified. Checking all files now retains the open task until explicit confirmation.');

const [station]=await query("select count(*)::int active_transfers from public.wc_packing_transfers where state in ('queued','claimed')",true);
console.log(JSON.stringify({stationUpdateCheck:station}));
