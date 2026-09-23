// Apply only the reviewed contacts cache and paint usage migrations.
import {readFile} from 'node:fs/promises';

const migrations=[
 ['20260923000300','wix_contacts_cache'],
 ['20260923000400','shop_floor_paint_volume'],
];
const sources=await Promise.all(migrations.map(async([version,name])=>({
 version,name,source:(await readFile(`supabase/migrations/${version}_${name}.sql`,'utf8')).replaceAll('\r',''),
})));
const literal=value=>"'"+value.replaceAll("'","''")+"'";
const preflight=`select
 to_regclass('public.wc_shop_intervals') is not null shop_intervals_ready,
 to_regprocedure('public.wc_shop_command(uuid,text,jsonb)') is not null shop_command_ready,
 exists(select 1 from supabase_migrations.schema_migrations where version='20260913000200') paint_route_registered,
 (select count(*) from public.wc_shop_intervals where stage='Painting') painting_intervals;`;
const verify=`select
 exists(select 1 from supabase_migrations.schema_migrations where version='20260923000300') contacts_registered,
 exists(select 1 from supabase_migrations.schema_migrations where version='20260923000400') paint_registered,
 to_regclass('public.wc_wix_contacts') is not null contacts_table,
 coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.wc_wix_contacts')),false) contacts_rls,
 coalesce(has_table_privilege('authenticated',to_regclass('public.wc_wix_contacts'),'SELECT'),false) contacts_authenticated_read,
 to_regprocedure('public.wc_replace_wix_contacts(text,integer,jsonb)') is not null contacts_replace_rpc,
 exists(select 1 from information_schema.columns where table_schema='public' and table_name='wc_shop_intervals' and column_name='paint_volume_ml') paint_column,
 to_regprocedure('public.wc_shop_command_core(uuid,text,jsonb)') is not null paint_command_core,
 coalesce(has_function_privilege('authenticated',to_regprocedure('public.wc_shop_command(uuid,text,jsonb)'),'EXECUTE'),false) paint_command_authenticated,
 coalesce(has_function_privilege('authenticated',to_regprocedure('public.wc_shop_command_core(uuid,text,jsonb)'),'EXECUTE'),false) paint_core_exposed,
 exists(select 1 from pg_trigger where tgrelid=to_regclass('public.wc_shop_intervals') and tgname='wc_shop_record_paint_volume' and not tgisinternal) paint_trigger;`;
const blocks=sources.map(({version,name,source})=>{
 const value=literal(source);
 return `if exists(select 1 from supabase_migrations.schema_migrations where version='${version}') then
  if (select replace(statements[1],E'\\r','') from supabase_migrations.schema_migrations where version='${version}') is distinct from ${value} then raise exception 'Migration ${version} differs from registered version';end if;
 else execute ${value};insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','${name}',array[${value}]);end if;`;
}).join('\n');
const applySql=`begin;select pg_advisory_xact_lock(20260923,4);do $release$ begin
 if to_regclass('public.wc_shop_intervals') is null or to_regprocedure('public.wc_shop_command(uuid,text,jsonb)') is null then raise exception 'Shop Floor prerequisite missing';end if;
 if not exists(select 1 from supabase_migrations.schema_migrations where version='20260913000200') then raise exception 'Painting route prerequisite missing';end if;
 ${blocks}
end $release$;commit;`;

if(process.argv.includes('--print-sql')){process.stdout.write(applySql);process.exit(0);}
const token=process.env.SUPABASE_ACCESS_TOKEN;if(!token)throw Error('Supabase access token required');
async function query(statement,read_only){
 const response=await fetch('https://api.supabase.com/v1/projects/zgvnrpspwluapaxnycrg/database/query',{
  method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query:statement,read_only}),
 });
 if(!response.ok)throw Error(`Production query failed: HTTP ${response.status}: ${(await response.text()).slice(0,500)}`);
 return response.json();
}
const before=(await query(preflight,true))[0];console.log('Preflight:',JSON.stringify(before));
if(!before?.shop_intervals_ready||!before?.shop_command_ready||!before?.paint_route_registered)throw Error('Production prerequisites missing');
if(process.argv.includes('--verify')){console.log('Current state:',JSON.stringify((await query(verify,true))[0]));process.exit(0);}
if(!process.argv.includes('--apply'))throw Error('Use --verify or --apply');
await query(applySql,false);
const after=(await query(verify,true))[0];
if(!after?.contacts_registered||!after?.paint_registered||!after?.contacts_table||!after?.contacts_rls||!after?.contacts_authenticated_read||!after?.contacts_replace_rpc||!after?.paint_column||!after?.paint_command_core||!after?.paint_command_authenticated||after?.paint_core_exposed||!after?.paint_trigger)throw Error(`Postflight failed: ${JSON.stringify(after)}`);
console.log('Verified:',JSON.stringify(after));
