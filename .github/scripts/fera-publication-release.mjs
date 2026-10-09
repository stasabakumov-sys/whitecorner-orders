import {readFile} from 'node:fs/promises';

const token=process.env.SUPABASE_ACCESS_TOKEN;
if(!token)throw Error('SUPABASE_ACCESS_TOKEN is required');
const version='20261009000200',name='fera_review_publication';
const source=(await readFile(`supabase/migrations/${version}_${name}.sql`,'utf8')).replaceAll('\r','');
const quote=value=>"'"+value.replaceAll("'","''")+"'";
async function query(sql,readOnly=true){
  const response=await fetch('https://api.supabase.com/v1/projects/zgvnrpspwluapaxnycrg/database/query',{
    method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify({query:sql,read_only:readOnly}),signal:AbortSignal.timeout(120000),
  });
  if(!response.ok)throw Error(`Review publication database query failed (HTTP ${response.status})`);
  return response.json();
}
const [before]=await query(`select
  exists(select 1 from supabase_migrations.schema_migrations where version='20261008000200') base_registered,
  exists(select 1 from supabase_migrations.schema_migrations where version='20261009000100') media_parts_registered,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='wc_fera_reviews' and column_name='is_published') publication_column_present;`);
if(!before?.base_registered||!before.media_parts_registered)throw Error('Private Fera archive migrations are missing');
const [registered]=await query(`select replace(statements[1],E'\\r','')=${quote(source)} source_matches
  from supabase_migrations.schema_migrations where version='${version}'`);
if(registered&&!registered.source_matches)throw Error('Registered publication migration differs from source');
if(before.publication_column_present&&!registered)throw Error('Publication column exists without registered migration');
await query(`begin;set local lock_timeout='15s';set local statement_timeout='120s';
  select pg_advisory_xact_lock(20261009,2);
  do $release$ begin
    if exists(select 1 from supabase_migrations.schema_migrations where version='${version}') then
      if (select replace(statements[1],E'\\r','') from supabase_migrations.schema_migrations where version='${version}')
        is distinct from ${quote(source)} then raise exception 'Publication migration differs';end if;
    else
      execute ${quote(source)};
      insert into supabase_migrations.schema_migrations(version,name,statements)
        values('${version}','${name}',array[${quote(source)}]);
    end if;
  end $release$;commit;`,false);
const [after]=await query(`select
  exists(select 1 from supabase_migrations.schema_migrations where version='${version}') registered,
  (select relrowsecurity from pg_class where oid='public.wc_fera_reviews'::regclass) review_rls,
  (select not public from storage.buckets where id='fera-review-media') private_bucket,
  not has_table_privilege('anon','public.wc_fera_reviews','SELECT') anon_review_denied,
  not has_table_privilege('anon','public.wc_fera_review_media','SELECT') anon_media_denied,
  (select count(*)::int from public.wc_fera_reviews where is_published) published_count,
  (select count(*)::int from public.wc_fera_reviews) total_count;`);
if(!after||['registered','review_rls','private_bucket','anon_review_denied','anon_media_denied'].some(key=>after[key]!==true))throw Error('Publication security postflight failed');
console.log(JSON.stringify({publicationRelease:'verified',publishedCount:after.published_count,totalCount:after.total_count}));
