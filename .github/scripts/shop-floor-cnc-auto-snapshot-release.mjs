// Targeted transactional production release; never runs db push or reads customer payloads.
import {readFile} from 'node:fs/promises';
const version='20260914000500',name='shop_floor_cnc_auto_snapshot';
const source=(await readFile(`supabase/migrations/${version}_${name}.sql`,'utf8')).replaceAll('\r','');
const literal="'"+source.replaceAll("'","''")+"'";
const verify=`select
 exists(select 1 from supabase_migrations.schema_migrations where version='20260912000100') shop_floor_registered,
 exists(select 1 from supabase_migrations.schema_migrations where version='20260914000300') auto_assignment_registered,
 exists(select 1 from supabase_migrations.schema_migrations where version='20260914000400') zero_sanding_registered,
 exists(select 1 from supabase_migrations.schema_migrations where version='${version}') registered,
 to_regprocedure('public.wc_set_reviewed_production_status(uuid,uuid,text,uuid,text,timestamptz,jsonb,jsonb,timestamptz)') is not null status_rpc,
 to_regprocedure('public.wc_shop_auto_snapshot(uuid)') is not null auto_snapshot,
 coalesce((select pg_get_functiondef(p.oid) like '%wc_shop_auto_snapshot(p_unit_id)%' from pg_proc p where p.oid=to_regprocedure('public.wc_set_reviewed_production_status(uuid,uuid,text,uuid,text,timestamptz,jsonb,jsonb,timestamptz)')),false) rpc_wired;`;
const sql=`begin;select pg_advisory_xact_lock(${version});do $release$ begin
 if not exists(select 1 from supabase_migrations.schema_migrations where version='20260912000100') then raise exception 'Shop Floor prerequisite missing';end if;
 if not exists(select 1 from supabase_migrations.schema_migrations where version='20260914000300') then raise exception 'Shop Floor automatic composition prerequisite missing';end if;
 if not exists(select 1 from supabase_migrations.schema_migrations where version='20260914000400') then raise exception 'Shop Floor zero-Sanding prerequisite missing';end if;
 if to_regprocedure('public.wc_set_reviewed_production_status(uuid,uuid,text,uuid,text,timestamptz,jsonb,jsonb,timestamptz)') is null then raise exception 'Production status RPC missing';end if;
 if exists(select 1 from supabase_migrations.schema_migrations where version='${version}') then
  if (select replace(statements[1],E'\\r','') from supabase_migrations.schema_migrations where version='${version}') is distinct from replace(${literal},E'\\r','') then raise exception 'Migration differs';end if;
 else execute ${literal};insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','${name}',array[${literal}]);end if;
 if to_regprocedure('public.wc_shop_auto_snapshot(uuid)') is null then raise exception 'Automatic CNC snapshot unavailable';end if;
end $release$;commit;${verify}`;
if(process.argv.includes('--print-sql')){process.stdout.write(sql);process.exit(0);}
const token=process.env.SUPABASE_ACCESS_TOKEN;if(!token)throw Error('Supabase access token required');
async function query(query,read_only){const response=await fetch('https://api.supabase.com/v1/projects/zgvnrpspwluapaxnycrg/database/query',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query,read_only})});if(!response.ok)throw Error(`Production query failed: HTTP ${response.status}: ${(await response.text()).slice(0,500)}`);return response.json();}
const before=(await query(verify,true))[0];console.log('Preflight:',JSON.stringify(before));
if(!before?.shop_floor_registered||!before?.auto_assignment_registered||!before?.zero_sanding_registered||!before?.status_rpc)throw Error('Production prerequisites missing');
if(process.argv.includes('--apply')){await query(sql,false);const rows=await query(verify,true);if(!rows[0]?.registered||!rows[0]?.auto_snapshot||!rows[0]?.rpc_wired)throw Error('Postflight failed');console.log('Verified:',JSON.stringify(rows));}
