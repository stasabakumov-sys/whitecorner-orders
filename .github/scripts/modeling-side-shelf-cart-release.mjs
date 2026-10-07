import { readFile } from 'node:fs/promises';

const mode = process.argv[2];
if (!['--verify', '--apply'].includes(mode)) throw Error('Use --verify or --apply');
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) throw Error('SUPABASE_ACCESS_TOKEN is required');
const project = 'zgvnrpspwluapaxnycrg';
const version = '20261007000600';
const name = 'modeling_side_shelf_cart';
const source = (await readFile(`supabase/migrations/${version}_${name}.sql`, 'utf8')).replaceAll('\r', '');
const quote = value => `'${value.replaceAll("'", "''")}'`;
async function query(sql, readOnly = true) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql, read_only: readOnly }),
  });
  if (!response.ok) throw Error(`Production query failed with HTTP ${response.status}`);
  return response.json();
}
const [before] = await query(`select
  exists(select 1 from supabase_migrations.schema_migrations where version='20261004000200') as prerequisite,
  exists(select 1 from supabase_migrations.schema_migrations where version='${version}') as registered,
  (select not public from storage.buckets where id='hub-modeling-models') as bucket_private,
  (select relrowsecurity from pg_class where oid='public.wc_modeling_models'::regclass) as rls_enabled;`);
if (!before?.prerequisite || !before.bucket_private || !before.rls_enabled) throw Error('Private Modeling prerequisites differ');
if (before.registered) {
  const [saved] = await query(`select replace(statements[1],E'\\r','')=${quote(source)} as matches
    from supabase_migrations.schema_migrations where version='${version}';`);
  if (!saved?.matches) throw Error('Registered migration differs from reviewed source');
}
console.log(JSON.stringify({ preflight: 'passed', migrationRegistered: before.registered }));
if (mode === '--verify') process.exit(0);
if (!before.registered) await query(`begin;
  set local lock_timeout='15s'; set local statement_timeout='120s';
  select pg_advisory_xact_lock(20261007,6);
  ${source}
  insert into supabase_migrations.schema_migrations(version,name,statements)
    values('${version}','${name}',array[${quote(source)}]);
  commit;`, false);
const [after] = await query(`select
  exists(select 1 from supabase_migrations.schema_migrations where version='${version}') as registered,
  exists(select 1 from public.wc_modeling_models where slug='side-shelf-cart-mdf'
    and material_name='MDF' and base_width_mm=1500 and base_depth_mm=600
    and base_body_height_mm=755 and caster_height_mm=95) as cart_seed,
  exists(select 1 from public.wc_modeling_models where slug='classic-bar-plywood'
    and base_body_height_mm=805 and caster_height_mm=95) as classic_preserved,
  (select not public from storage.buckets where id='hub-modeling-models') as bucket_private,
  (select relrowsecurity from pg_class where oid='public.wc_modeling_models'::regclass) as rls_enabled,
  not has_table_privilege('anon','public.wc_modeling_models','select') as anon_denied,
  exists(select 1 from pg_policies where schemaname='storage' and tablename='objects'
    and policyname='modeling_models_manager_upload' and with_check like '%wc_is_hub_manager%'
    and with_check like '%wc_modeling_models%' and with_check like '%split_part%') as scoped_upload;`);
if (!after || Object.values(after).some(value => value !== true)) throw Error('Side shelf cart postflight failed');
console.log(JSON.stringify({ release: 'verified', model: 'side-shelf-cart-mdf', bucket: 'private' }));
