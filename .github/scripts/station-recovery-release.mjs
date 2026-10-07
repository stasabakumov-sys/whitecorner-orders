import {readFile} from 'node:fs/promises';
const mode=process.argv[2];
if(!['--verify','--apply'].includes(mode))throw Error('Use --verify or --apply');
const version='20261007000200',name='packing_station_recovery';
const source=(await readFile(`supabase/migrations/${version}_${name}.sql`,'utf8')).replaceAll('\r','');
const quote=value=>"'"+value.replaceAll("'","''")+"'";
const token=process.env.SUPABASE_ACCESS_TOKEN;
if(!token)throw Error('Supabase access token required');
async function query(sql,read_only=true){
 const response=await fetch('https://api.supabase.com/v1/projects/zgvnrpspwluapaxnycrg/database/query',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query:sql,read_only})});
 if(!response.ok)throw Error(`Station recovery release query failed: HTTP ${response.status}`);
 return response.json();
}
const [before]=await query(`select
 to_regprocedure('public.wc_is_hub_manager()') is not null manager_gate,
 to_regprocedure('public.wc_packing_station_heartbeat(text)') is not null station_heartbeat,
 to_regprocedure('public.wc_claim_packing_transfer(text)') is not null transfer_claim,
 (select relrowsecurity from pg_class where oid='public.wc_packing_tasks'::regclass) tasks_rls,
 (select relrowsecurity from pg_class where oid='public.wc_packing_transfers'::regclass) transfers_rls,
 exists(select 1 from storage.buckets where id='box-rd-files' and not public) private_rd_bucket;`);
if(!before||Object.values(before).some(value=>value!==true))throw Error('Station recovery prerequisites differ');
const [registration]=await query(`select replace(statements[1],E'\\r','')=${quote(source)} source_matches from supabase_migrations.schema_migrations where version='${version}'`);
if(registration&&!registration.source_matches)throw Error('Registered migration differs');
console.log(JSON.stringify({preflight:'passed',registered:!!registration}));
if(mode==='--verify')process.exit(0);
await query(`begin;set local lock_timeout='15s';set local statement_timeout='120s';select pg_advisory_xact_lock(20260923,6);
 do $release$ begin
 if exists(select 1 from supabase_migrations.schema_migrations where version='${version}') then
  if (select replace(statements[1],E'\\r','') from supabase_migrations.schema_migrations where version='${version}') is distinct from ${quote(source)} then raise exception 'Registered migration differs';end if;
 else execute ${quote(source)};insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','${name}',array[${quote(source)}]);end if;
 end $release$;commit;`,false);
const [after]=await query(`select
 exists(select 1 from supabase_migrations.schema_migrations where version='${version}') registered,
 (select relrowsecurity from pg_class where oid='public.wc_packing_station_controls'::regclass) controls_rls,
 not has_table_privilege('authenticated','public.wc_packing_station_controls','update') direct_write_denied,
 not has_table_privilege('anon','public.wc_packing_station_controls','select') anon_read_denied,
 (select count(*)=5 and bool_and(p.prosecdef and p.prosrc like '%Manager access required%' and not has_function_privilege('anon',p.oid,'execute') and has_function_privilege('authenticated',p.oid,'execute'))
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in
 ('wc_packing_station_control_heartbeat','wc_request_packing_station_restart','wc_begin_packing_station_restart','wc_finish_packing_station_restart','wc_packing_station_worker_ready')) manager_rpcs,
 (select relrowsecurity from pg_class where oid='public.wc_packing_tasks'::regclass) tasks_rls,
 (select relrowsecurity from pg_class where oid='public.wc_packing_transfers'::regclass) transfers_rls,
 exists(select 1 from storage.buckets where id='box-rd-files' and not public) private_rd_bucket;`);
if(!after||Object.values(after).some(value=>value!==true))throw Error('Station recovery postflight failed');
console.log(JSON.stringify({release:'verified',...after}));
