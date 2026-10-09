import { readFile } from 'node:fs/promises';

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) throw Error('SUPABASE_ACCESS_TOKEN is required');
const version = '20261009000100';
const name = 'fera_media_parts';
const source = (await readFile(`supabase/migrations/${version}_${name}.sql`, 'utf8')).replaceAll('\r', '');
const quote = value => "'" + value.replaceAll("'", "''") + "'";
async function query(sql, readOnly = true) {
  const response = await fetch('https://api.supabase.com/v1/projects/zgvnrpspwluapaxnycrg/database/query', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql, read_only: readOnly }), signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw Error(`Production media-part migration query failed (HTTP ${response.status})`);
  return response.json();
}
const [before] = await query(`select
  to_regclass('public.wc_fera_review_media') is not null media_table_present,
  exists(select 1 from supabase_migrations.schema_migrations where version='20261008000200') base_registered,
  exists(select 1 from information_schema.columns where table_schema='public'
    and table_name='wc_fera_review_media' and column_name='storage_parts') parts_column_present;`);
if (!before?.media_table_present || !before.base_registered) throw Error('Base Fera archive migration is unavailable');
const [registered] = await query(`select replace(statements[1],E'\\r','')=${quote(source)} source_matches
  from supabase_migrations.schema_migrations where version='${version}'`);
if (registered && !registered.source_matches) throw Error('Registered media-parts migration differs from source');
if (before.parts_column_present && !registered) throw Error('Media-parts column exists without registered migration');
await query(`begin; set local lock_timeout='15s'; set local statement_timeout='120s';
  select pg_advisory_xact_lock(20261009,1);
  do $release$ begin
    if exists(select 1 from supabase_migrations.schema_migrations where version='${version}') then
      if (select replace(statements[1],E'\\r','') from supabase_migrations.schema_migrations where version='${version}')
        is distinct from ${quote(source)} then raise exception 'Media-parts migration differs'; end if;
    else
      execute ${quote(source)};
      insert into supabase_migrations.schema_migrations(version,name,statements)
        values('${version}','${name}',array[${quote(source)}]);
    end if;
  end $release$; commit;`, false);
const [after] = await query(`select
  exists(select 1 from supabase_migrations.schema_migrations where version='${version}') migration_registered,
  exists(select 1 from information_schema.columns where table_schema='public'
    and table_name='wc_fera_review_media' and column_name='storage_parts') parts_column_present,
  (select relrowsecurity from pg_class where oid='public.wc_fera_review_media'::regclass) media_rls,
  (select not public from storage.buckets where id='fera-review-media') private_bucket;`);
if (!after || Object.values(after).some(value => value !== true)) throw Error('Media-parts migration postflight failed');
console.log(JSON.stringify({ mediaPartsRelease: 'verified', privateBucket: true }));
