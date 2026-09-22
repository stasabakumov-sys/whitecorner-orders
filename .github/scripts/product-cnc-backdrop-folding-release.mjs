// Targeted, repeatable Backdrop CNC folding migration. Never runs db push.
import {readFile} from 'node:fs/promises';

const version='20260922000500',name='product_cnc_backdrop_folding';
const source=(await readFile(`supabase/migrations/${version}_${name}.sql`,'utf8')).replaceAll('\r','');
const literal="'"+source.replaceAll("'","''")+"'";
const newSignature='public.wc_save_product_cnc_sheet(uuid,uuid,integer,text,jsonb,text,uuid,text,uuid)';
const oldSignature='public.wc_save_product_cnc_sheet(uuid,uuid,integer,text,jsonb,text,uuid,uuid)';
const backdrop="lower(btrim(coalesce(p.product_type,'')))='backdrop' or p.product_name ~* 'backdrop'";
const verify=`select
 exists(select 1 from supabase_migrations.schema_migrations where version='${version}') registered,
 exists(select 1 from information_schema.columns where table_schema='public' and table_name='wc_product_cnc_sheets' and column_name='folding') folding_column,
 to_regprocedure('${newSignature}') is not null save_rpc,
 to_regprocedure('${oldSignature}') is null old_rpc_removed,
 coalesce(has_function_privilege('authenticated',to_regprocedure('${newSignature}'),'EXECUTE'),false) authenticated_execute,
 to_regclass('public.wc_product_cnc_sheets_variant_number') is not null variant_unique_index,
 coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.wc_product_cnc_sheets')),false) rls_enabled,
 (select count(*) from public.wc_product_cnc_sheets s join public.wc_shipping_products p on p.id=s.product_id where ${backdrop} and s.folding is null)=0 unassigned_backdrops;`;
const sql=`begin;select pg_advisory_xact_lock(${version});do $release$ begin
 if to_regclass('public.wc_product_cnc_sheets') is null or to_regprocedure('${oldSignature}') is null and to_regprocedure('${newSignature}') is null then raise exception 'CNC sheets and save function required';end if;
 if not exists(select 1 from supabase_migrations.schema_migrations where version='20260922000400') then raise exception 'CNC CRV3D migration not registered';end if;
 if exists(select 1 from supabase_migrations.schema_migrations where version='${version}') then
  if (select replace(statements[1],E'\\r','') from supabase_migrations.schema_migrations where version='${version}') is distinct from replace(${literal},E'\\r','') then raise exception 'Backdrop CNC migration differs from registered version';end if;
 else execute ${literal};insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','${name}',array[${literal}]);end if;
end $release$;commit;`;

if(process.argv.includes('--print-sql')){process.stdout.write(sql);process.exit(0);}
const token=process.env.SUPABASE_ACCESS_TOKEN;if(!token)throw Error('Supabase access token required');
async function query(statement,read_only){const response=await fetch('https://api.supabase.com/v1/projects/zgvnrpspwluapaxnycrg/database/query',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query:statement,read_only})});if(!response.ok)throw Error(`Production query failed: HTTP ${response.status}: ${(await response.text()).slice(0,500)}`);return response.json();}
const before=(await query(`select to_regclass('public.wc_product_cnc_sheets') is not null sheets_ready,exists(select 1 from supabase_migrations.schema_migrations where version='20260922000400') crv3d_ready,exists(select 1 from supabase_migrations.schema_migrations where version='${version}') already_registered,(select count(*) from public.wc_product_cnc_sheets s join public.wc_shipping_products p on p.id=s.product_id where ${backdrop}) existing_backdrop_sheets;`,true))[0];
console.log('Preflight:',JSON.stringify(before));if(!before?.sheets_ready||!before?.crv3d_ready||(!before?.already_registered&&Number(before.existing_backdrop_sheets)>1))throw Error('Production prerequisites or single-record deletion limit failed');
if(process.argv.includes('--verify')){console.log('Read-only Backdrop CNC state:',JSON.stringify((await query(verify,true))[0]));process.exit(0);}
if(process.argv.includes('--apply')){await query(sql,false);const after=(await query(verify,true))[0];if(!after?.registered||!after?.folding_column||!after?.save_rpc||!after?.old_rpc_removed||!after?.authenticated_execute||!after?.variant_unique_index||!after?.rls_enabled||!after?.unassigned_backdrops)throw Error(`Backdrop CNC migration postflight failed: ${JSON.stringify(after)}`);console.log('Verified:',JSON.stringify(after));}
