// Apply exactly one reviewed migration after the existing Packing release.
import {readFile} from 'node:fs/promises';

const project='zgvnrpspwluapaxnycrg';
const version='20260925000100';
const name='shared_packing_work';
const source=(await readFile(`supabase/migrations/${version}_${name}.sql`,'utf8')).replaceAll('\r','');
const quote=value=>"'"+value.replaceAll("'","''")+"'";
const token=process.env.SUPABASE_ACCESS_TOKEN;
if(!token)throw Error('Supabase access token required');
const api=`https://api.supabase.com/v1/projects/${project}`;
async function sql(query,read_only=true){
 const response=await fetch(api+'/database/query',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query,read_only})});
 if(!response.ok)throw Error(`Production database returned HTTP ${response.status}: ${(await response.text()).slice(0,300)}`);
 return response.json();
}
const state=async()=> (await sql(`select
 exists(select 1 from supabase_migrations.schema_migrations where version='20260923000500') rd_registered,
 exists(select 1 from supabase_migrations.schema_migrations where version='20260923000600') packing_registered,
 exists(select 1 from supabase_migrations.schema_migrations where version='20260923000800') delivery_filter_registered,
 exists(select 1 from supabase_migrations.schema_migrations where version='${version}') shared_registered,
 to_regclass('public.wc_packing_tasks') is not null tasks_table,
 to_regprocedure('public.wc_send_packing_task(uuid,text)') is not null send_rpc,
 to_regprocedure('public.wc_assign_packing_task(uuid,text,uuid)') is not null assign_rpc,
 exists(select 1 from information_schema.columns where table_schema='public' and table_name='wc_packing_tasks' and column_name='packages' and is_nullable='NO') packages_snapshot,
 exists(select 1 from information_schema.columns where table_schema='public' and table_name='wc_packing_tasks' and column_name='assigned_to' and is_nullable='YES') shared_assignee,
 coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.wc_packing_tasks')),false) tasks_rls;`))[0];
const before=await state();
console.log('Packing preflight:',JSON.stringify(before));
if(!before?.rd_registered||!before.packing_registered||!before.delivery_filter_registered||!before.tasks_table||!before.tasks_rls)throw Error('Existing Packing schema is not ready');
if(process.argv.includes('--verify'))process.exit(0);
if(!process.argv.includes('--apply'))throw Error('Use --verify or --apply');
const body=quote(source);
await sql(`begin;select pg_advisory_xact_lock(20260925,1);do $release$ begin
 if exists(select 1 from supabase_migrations.schema_migrations where version='${version}') then
  if (select replace(statements[1],E'\\r','') from supabase_migrations.schema_migrations where version='${version}') is distinct from ${body} then raise exception 'Migration ${version} differs from registered version';end if;
 else
  execute ${body};
  insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','${name}',array[${body}]);
 end if;
end $release$;commit;`,false);
const after=await state();
if(!after?.shared_registered||!after.send_rpc||after.assign_rpc||!after.packages_snapshot||!after.shared_assignee||!after.tasks_rls)throw Error(`Packing postflight failed: ${JSON.stringify(after)}`);
console.log('Shared Packing migration verified:',JSON.stringify(after));
