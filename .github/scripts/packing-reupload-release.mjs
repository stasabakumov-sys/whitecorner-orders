import {readFile} from 'node:fs/promises';
const version='20260929000100',name='packing_reupload';
const source=(await readFile(`supabase/migrations/${version}_${name}.sql`,'utf8')).replaceAll('\r','');
const quote=value=>"'"+value.replaceAll("'","''")+"'";
const token=process.env.SUPABASE_ACCESS_TOKEN;
if(!token)throw Error('Supabase access token required');
async function query(sql,read_only){
 const response=await fetch('https://api.supabase.com/v1/projects/zgvnrpspwluapaxnycrg/database/query',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query:sql,read_only})});
 if(!response.ok)throw Error(`Migration request failed: HTTP ${response.status}: ${(await response.text()).slice(0,1500)}`);
 return response.json();
}
await query(`begin;select pg_advisory_xact_lock(20260923,6);do $release$ begin
 if not exists(select 1 from supabase_migrations.schema_migrations where version='20260925000100') then raise exception 'Shared packing prerequisite missing';end if;
 if exists(select 1 from supabase_migrations.schema_migrations where version='${version}') then
  if (select replace(statements[1],E'\\r','') from supabase_migrations.schema_migrations where version='${version}') is distinct from ${quote(source)} then raise exception 'Registered migration differs';end if;
 else execute ${quote(source)};insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','${name}',array[${quote(source)}]);end if;
 end $release$;commit;`,false);
const [result]=await query(`select exists(select 1 from supabase_migrations.schema_migrations where version='${version}') registered,
 position('Only unfinished packing tasks' in pg_get_functiondef('public.wc_request_packing_transfer(uuid)'::regprocedure))>0 reload_enabled,
 has_function_privilege('authenticated','public.wc_request_packing_transfer(uuid)','execute') authenticated_access,
 not has_function_privilege('anon','public.wc_request_packing_transfer(uuid)','execute') anon_denied;`,true);
if(!result||Object.values(result).some(value=>value!==true))throw Error('Reload migration verification failed');
console.log('Reload migration verified; existing task rows were not changed.');
