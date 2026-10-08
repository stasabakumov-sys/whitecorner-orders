import { readFile } from 'node:fs/promises';

const mode = process.argv[2];
if (!['--verify', '--apply'].includes(mode)) throw Error('Use --verify or --apply');
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) throw Error('SUPABASE_ACCESS_TOKEN is required');
const version = '20261008000200';
const name = 'fera_reviews';
const source = (await readFile(`supabase/migrations/${version}_${name}.sql`, 'utf8')).replaceAll('\r', '');
const quote = value => "'" + value.replaceAll("'", "''") + "'";
async function query(sql, readOnly = true) {
  const response = await fetch('https://api.supabase.com/v1/projects/zgvnrpspwluapaxnycrg/database/query', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql, read_only: readOnly }),
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw Error(`Production database query failed (HTTP ${response.status})`);
  return response.json();
}
const [before] = await query(`select
  to_regclass('public.wc_shipping_products') is not null products_available,
  to_regclass('public.wc_wix_catalog_products') is not null wix_catalog_available,
  to_regclass('storage.buckets') is not null storage_available,
  to_regprocedure('public.wc_is_hub_manager()') is not null manager_guard_available,
  to_regprocedure('public.wc_is_active_hub_member()') is not null member_guard_available,
  to_regclass('public.wc_fera_reviews') is not null review_table_present,
  exists(select 1 from supabase_migrations.schema_migrations where version='20260929000100') access_hardening_registered;`);
if (!before || ['products_available', 'wix_catalog_available', 'storage_available', 'manager_guard_available',
  'member_guard_available', 'access_hardening_registered'].some(key => before[key] !== true)) {
  throw Error('Hub review migration prerequisites differ; release stopped');
}
const [registered] = await query(`select replace(statements[1],E'\\r','')=${quote(source)} source_matches
  from supabase_migrations.schema_migrations where version='${version}'`);
if (registered && !registered.source_matches) throw Error('Registered Fera migration differs from reviewed source');
if (before.review_table_present && !registered) throw Error('Fera review table exists without a registered migration');
console.log(JSON.stringify({ preflight: 'passed', migrationRegistered: !!registered }));
const storageResponse = await fetch('https://api.supabase.com/v1/projects/zgvnrpspwluapaxnycrg/config/storage', {
  headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000),
});
if (storageResponse.status === 403) {
  console.log(JSON.stringify({ storageGlobalLimitBytes: 'unavailable (token scope)' }));
} else {
  if (!storageResponse.ok) throw Error(`Production storage config read failed (HTTP ${storageResponse.status})`);
  const storageConfig = await storageResponse.json();
  if (!Number.isSafeInteger(storageConfig.fileSizeLimit) || storageConfig.fileSizeLimit <= 0) {
    throw Error('Production storage config has no valid global file size limit');
  }
  console.log(JSON.stringify({ storageGlobalLimitBytes: storageConfig.fileSizeLimit }));
}
if (mode === '--verify') process.exit(0);

await query(`begin; set local lock_timeout='15s'; set local statement_timeout='120s';
  select pg_advisory_xact_lock(20261008,2);
  do $release$ begin
    if exists(select 1 from supabase_migrations.schema_migrations where version='${version}') then
      if (select replace(statements[1],E'\\r','') from supabase_migrations.schema_migrations where version='${version}')
        is distinct from ${quote(source)} then raise exception 'Fera migration differs'; end if;
    else
      execute ${quote(source)};
      insert into supabase_migrations.schema_migrations(version,name,statements)
        values('${version}','${name}',array[${quote(source)}]);
    end if;
  end $release$; commit;`, false);
const [after] = await query(`select
  exists(select 1 from supabase_migrations.schema_migrations where version='${version}') migration_registered,
  (select relrowsecurity from pg_class where oid='public.wc_fera_reviews'::regclass) review_rls,
  (select relrowsecurity from pg_class where oid='public.wc_fera_review_media'::regclass) media_rls,
  (select not public from storage.buckets where id='fera-review-media') private_bucket,
  not has_table_privilege('anon','public.wc_fera_reviews','SELECT') anon_review_denied,
  not has_table_privilege('anon','public.wc_fera_review_media','SELECT') anon_media_denied;`);
if (!after || Object.values(after).some(value => value !== true)) throw Error('Fera migration postflight failed');
console.log(JSON.stringify({ release: 'verified', privateBucket: true, reviewRls: true, mediaRls: true }));
