import { readFile } from 'node:fs/promises';

const mode = process.argv[2];
if (!['--verify', '--apply'].includes(mode)) throw Error('Use --verify or --apply');
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) throw Error('SUPABASE_ACCESS_TOKEN is required');

const project = 'zgvnrpspwluapaxnycrg';
const version = '20261004000200';
const name = 'modeling_models';
const source = (await readFile(`supabase/migrations/${version}_${name}.sql`, 'utf8')).replaceAll('\r', '');
const quote = value => `'${value.replaceAll("'", "''")}'`;

async function query(sql, readOnly = true) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql, read_only: readOnly }),
  });
  if (!response.ok) throw Error(`Production query failed with HTTP ${response.status}`);
  return response.json();
}

const [before] = await query(`select
  to_regprocedure('public.wc_is_active_hub_member()') is not null as member_check,
  to_regprocedure('public.wc_is_hub_manager()') is not null as manager_check,
  to_regclass('storage.objects') is not null as storage_ready,
  to_regclass('public.wc_modeling_models') is not null as model_table_exists,
  exists(select 1 from supabase_migrations.schema_migrations where version='${version}') as migration_registered;`);
if (!before?.member_check || !before.manager_check || !before.storage_ready) {
  throw Error('Production Hub membership or private Storage prerequisites differ');
}
if (before.model_table_exists !== before.migration_registered) {
  throw Error('Modeling table and migration history disagree');
}
if (before.migration_registered) {
  const [registered] = await query(`select replace(statements[1],E'\\r','')=${quote(source)} as source_matches
    from supabase_migrations.schema_migrations where version='${version}';`);
  if (!registered?.source_matches) throw Error('Registered Modeling migration differs from reviewed source');
}
console.log(JSON.stringify({ preflight: 'passed', migrationRegistered: before.migration_registered }));
if (mode === '--verify') process.exit(0);

if (!before.migration_registered) {
  await query(`begin;
    set local lock_timeout='15s';
    set local statement_timeout='120s';
    select pg_advisory_xact_lock(20261004, 2);
    ${source}
    insert into supabase_migrations.schema_migrations(version,name,statements)
      values('${version}','${name}',array[${quote(source)}]);
    commit;`, false);
}

const [after] = await query(`select
  exists(select 1 from supabase_migrations.schema_migrations where version='${version}') as migration_registered,
  (select relrowsecurity from pg_class where oid='public.wc_modeling_models'::regclass) as rls_enabled,
  (select count(*)::int from public.wc_modeling_models where slug='classic-bar-plywood'
    and product_name='Classic Bar' and material_name='Plywood'
    and base_width_mm=1200 and base_depth_mm=600
    and base_body_height_mm=805 and caster_height_mm=95) = 1 as seed_ok,
  (select not public from storage.buckets where id='hub-modeling-models') as bucket_private,
  not has_table_privilege('anon','public.wc_modeling_models','select') as anon_denied,
  has_table_privilege('authenticated','public.wc_modeling_models','select') as member_read_granted,
  (select count(*)::int from pg_policies where schemaname='storage' and tablename='objects'
    and policyname in ('modeling_models_private_read','modeling_models_manager_upload','modeling_models_manager_cleanup')) = 3 as storage_policies_present;`);
if (!after || Object.values(after).some(value => value !== true)) {
  throw Error('Production Modeling postflight failed');
}
console.log(JSON.stringify({ release: 'verified', bucket: 'private', product: 'Classic Bar / Plywood' }));
