// Targeted transactional production release; never runs db push or reads customer payloads.
import {readFile} from 'node:fs/promises';

const version='20260916000300',name='backdrop_shared_costs';
const source=(await readFile(`supabase/migrations/${version}_${name}.sql`,'utf8')).replaceAll('\r','');
const literal="'"+source.replaceAll("'","''")+"'";
const verify=`select
 exists(select 1 from supabase_migrations.schema_migrations where version='${version}') registered,
 to_regprocedure('public.wc_shop_save_product_template(uuid,uuid,text,jsonb,jsonb,integer)') is not null base_template_save,
 to_regprocedure('public.wc_shop_auto_snapshot(uuid)') is not null auto_snapshot,
 to_regprocedure('public.wc_shop_save_backdrop_template(uuid,uuid,text,jsonb,jsonb,integer,text)') is not null shared_template_save,
 to_regprocedure('public.wc_save_shared_backdrop_material_profile(uuid,text,jsonb,boolean,timestamp with time zone)') is not null shared_material_save,
 to_regprocedure('public.wc_save_backdrop_paint_profile(uuid,jsonb,jsonb,boolean,integer)') is not null shared_paint_save,
 exists(select 1 from information_schema.columns where table_schema='public' and table_name='wc_shipping_products' and column_name='backdrop_paint_profile') paint_profile_column,
 to_regclass('public.wc_shop_template_backdrop_shared_unique') is not null shared_template_index,
 coalesce((select strpos(p.prosrc,'p.backdrop_paint_profile')>0 and strpos(p.prosrc,'t.size_key is null')>0 from pg_proc p where p.oid=to_regprocedure('public.wc_shop_auto_snapshot(uuid)')),false) snapshot_wired;`;
const sql=`begin;select pg_advisory_xact_lock(${version});do $release$ begin
 if to_regprocedure('public.wc_shop_save_product_template(uuid,uuid,text,jsonb,jsonb,integer)') is null then raise exception 'Base template save function missing';end if;
 if to_regprocedure('public.wc_shop_auto_snapshot(uuid)') is null then raise exception 'Automatic CNC snapshot missing';end if;
 if to_regclass('public.wc_material_profiles') is null or to_regclass('public.wc_shipping_products') is null then raise exception 'Costing schema missing';end if;
 if exists(select 1 from supabase_migrations.schema_migrations where version='${version}') then
  if (select replace(statements[1],E'\\r','') from supabase_migrations.schema_migrations where version='${version}') is distinct from replace(${literal},E'\\r','') then raise exception 'Migration differs';end if;
 else execute ${literal};insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','${name}',array[${literal}]);end if;
 if to_regprocedure('public.wc_shop_save_backdrop_template(uuid,uuid,text,jsonb,jsonb,integer,text)') is null then raise exception 'Shared Backdrop template save unavailable';end if;
end $release$;commit;${verify}`;

if(process.argv.includes('--print-sql')){process.stdout.write(sql);process.exit(0);}
const token=process.env.SUPABASE_ACCESS_TOKEN;if(!token)throw Error('Supabase access token required');
async function query(query,read_only){const response=await fetch('https://api.supabase.com/v1/projects/zgvnrpspwluapaxnycrg/database/query',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query,read_only})});if(!response.ok)throw Error(`Production query failed: HTTP ${response.status}: ${(await response.text()).slice(0,500)}`);return response.json();}
const before=(await query(verify,true))[0];console.log('Preflight:',JSON.stringify(before));
if(!before?.base_template_save||!before?.auto_snapshot)throw Error('Production prerequisites missing');
if(process.argv.includes('--apply')){await query(sql,false);const rows=await query(verify,true);const after=rows[0];if(!after?.registered||!after?.shared_template_save||!after?.shared_material_save||!after?.shared_paint_save||!after?.paint_profile_column||!after?.shared_template_index||!after?.snapshot_wired)throw Error('Postflight failed');console.log('Verified:',JSON.stringify(rows));}
