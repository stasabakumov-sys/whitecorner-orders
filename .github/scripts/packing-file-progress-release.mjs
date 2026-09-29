import {readFile} from 'node:fs/promises';
const version='20260930000100',name='packing_file_progress';
const source=(await readFile(`supabase/migrations/${version}_${name}.sql`,'utf8')).replaceAll('\r','');
const quote=value=>"'"+value.replaceAll("'","''")+"'";
const token=process.env.SUPABASE_ACCESS_TOKEN;
if(!token)throw Error('Supabase access token required');
async function query(sql,read_only){
 const response=await fetch('https://api.supabase.com/v1/projects/zgvnrpspwluapaxnycrg/database/query',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query:sql,read_only})});
 if(!response.ok)throw Error(`Packing progress migration failed: HTTP ${response.status}: ${(await response.text()).slice(0,1500)}`);
 return response.json();
}
await query(`begin;select pg_advisory_xact_lock(20260923,6);do $release$ begin
 if not exists(select 1 from supabase_migrations.schema_migrations where version='20260929131500') then raise exception 'Packing reload prerequisite missing';end if;
 if exists(select 1 from supabase_migrations.schema_migrations where version='${version}') then
  if (select replace(statements[1],E'\\r','') from supabase_migrations.schema_migrations where version='${version}') is distinct from ${quote(source)} then raise exception 'Registered migration differs';end if;
 else execute ${quote(source)};insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','${name}',array[${quote(source)}]);end if;
 end $release$;commit;`,false);
const [result]=await query(`select
 exists(select 1 from supabase_migrations.schema_migrations where version='${version}') registered,
 exists(select 1 from information_schema.columns where table_schema='public' and table_name='wc_packing_tasks' and column_name='cut_file_ids') progress_column,
 to_regprocedure('public.wc_set_packing_file_done(uuid,uuid,boolean)') is not null progress_rpc,
 has_function_privilege('authenticated','public.wc_set_packing_file_done(uuid,uuid,boolean)','execute') authenticated_access,
 not has_function_privilege('anon','public.wc_set_packing_file_done(uuid,uuid,boolean)','execute') anon_denied,
 (select relrowsecurity from pg_class where oid='public.wc_packing_tasks'::regclass) tasks_rls;`,true);
if(!result||Object.values(result).some(value=>value!==true))throw Error('Packing progress postflight failed');
console.log('Packing file progress migration verified. Existing task progress starts empty.');
