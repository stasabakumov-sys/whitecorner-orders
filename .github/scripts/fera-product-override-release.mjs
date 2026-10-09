import {readFile} from 'node:fs/promises';

const token=process.env.SUPABASE_ACCESS_TOKEN;
if(!token)throw Error('SUPABASE_ACCESS_TOKEN is required');
const version='20261009000300',name='fera_review_product_override';
const source=(await readFile(`supabase/migrations/${version}_${name}.sql`,'utf8')).replaceAll('\r','');
const quote=value=>"'"+value.replaceAll("'","''")+"'";
async function query(sql,readOnly=true){
  const response=await fetch('https://api.supabase.com/v1/projects/zgvnrpspwluapaxnycrg/database/query',{
    method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify({query:sql,read_only:readOnly}),signal:AbortSignal.timeout(120000),
  });
  if(!response.ok)throw Error(`Review product override query failed (HTTP ${response.status})`);
  return response.json();
}
const [before]=await query(`select
  exists(select 1 from supabase_migrations.schema_migrations where version='20261009000200') publication_registered,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='wc_fera_reviews' and column_name='product_override_id') override_column_present;`);
if(!before?.publication_registered)throw Error('Publication migration is missing');
const [registered]=await query(`select replace(statements[1],E'\\r','')=${quote(source)} source_matches
  from supabase_migrations.schema_migrations where version='${version}'`);
if(registered&&!registered.source_matches)throw Error('Registered override migration differs from source');
if(before.override_column_present&&!registered)throw Error('Override column exists without registered migration');
await query(`begin;set local lock_timeout='15s';set local statement_timeout='120s';
  select pg_advisory_xact_lock(20261009,3);
  do $release$ begin
    if exists(select 1 from supabase_migrations.schema_migrations where version='${version}') then
      if (select replace(statements[1],E'\\r','') from supabase_migrations.schema_migrations where version='${version}')
        is distinct from ${quote(source)} then raise exception 'Override migration differs';end if;
    else
      execute ${quote(source)};
      insert into supabase_migrations.schema_migrations(version,name,statements)
        values('${version}','${name}',array[${quote(source)}]);
    end if;
  end $release$;commit;`,false);
const [after]=await query(`select
  exists(select 1 from supabase_migrations.schema_migrations where version='${version}') registered,
  (select relrowsecurity from pg_class where oid='public.wc_fera_reviews'::regclass) review_rls,
  has_column_privilege('authenticated','public.wc_fera_reviews','product_override_id','UPDATE') manager_override_column,
  not has_column_privilege('authenticated','public.wc_fera_reviews','shipping_product_id','UPDATE') source_link_protected;`);
if(!after||Object.values(after).some(value=>value!==true))throw Error('Review product override postflight failed');
console.log(JSON.stringify({productOverrideRelease:'verified',sourceLinkProtected:true}));
