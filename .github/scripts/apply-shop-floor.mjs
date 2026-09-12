// Targeted, transactional release. Never runs db push or reads customer payloads.
import {readFile} from 'node:fs/promises';
const version='20260912000100';
const migration=await readFile(`supabase/migrations/${version}_shop_floor_tracker.sql`,'utf8');
const literal="'"+migration.replaceAll("'","''")+"'";
const verify=`select
 exists(select 1 from pg_constraint where conrelid='public.wc_production_units'::regclass and pg_get_constraintdef(oid) like '%Sanding%') sanding,
 exists(select 1 from supabase_migrations.schema_migrations where version='${version}') registered,
 (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('wc_shop_templates','wc_shop_units','wc_shop_shifts','wc_shop_intervals','wc_shop_audit','wc_shop_commands')) tables,
 (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('wc_shop_templates','wc_shop_units','wc_shop_shifts','wc_shop_intervals','wc_shop_audit','wc_shop_commands') and c.relrowsecurity) rls_tables;`;
const query=`begin;
select pg_advisory_xact_lock(${version});
do $release$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.wc_production_units'::regclass and pg_get_constraintdef(oid) like '%Sanding%') then raise exception 'Sanding prerequisite missing';end if;
 if exists(select 1 from supabase_migrations.schema_migrations where version='${version}') then
  if (select statements[1] from supabase_migrations.schema_migrations where version='${version}') is distinct from ${literal} then raise exception 'Registered Shop Floor migration differs';end if;
 else
  execute ${literal};
  insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','shop_floor_tracker',array[${literal}]);
 end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'wc_shop_%' and c.relkind='r' and not c.relrowsecurity) then raise exception 'Shop Floor RLS missing';end if;
 if has_function_privilege('anon','public.wc_shop_command(uuid,text,jsonb)','EXECUTE') then raise exception 'Anonymous shop write access';end if;
 if not has_function_privilege('authenticated','public.wc_shop_command(uuid,text,jsonb)','EXECUTE') then raise exception 'Authenticated shop contract unavailable';end if;
end $release$;
commit;`;
if(process.argv.includes('--print-sql')){process.stdout.write(query);process.exit(0);}
const token=process.env.SUPABASE_ACCESS_TOKEN;
if(!token)throw Error('SUPABASE_ACCESS_TOKEN is required');
async function request(query,read_only){
 const response=await fetch('https://api.supabase.com/v1/projects/zgvnrpspwluapaxnycrg/database/query',{
  method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query,read_only})
 });
 if(!response.ok)throw Error(`Shop Floor ${read_only?'preflight':'migration'} failed (HTTP ${response.status}); deployment stopped.`);
 return response.json();
}
const before=(await request(verify,true))[0];
console.log('Shop Floor preflight:',JSON.stringify(before));
if(!before?.sanding)throw Error('Production Sanding prerequisite missing');
if(!before.registered&&before.tables!==0)throw Error('Unregistered Shop Floor objects exist; manual inspection required');
if(before.registered&&(before.tables!==6||before.rls_tables!==6))throw Error('Registered Shop Floor schema is incomplete');
if(!process.argv.includes('--check')){
 await request(query,false);
 const after=(await request(verify,true))[0];
 if(!after?.registered||after.tables!==6||after.rls_tables!==6)throw Error('Shop Floor post-deployment verification failed');
 console.log('Shop Floor verified:',JSON.stringify(after));
}
