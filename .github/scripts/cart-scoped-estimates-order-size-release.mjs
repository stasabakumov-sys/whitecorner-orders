import {readFile} from 'node:fs/promises';

const mode=process.argv[2];
if(!['--verify','--apply'].includes(mode))throw Error('Use --verify or --apply');
const token=process.env.SUPABASE_ACCESS_TOKEN;
if(!token)throw Error('Supabase access token required');
const version='20261006000800',name='cart_scoped_estimates_order_size';
const source=(await readFile(`supabase/migrations/${version}_${name}.sql`,'utf8')).replaceAll('\r','');
const quote=value=>"'"+value.replaceAll("'","''")+"'";
async function query(sql,read_only=true){
 const response=await fetch('https://api.supabase.com/v1/projects/zgvnrpspwluapaxnycrg/database/query',{
  method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
  body:JSON.stringify({query:sql,read_only}),
 });
 if(!response.ok)throw Error(`Production database query failed (HTTP ${response.status})`);
 return response.json();
}
const [before]=await query(`select
 exists(select 1 from supabase_migrations.schema_migrations where version='20261006000700') preceding_migration_present,
 to_regprocedure('public.wc_shop_unit_product_parts()') is not null snapshot_route_available,
 to_regprocedure('public.wc_is_hub_manager()') is not null manager_check_available,
 (select relrowsecurity from pg_class where oid='public.wc_order_items'::regclass) item_rls,
 (select relrowsecurity from pg_class where oid='public.wc_shop_units'::regclass) unit_rls,
 (select count(*)::int from public.wc_order_items) item_count,
 (select count(*)::int from public.wc_shop_templates) template_count,
 (select count(*)::int from public.wc_shop_units) unit_count;`);
if(!before||['preceding_migration_present','snapshot_route_available','manager_check_available','item_rls','unit_rls'].some(key=>before[key]!==true))
 throw Error('Cart scope and order size prerequisites differ; release stopped');
const [registered]=await query(`select replace(statements[1],E'\\r','')=${quote(source)} source_matches from supabase_migrations.schema_migrations where version='${version}'`);
if(registered&&!registered.source_matches)throw Error(`Registered migration ${version} differs from reviewed source`);
console.log(JSON.stringify({preflight:'passed',migrationRegistered:!!registered,items:before.item_count,templates:before.template_count,units:before.unit_count}));
if(mode==='--verify')process.exit(0);

await query(`begin;set local lock_timeout='15s';set local statement_timeout='120s';
 select pg_advisory_xact_lock(20261006,8);
 do $release$ begin
  if exists(select 1 from supabase_migrations.schema_migrations where version='${version}') then
   if (select replace(statements[1],E'\\r','') from supabase_migrations.schema_migrations where version='${version}') is distinct from ${quote(source)}
    then raise exception 'Migration ${version} differs';end if;
  else
   execute ${quote(source)};
   insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','${name}',array[${quote(source)}]);
  end if;
 end $release$;commit;`,false);
const [after]=await query(`select
 exists(select 1 from supabase_migrations.schema_migrations where version='${version}') migration_registered,
 to_regprocedure('public.wc_shop_effective_options(public.wc_order_items)') is not null effective_options_available,
 to_regprocedure('public.wc_set_order_item_size(uuid,text)') is not null order_size_available,
 position('is_cart' in pg_get_functiondef('public.wc_shop_unit_product_parts()'::regprocedure))>0 cart_scope_active,
 position('wc_shop_effective_options' in pg_get_functiondef('public.wc_shop_auto_snapshot(uuid)'::regprocedure))>0 auto_size_active,
 has_function_privilege('authenticated','public.wc_set_order_item_size(uuid,text)','EXECUTE') manager_rpc_available,
 not has_function_privilege('anon','public.wc_set_order_item_size(uuid,text)','EXECUTE') anon_rpc_denied,
 (select relrowsecurity from pg_class where oid='public.wc_order_items'::regclass) item_rls,
 (select relrowsecurity from pg_class where oid='public.wc_shop_units'::regclass) unit_rls,
 (select count(*)::int from public.wc_order_items) item_count,
 (select count(*)::int from public.wc_shop_templates) template_count,
 (select count(*)::int from public.wc_shop_units) unit_count;`);
if(!after||['migration_registered','effective_options_available','order_size_available','cart_scope_active','auto_size_active','manager_rpc_available','anon_rpc_denied','item_rls','unit_rls'].some(key=>after[key]!==true)
 ||after.item_count!==before.item_count||after.template_count!==before.template_count||after.unit_count!==before.unit_count)throw Error('Cart scope and order size postflight failed');
console.log(JSON.stringify({release:'verified',itemsPreserved:after.item_count,templatesPreserved:after.template_count,unitsPreserved:after.unit_count}));
