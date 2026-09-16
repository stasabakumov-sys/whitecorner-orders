// Targeted transactional production release; never runs db push or reads customer payloads.
import {readFile} from 'node:fs/promises';

const version='20260916000400',name='backdrop_paint_option_finish';
const source=(await readFile(`supabase/migrations/${version}_${name}.sql`,'utf8')).replaceAll('\r','');
const literal="'"+source.replaceAll("'","''")+"'";
const verify=`select
 exists(select 1 from supabase_migrations.schema_migrations where version='${version}') registered,
 to_regprocedure('public.wc_shop_order_finish(jsonb,text)') is not null finish_resolver,
 to_regprocedure('public.wc_shop_auto_snapshot(uuid)') is not null auto_snapshot,
 coalesce((select p.prosrc ~ 'paint.{0,40}painting' and p.prosrc ~ 'without paint' from pg_proc p where p.oid=to_regprocedure('public.wc_shop_order_finish(jsonb,text)')),false) paint_option_wired,
 coalesce((select strpos(p.prosrc,'paint_profile->''estimates''')>0 from pg_proc p where p.oid=to_regprocedure('public.wc_shop_auto_snapshot(uuid)')),false) paint_estimates_wired;`;
const sql=`begin;select pg_advisory_xact_lock(${version});do $release$ begin
 if to_regprocedure('public.wc_shop_order_finish(jsonb,text)') is null then raise exception 'Backdrop finish resolver missing';end if;
 if to_regprocedure('public.wc_shop_auto_snapshot(uuid)') is null then raise exception 'Automatic CNC snapshot missing';end if;
 if exists(select 1 from supabase_migrations.schema_migrations where version='${version}') then
  if (select replace(statements[1],E'\\r','') from supabase_migrations.schema_migrations where version='${version}') is distinct from replace(${literal},E'\\r','') then raise exception 'Migration differs';end if;
 else execute ${literal};insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','${name}',array[${literal}]);end if;
 if public.wc_shop_order_finish('{"Paint":"Yes"}'::jsonb,'raw') is distinct from 'painted' or public.wc_shop_order_finish('{"Paint":"No"}'::jsonb,'raw') is distinct from 'raw' then raise exception 'Paint option resolver unavailable';end if;
end $release$;commit;${verify}`;

if(process.argv.includes('--print-sql')){process.stdout.write(sql);process.exit(0);}
const token=process.env.SUPABASE_ACCESS_TOKEN;if(!token)throw Error('Supabase access token required');
async function query(query,read_only){const response=await fetch('https://api.supabase.com/v1/projects/zgvnrpspwluapaxnycrg/database/query',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query,read_only})});if(!response.ok)throw Error(`Production query failed: HTTP ${response.status}: ${(await response.text()).slice(0,500)}`);return response.json();}
const before=(await query(verify,true))[0];console.log('Preflight:',JSON.stringify(before));
if(!before?.finish_resolver||!before?.auto_snapshot||!before?.paint_estimates_wired)throw Error('Production prerequisites missing');
if(process.argv.includes('--apply')){await query(sql,false);const rows=await query(verify,true);const after=rows[0];if(!after?.registered||!after?.finish_resolver||!after?.auto_snapshot||!after?.paint_option_wired||!after?.paint_estimates_wired)throw Error('Postflight failed');console.log('Verified:',JSON.stringify(rows));}
