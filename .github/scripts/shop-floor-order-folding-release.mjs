// Apply only the reviewed CNC template matching migration, with a read-only preflight.
import {readFile} from 'node:fs/promises';

const version='20260923000200',name='shop_floor_order_folding';
const source=(await readFile(`supabase/migrations/${version}_${name}.sql`,'utf8')).replaceAll('\r','');
const literal="'"+source.replaceAll("'","''")+"'";
const verify=`select
 exists(select 1 from supabase_migrations.schema_migrations where version='20260917000200') shared_painting_registered,
 exists(select 1 from supabase_migrations.schema_migrations where version='${version}') registered,
 to_regprocedure('public.wc_shop_item_folding(public.wc_order_items)') is not null item_folding,
 coalesce((select strpos(p.prosrc,'wc_shop_item_folding(item)')>0 from pg_proc p where p.oid=to_regprocedure('public.wc_shop_auto_snapshot(uuid)')),false) auto_snapshot_wired,
 coalesce((select strpos(p.prosrc,'wc_shop_item_folding(item)')>0 from pg_proc p where p.oid=to_regprocedure('public.wc_shop_check_template_variant()')),false) template_guard_wired;`;
const sql=`begin;select pg_advisory_xact_lock(${version});do $release$ begin
 if not exists(select 1 from supabase_migrations.schema_migrations where version='20260917000200') then raise exception 'Shared Painting prerequisite missing';end if;
 if exists(select 1 from supabase_migrations.schema_migrations where version='${version}') then
  if (select replace(statements[1],E'\\r','') from supabase_migrations.schema_migrations where version='${version}') is distinct from replace(${literal},E'\\r','') then raise exception 'Migration differs';end if;
 else execute ${literal};insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','${name}',array[${literal}]);end if;
end $release$;commit;${verify}`;
if(process.argv.includes('--print-sql')){process.stdout.write(sql);process.exit(0);}
const token=process.env.SUPABASE_ACCESS_TOKEN;if(!token)throw Error('Supabase access token required');
async function query(query,read_only){const response=await fetch('https://api.supabase.com/v1/projects/zgvnrpspwluapaxnycrg/database/query',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query,read_only})});if(!response.ok)throw Error(`Production query failed: HTTP ${response.status}: ${(await response.text()).slice(0,500)}`);return response.json();}
const before=(await query(verify,true))[0];console.log('Preflight:',JSON.stringify(before));
if(!before?.shared_painting_registered)throw Error('Production prerequisite missing');
if(process.argv.includes('--apply')){await query(sql,false);const after=(await query(verify,true))[0];if(!after?.registered||!after?.item_folding||!after?.auto_snapshot_wired||!after?.template_guard_wired)throw Error('Postflight failed');console.log('Verified:',JSON.stringify(after));}
