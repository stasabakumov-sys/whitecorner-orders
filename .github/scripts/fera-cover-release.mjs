import {readFile} from 'node:fs/promises';

const token=process.env.SUPABASE_ACCESS_TOKEN;
if(!token)throw Error('SUPABASE_ACCESS_TOKEN is required');
const version='20261009000400',name='fera_review_cover';
const source=(await readFile(`supabase/migrations/${version}_${name}.sql`,'utf8')).replaceAll('\r','');
const quote=value=>"'"+value.replaceAll("'","''")+"'";
async function query(sql,readOnly=true){
  const response=await fetch('https://api.supabase.com/v1/projects/zgvnrpspwluapaxnycrg/database/query',{
    method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify({query:sql,read_only:readOnly}),signal:AbortSignal.timeout(120000),
  });
  if(!response.ok)throw Error(`Review cover query failed (HTTP ${response.status})`);
  return response.json();
}
const [before]=await query(`select
  exists(select 1 from supabase_migrations.schema_migrations where version='20261009000300') product_link_registered,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='wc_fera_review_media' and column_name='is_cover') cover_column_present;`);
if(!before?.product_link_registered)throw Error('Review product link migration is missing');
const [registered]=await query(`select replace(statements[1],E'\r','')=${quote(source)} source_matches
  from supabase_migrations.schema_migrations where version='${version}'`);
if(registered&&!registered.source_matches)throw Error('Registered cover migration differs from source');
if(before.cover_column_present&&!registered)throw Error('Cover column exists without registered migration');
await query(`begin;set local lock_timeout='15s';set local statement_timeout='120s';
  select pg_advisory_xact_lock(20261009,4);
  do $release$ begin
    if exists(select 1 from supabase_migrations.schema_migrations where version='${version}') then
      if (select replace(statements[1],E'\r','') from supabase_migrations.schema_migrations where version='${version}')
        is distinct from ${quote(source)} then raise exception 'Cover migration differs';end if;
    else
      execute ${quote(source)};
      insert into supabase_migrations.schema_migrations(version,name,statements)
        values('${version}','${name}',array[${quote(source)}]);
    end if;
  end $release$;commit;`,false);
const [after]=await query(`select
  exists(select 1 from supabase_migrations.schema_migrations where version='${version}') registered,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='wc_fera_review_media' and column_name='is_cover') cover_column_present,
  exists(select 1 from pg_indexes where schemaname='public' and indexname='wc_fera_review_one_cover_idx') cover_index_present,
  (select relrowsecurity from pg_class where oid='public.wc_fera_review_media'::regclass) media_rls,
  has_function_privilege('authenticated','public.wc_set_fera_review_cover(uuid,uuid)','EXECUTE') manager_can_select_cover,
  not has_function_privilege('anon','public.wc_set_fera_review_cover(uuid,uuid)','EXECUTE') anonymous_denied;`);
if(!after||Object.values(after).some(value=>value!==true))throw Error('Review cover postflight failed');
console.log(JSON.stringify({reviewCoverRelease:'verified',mediaRls:true,anonymousDenied:true}));
