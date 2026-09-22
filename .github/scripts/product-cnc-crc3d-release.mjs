// Targeted, repeatable CRC3D release. Never runs db push.
import {readFile} from 'node:fs/promises';

const version='20260922000300',name='product_cnc_crc3d_file';
const source=(await readFile(`supabase/migrations/${version}_${name}.sql`,'utf8')).replaceAll('\r','');
const literal="'"+source.replaceAll("'","''")+"'";
const signature='public.wc_attach_product_cnc_file(uuid,text,text,integer,uuid)';
const verify=`select
 exists(select 1 from supabase_migrations.schema_migrations where version='${version}') registered,
 to_regprocedure('${signature}') is not null attach_rpc,
 coalesce(position('.crc3d' in pg_get_functiondef(to_regprocedure('${signature}')))>0,false) crc3d_validator,
 coalesce(has_function_privilege('authenticated',to_regprocedure('${signature}'),'EXECUTE'),false) authenticated_execute,
 coalesce((select not public from storage.buckets where id='cnc-files'),false) private_bucket;`;
const sql=`begin;select pg_advisory_xact_lock(${version});do $release$ begin
 if to_regclass('public.wc_product_cnc_sheets') is null or to_regprocedure('${signature}') is null then raise exception 'CNC sheets and file function required';end if;
 if not exists(select 1 from supabase_migrations.schema_migrations where version='20260922000200') then raise exception 'CNC material migration not registered';end if;
 if exists(select 1 from supabase_migrations.schema_migrations where version='${version}') then
  if (select replace(statements[1],E'\\r','') from supabase_migrations.schema_migrations where version='${version}') is distinct from replace(${literal},E'\\r','') then raise exception 'CRC3D migration differs from registered version';end if;
 else execute ${literal};insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','${name}',array[${literal}]);end if;
end $release$;commit;`;

if(process.argv.includes('--print-sql')){process.stdout.write(sql);process.exit(0);}
const token=process.env.SUPABASE_ACCESS_TOKEN;if(!token)throw Error('Supabase access token required');
async function query(statement,read_only){const response=await fetch('https://api.supabase.com/v1/projects/zgvnrpspwluapaxnycrg/database/query',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query:statement,read_only})});if(!response.ok)throw Error(`Production query failed: HTTP ${response.status}: ${(await response.text()).slice(0,500)}`);return response.json();}
const before=(await query("select to_regclass('public.wc_product_cnc_sheets') is not null sheets_ready,exists(select 1 from supabase_migrations.schema_migrations where version='20260922000200') materials_ready;",true))[0];
console.log('Preflight:',JSON.stringify(before));if(!before?.sheets_ready||!before?.materials_ready)throw Error('Production prerequisites missing');
if(process.argv.includes('--verify')){console.log('Read-only CRC3D state:',JSON.stringify((await query(verify,true))[0]));process.exit(0);}
if(process.argv.includes('--apply')){await query(sql,false);const after=(await query(verify,true))[0];if(!after?.registered||!after?.attach_rpc||!after?.crc3d_validator||!after?.authenticated_execute||!after?.private_bucket)throw Error(`CRC3D migration postflight failed: ${JSON.stringify(after)}`);console.log('Verified:',JSON.stringify(after));}
