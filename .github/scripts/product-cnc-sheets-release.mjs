// Targeted, repeatable CNC migration release. Never runs db push.
import {readFile} from 'node:fs/promises';

const version='20260922000100',name='product_cnc_sheets';
const source=(await readFile(`supabase/migrations/${version}_${name}.sql`,'utf8')).replaceAll('\r','');
const literal="'"+source.replaceAll("'","''")+"'";
const verify=`select
 exists(select 1 from supabase_migrations.schema_migrations where version='${version}') registered,
 to_regclass('public.wc_product_cnc_sheets') is not null sheets_table,
 to_regprocedure('public.wc_save_product_cnc_sheet(uuid,uuid,integer,text,jsonb,text,uuid)') is not null save_rpc,
 to_regprocedure('public.wc_attach_product_cnc_file(uuid,text,text,integer,uuid)') is not null attach_rpc,
 coalesce((select not public from storage.buckets where id='cnc-files'),false) private_bucket,
 coalesce((select rowsecurity from pg_class where oid=to_regclass('public.wc_product_cnc_sheets')),false) rls_enabled;`;
const sql=`begin;select pg_advisory_xact_lock(${version});do $release$ begin
 if to_regclass('public.wc_shipping_products') is null or to_regclass('public.wc_shop_templates') is null then raise exception 'Product and Assembling schema required';end if;
 if to_regclass('storage.objects') is null or to_regclass('storage.buckets') is null then raise exception 'Private storage schema required';end if;
 if exists(select 1 from supabase_migrations.schema_migrations where version='${version}') then
  if (select replace(statements[1],E'\\r','') from supabase_migrations.schema_migrations where version='${version}') is distinct from replace(${literal},E'\\r','') then raise exception 'CNC migration differs from registered version';end if;
 else execute ${literal};insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','${name}',array[${literal}]);end if;
end $release$;commit;${verify}`;

if(process.argv.includes('--print-sql')){process.stdout.write(sql);process.exit(0);}
const token=process.env.SUPABASE_ACCESS_TOKEN;if(!token)throw Error('Supabase access token required');
async function query(statement,read_only){const response=await fetch('https://api.supabase.com/v1/projects/zgvnrpspwluapaxnycrg/database/query',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query:statement,read_only})});if(!response.ok)throw Error(`Production query failed: HTTP ${response.status}: ${(await response.text()).slice(0,500)}`);return response.json();}
const before=(await query(`select to_regclass('public.wc_shipping_products') is not null products_ready,to_regclass('public.wc_shop_templates') is not null parts_ready,to_regclass('storage.objects') is not null storage_ready;`,true))[0];
console.log('Preflight:',JSON.stringify(before));
if(!before?.products_ready||!before?.parts_ready||!before?.storage_ready)throw Error('Production prerequisites missing');
if(process.argv.includes('--apply')){await query(sql,false);const after=(await query(verify,true))[0];if(!after?.registered||!after?.sheets_table||!after?.save_rpc||!after?.attach_rpc||!after?.private_bucket||!after?.rls_enabled)throw Error('CNC migration postflight failed');console.log('Verified:',JSON.stringify(after));}
