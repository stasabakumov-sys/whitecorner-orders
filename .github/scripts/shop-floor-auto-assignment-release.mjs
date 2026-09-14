// Targeted transactional production release; never runs db push or reads customer payloads.
import {readFile} from 'node:fs/promises';
const version='20260914000300',name='shop_floor_auto_assignment';
const source=(await readFile(`supabase/migrations/${version}_${name}.sql`,'utf8')).replaceAll('\r','');
const literal="'"+source.replaceAll("'","''")+"'";
const verify=`select exists(select 1 from supabase_migrations.schema_migrations where version='${version}') registered,
 to_regprocedure('public.wc_shop_resolved_variant_size(jsonb,text)') is not null resolver,
 coalesce((select has_function_privilege('authenticated',p.oid,'EXECUTE') from pg_proc p where p.oid=to_regprocedure('public.wc_shop_resolved_variant_size(jsonb,text)')),false) resolver_public;`;
const sql=`begin;select pg_advisory_xact_lock(${version});do $release$ begin
 if to_regprocedure('public.wc_shop_variant_size(jsonb)') is null then raise exception 'Production template variants prerequisite missing';end if;
 if exists(select 1 from supabase_migrations.schema_migrations where version='${version}') then
  if (select replace(statements[1],E'\\r','') from supabase_migrations.schema_migrations where version='${version}') is distinct from replace(${literal},E'\\r','') then raise exception 'Migration differs';end if;
 else execute ${literal};insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','${name}',array[${literal}]);end if;
 if has_function_privilege('authenticated','public.wc_shop_resolved_variant_size(jsonb,text)','EXECUTE') then raise exception 'Resolver must remain private';end if;
end $release$;commit;${verify}`;
if(process.argv.includes('--print-sql')){process.stdout.write(sql);process.exit(0);}
const token=process.env.SUPABASE_ACCESS_TOKEN;if(!token)throw Error('Supabase access token required');
async function query(query,read_only){const response=await fetch('https://api.supabase.com/v1/projects/zgvnrpspwluapaxnycrg/database/query',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query,read_only})});if(!response.ok)throw Error(`Production query failed: HTTP ${response.status}: ${(await response.text()).slice(0,500)}`);return response.json();}
console.log('Preflight:',JSON.stringify(await query(verify,true)));
if(process.argv.includes('--apply')){await query(sql,false);const rows=await query(verify,true);if(!rows[0]?.registered||!rows[0]?.resolver||rows[0]?.resolver_public)throw Error('Postflight failed');console.log('Verified:',JSON.stringify(rows));}
