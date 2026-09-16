// Targeted transactional production release; never runs db push or reads customer payloads.
import {readFile} from 'node:fs/promises';
const version='20260916000100',name='backdrop_default_raw_finish';
const source=(await readFile(`supabase/migrations/${version}_${name}.sql`,'utf8')).replaceAll('\r','');
const literal="'"+source.replaceAll("'","''")+"'";
const verify=`select
 exists(select 1 from supabase_migrations.schema_migrations where version='20260915000200') cart_size_profiles_registered,
 exists(select 1 from supabase_migrations.schema_migrations where version='${version}') registered,
 to_regprocedure('public.wc_shop_auto_snapshot(uuid)') is not null auto_snapshot,
 to_regprocedure('public.wc_shop_order_finish(jsonb,text)') is not null finish_with_default,
 coalesce((select strpos(p.prosrc,'wc_shop_order_finish(item_options,case when product_name~*''backdrop'' then ''raw'' end)')>0 from pg_proc p where p.oid=to_regprocedure('public.wc_shop_auto_snapshot(uuid)')),false) raw_default_wired;`;
const sql=`begin;select pg_advisory_xact_lock(${version});do $release$ begin
 if not exists(select 1 from supabase_migrations.schema_migrations where version='20260915000200') then raise exception 'Cart size profile prerequisite missing';end if;
 if to_regprocedure('public.wc_shop_auto_snapshot(uuid)') is null then raise exception 'Automatic CNC snapshot missing';end if;
 if exists(select 1 from supabase_migrations.schema_migrations where version='${version}') then
  if (select replace(statements[1],E'\\r','') from supabase_migrations.schema_migrations where version='${version}') is distinct from replace(${literal},E'\\r','') then raise exception 'Migration differs';end if;
 else execute ${literal};insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','${name}',array[${literal}]);end if;
 if to_regprocedure('public.wc_shop_order_finish(jsonb,text)') is null then raise exception 'Backdrop finish resolver unavailable';end if;
end $release$;commit;${verify}`;
if(process.argv.includes('--print-sql')){process.stdout.write(sql);process.exit(0);}
const token=process.env.SUPABASE_ACCESS_TOKEN;if(!token)throw Error('Supabase access token required');
async function query(query,read_only){const response=await fetch('https://api.supabase.com/v1/projects/zgvnrpspwluapaxnycrg/database/query',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query,read_only})});if(!response.ok)throw Error(`Production query failed: HTTP ${response.status}: ${(await response.text()).slice(0,500)}`);return response.json();}
const before=(await query(verify,true))[0];console.log('Preflight:',JSON.stringify(before));
if(!before?.cart_size_profiles_registered||!before?.auto_snapshot)throw Error('Production prerequisites missing');
if(process.argv.includes('--apply')){await query(sql,false);const rows=await query(verify,true);if(!rows[0]?.registered||!rows[0]?.finish_with_default||!rows[0]?.raw_default_wired)throw Error('Postflight failed');console.log('Verified:',JSON.stringify(rows));}
