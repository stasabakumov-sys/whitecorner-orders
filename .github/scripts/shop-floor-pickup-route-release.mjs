// Targeted transactional production release; never runs db push or reads customer payloads.
import {readFile} from 'node:fs/promises';
const version='20260923000100',name='pickup_skip_packing';
const source=(await readFile(`supabase/migrations/${version}_${name}.sql`,'utf8')).replaceAll('\r','');
const literal="'"+source.replaceAll("'","''")+"'";
const verify=`select
 exists(select 1 from supabase_migrations.schema_migrations where version='20260914000400') route_registered,
 exists(select 1 from supabase_migrations.schema_migrations where version='${version}') registered,
 coalesce((select pg_get_functiondef(p.oid) like '%pickup_order%' from pg_proc p where p.oid=to_regprocedure('public.wc_shop_status_guard()')),false) pickup_guard,
 (select count(*)::int from wc_production_units u join wc_order_items i on i.id=u.order_item_id join wc_orders o on o.id=i.order_id where u.production_status='Packing' and concat_ws(' ',o.delivery_type,o.delivery_title) ~* 'pick[ -]?up') pickup_in_packing;`;
const sql=`begin;select pg_advisory_xact_lock(${version});do $release$ begin
 if not exists(select 1 from supabase_migrations.schema_migrations where version='20260914000400') then raise exception 'Shop Floor route prerequisite missing';end if;
 if to_regprocedure('public.wc_shop_status_guard()') is null then raise exception 'Shop Floor production guard missing';end if;
 if exists(select 1 from supabase_migrations.schema_migrations where version='${version}') then
  if (select replace(statements[1],E'\\r','') from supabase_migrations.schema_migrations where version='${version}') is distinct from replace(${literal},E'\\r','') then raise exception 'Migration differs';end if;
 else execute ${literal};insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','${name}',array[${literal}]);end if;
 if not coalesce((select pg_get_functiondef(p.oid) like '%pickup_order%' from pg_proc p where p.oid=to_regprocedure('public.wc_shop_status_guard()')),false) then raise exception 'Pickup route guard unavailable';end if;
end $release$;commit;${verify}`;
if(process.argv.includes('--print-sql')){process.stdout.write(sql);process.exit(0);}
const token=process.env.SUPABASE_ACCESS_TOKEN;if(!token)throw Error('Supabase access token required');
async function query(query,read_only){const response=await fetch('https://api.supabase.com/v1/projects/zgvnrpspwluapaxnycrg/database/query',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query,read_only})});if(!response.ok)throw Error(`Production query failed: HTTP ${response.status}: ${(await response.text()).slice(0,500)}`);return response.json();}
const before=(await query(verify,true))[0];console.log('Preflight:',JSON.stringify(before));
if(!before?.route_registered)throw Error('Production prerequisites missing');
if(process.argv.includes('--apply')){await query(sql,false);const rows=await query(verify,true);if(!rows[0]?.registered||!rows[0]?.pickup_guard||rows[0]?.pickup_in_packing!==0)throw Error('Postflight failed');console.log('Verified:',JSON.stringify(rows));}
