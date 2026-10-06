import {readFile} from 'node:fs/promises';

const mode=process.argv[2];
if(!['--verify','--apply'].includes(mode))throw Error('Use --verify or --apply');
const token=process.env.SUPABASE_ACCESS_TOKEN;
if(!token)throw Error('Supabase access token required');
const version='20261006000600',name='additive_addon_cnc';
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
 exists(select 1 from supabase_migrations.schema_migrations where version='20261006000400') composition_prerequisite,
 exists(select 1 from supabase_migrations.schema_migrations where version='20261006000500') preceding_migration_present,
 to_regprocedure('public.wc_shop_cnc_composition_key(jsonb,jsonb,uuid,jsonb,uuid[])') is not null option_match_available,
 exists(select 1 from pg_trigger where tgname='wc_shop_unit_product_parts' and not tgisinternal) parts_trigger_installed,
 (select relrowsecurity from pg_class where oid='public.wc_shop_templates'::regclass) template_rls,
 (select relrowsecurity from pg_class where oid='public.wc_shop_units'::regclass) unit_rls,
 (select count(*)::int from public.wc_shop_templates) template_count,
 (select count(*)::int from public.wc_shop_units) unit_count;`);
if(!before||['composition_prerequisite','preceding_migration_present','option_match_available','parts_trigger_installed','template_rls','unit_rls'].some(key=>before[key]!==true))
 throw Error('CNC composition prerequisites differ; release stopped');
const [registered]=await query(`select replace(statements[1],E'\\r','')=${quote(source)} source_matches from supabase_migrations.schema_migrations where version='${version}'`);
if(registered&&!registered.source_matches)throw Error(`Registered migration ${version} differs from reviewed source`);
console.log(JSON.stringify({preflight:'passed',migrationRegistered:!!registered,templates:before.template_count,units:before.unit_count}));
if(mode==='--verify')process.exit(0);

await query(`begin;set local lock_timeout='15s';set local statement_timeout='120s';
 select pg_advisory_xact_lock(20261006,6);
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
 to_regprocedure('public.wc_shop_cnc_scope_matches(text,jsonb,uuid[])') is not null scope_match_available,
 to_regprocedure('public.wc_shop_cnc_composition_key(jsonb,jsonb,uuid,jsonb,uuid[])') is not null composition_key_available,
 position('additive_cnc' in pg_get_functiondef('public.wc_shop_unit_product_parts()'::regprocedure))>0 composition_trigger_active,
 not has_function_privilege('anon','public.wc_shop_cnc_scope_matches(text,jsonb,uuid[])','EXECUTE') anon_helper_denied,
 (select relrowsecurity from pg_class where oid='public.wc_shop_templates'::regclass) template_rls,
 (select relrowsecurity from pg_class where oid='public.wc_shop_units'::regclass) unit_rls,
 (select count(*)::int from public.wc_shop_templates) template_count,
 (select count(*)::int from public.wc_shop_units) unit_count;`);
if(!after||['migration_registered','scope_match_available','composition_key_available','composition_trigger_active','anon_helper_denied','template_rls','unit_rls'].some(key=>after[key]!==true)
 ||after.template_count!==before.template_count||after.unit_count!==before.unit_count)throw Error('CNC composition postflight failed');
console.log(JSON.stringify({release:'verified',templatesPreserved:after.template_count,unitsPreserved:after.unit_count}));
