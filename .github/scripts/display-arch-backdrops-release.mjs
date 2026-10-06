import {readFile} from 'node:fs/promises';

const mode=process.argv[2];
if(!['--verify','--apply'].includes(mode))throw Error('Use --verify or --apply');
const token=process.env.SUPABASE_ACCESS_TOKEN;
if(!token)throw Error('Supabase access token required');
const version='20261006000700',name='display_arch_backdrops';
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
 exists(select 1 from supabase_migrations.schema_migrations where version='20261006000600') preceding_migration_present,
 to_regprocedure('public.wc_shop_product_paint_operations(uuid,uuid)') is not null paint_route_available,
 exists(select 1 from pg_trigger where tgname='wc_box_drawings_shared_backdrop_guard' and not tgisinternal) drawing_guard_installed,
 (select relrowsecurity from pg_class where oid='public.wc_shipping_products'::regclass) product_rls,
 (select relrowsecurity from pg_class where oid='public.wc_shop_templates'::regclass) template_rls,
 (select relrowsecurity from pg_class where oid='public.wc_shop_units'::regclass) unit_rls,
 (select count(*)::int from public.wc_shipping_products) product_count,
 (select count(*)::int from public.wc_shop_templates) template_count,
 (select count(*)::int from public.wc_shop_units) unit_count;`);
if(!before||['preceding_migration_present','paint_route_available','drawing_guard_installed','product_rls','template_rls','unit_rls'].some(key=>before[key]!==true))
 throw Error('Display Arch prerequisites differ; release stopped');
const [registered]=await query(`select replace(statements[1],E'\\r','')=${quote(source)} source_matches from supabase_migrations.schema_migrations where version='${version}'`);
if(registered&&!registered.source_matches)throw Error(`Registered migration ${version} differs from reviewed source`);
console.log(JSON.stringify({preflight:'passed',migrationRegistered:!!registered,products:before.product_count,templates:before.template_count,units:before.unit_count}));
if(mode==='--verify')process.exit(0);

await query(`begin;set local lock_timeout='15s';set local statement_timeout='120s';
 select pg_advisory_xact_lock(20261006,7);
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
 to_regprocedure('public.wc_classify_display_arch_backdrop()') is not null classifier_available,
 exists(select 1 from pg_trigger where tgname='wc_classify_display_arch_backdrop' and not tgisinternal) classifier_installed,
 position('product_type' in pg_get_functiondef('public.wc_shop_product_paint_operations(uuid,uuid)'::regprocedure))>0 paint_route_active,
 not has_function_privilege('anon','public.wc_classify_display_arch_backdrop()','EXECUTE') anon_helper_denied,
 not exists(select 1 from public.wc_shipping_products where product_name ~* 'display[[:space:]]+arch[[:space:]]+with[[:space:]]+shelves' and product_type is distinct from 'Backdrop') all_display_arches_classified,
 (select relrowsecurity from pg_class where oid='public.wc_shipping_products'::regclass) product_rls,
 (select relrowsecurity from pg_class where oid='public.wc_shop_templates'::regclass) template_rls,
 (select relrowsecurity from pg_class where oid='public.wc_shop_units'::regclass) unit_rls,
 (select count(*)::int from public.wc_shipping_products) product_count,
 (select count(*)::int from public.wc_shop_templates) template_count,
 (select count(*)::int from public.wc_shop_units) unit_count;`);
if(!after||['migration_registered','classifier_available','classifier_installed','paint_route_active','anon_helper_denied','all_display_arches_classified','product_rls','template_rls','unit_rls'].some(key=>after[key]!==true)
 ||after.product_count!==before.product_count||after.template_count!==before.template_count||after.unit_count!==before.unit_count)throw Error('Display Arch postflight failed');
console.log(JSON.stringify({release:'verified',productsPreserved:after.product_count,templatesPreserved:after.template_count,unitsPreserved:after.unit_count}));
