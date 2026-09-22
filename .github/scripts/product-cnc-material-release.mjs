// Targeted, repeatable production migration. Never runs db push.
import {readFile} from 'node:fs/promises';

const version='20260922000200',name='product_cnc_sheet_material';
const source=(await readFile(`supabase/migrations/${version}_${name}.sql`,'utf8')).replaceAll('\r','');
const literal="'"+source.replaceAll("'","''")+"'";
const verify=`select
 exists(select 1 from supabase_migrations.schema_migrations where version='${version}') registered,
 exists(select 1 from information_schema.columns where table_schema='public' and table_name='wc_product_cnc_sheets' and column_name='material_id') material_column,
 to_regprocedure('public.wc_save_product_cnc_sheet(uuid,uuid,integer,text,jsonb,text,uuid,uuid)') is not null save_rpc,
 to_regprocedure('public.wc_save_product_cnc_sheet(uuid,uuid,integer,text,jsonb,text,uuid)') is null old_rpc_removed,
 exists(select 1 from pg_constraint where conrelid='public.wc_product_cnc_sheets'::regclass and contype='f' and confrelid='public.wc_materials'::regclass) material_fk,
 coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.wc_product_cnc_sheets')),false) rls_enabled;`;
const sql=`begin;select pg_advisory_xact_lock(${version});do $release$ begin
 if to_regclass('public.wc_product_cnc_sheets') is null or to_regclass('public.wc_materials') is null then raise exception 'CNC sheets and materials required';end if;
 if not exists(select 1 from supabase_migrations.schema_migrations where version='20260922000100') then raise exception 'Original CNC migration not registered';end if;
 if exists(select 1 from supabase_migrations.schema_migrations where version='${version}') then
  if (select replace(statements[1],E'\\r','') from supabase_migrations.schema_migrations where version='${version}') is distinct from replace(${literal},E'\\r','') then raise exception 'CNC material migration differs from registered version';end if;
 else execute ${literal};insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','${name}',array[${literal}]);end if;
end $release$;commit;`;

if(process.argv.includes('--print-sql')){process.stdout.write(sql);process.exit(0);}
const token=process.env.SUPABASE_ACCESS_TOKEN;if(!token)throw Error('Supabase access token required');
async function query(statement,read_only){const response=await fetch('https://api.supabase.com/v1/projects/zgvnrpspwluapaxnycrg/database/query',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query:statement,read_only})});if(!response.ok)throw Error(`Production query failed: HTTP ${response.status}: ${(await response.text()).slice(0,500)}`);return response.json();}
const before=(await query("select to_regclass('public.wc_product_cnc_sheets') is not null sheets_ready,to_regclass('public.wc_materials') is not null materials_ready,exists(select 1 from supabase_migrations.schema_migrations where version='20260922000100') original_registered;",true))[0];
console.log('Preflight:',JSON.stringify(before));if(!before?.sheets_ready||!before?.materials_ready||!before?.original_registered)throw Error('Production prerequisites missing');
if(process.argv.includes('--verify')){console.log('Read-only CNC material state:',JSON.stringify((await query(verify,true))[0]));process.exit(0);}
if(process.argv.includes('--apply')){await query(sql,false);const after=(await query(verify,true))[0];if(!after?.registered||!after?.material_column||!after?.save_rpc||!after?.old_rpc_removed||!after?.material_fk||!after?.rls_enabled)throw Error(`CNC material migration postflight failed: ${JSON.stringify(after)}`);console.log('Verified:',JSON.stringify(after));}
