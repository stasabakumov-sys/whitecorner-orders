import {readFile} from 'node:fs/promises';

const project='zgvnrpspwluapaxnycrg';
const version='20260928000100';
const name='hub_product_drafts';
const source=(await readFile(`supabase/migrations/${version}_${name}.sql`,'utf8')).replaceAll('\r','');
const token=process.env.SUPABASE_ACCESS_TOKEN;
if(!token)throw Error('Supabase access token required');
const quote=value=>"'"+value.replaceAll("'","''")+"'";
const api=`https://api.supabase.com/v1/projects/${project}`;

async function sql(query,read_only=true){
  const response=await fetch(`${api}/database/query`,{
    method:'POST',
    headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify({query,read_only}),
  });
  if(!response.ok)throw Error(`Production database query returned HTTP ${response.status}: ${(await response.text()).slice(0,300)}`);
  return response.json();
}

const preflight=(await sql(`select
  to_regprocedure('public.wc_is_hub_manager()') is not null manager_rpc,
  to_regclass('public.wc_storefront_catalog') is not null catalog_projection,
  to_regclass('public.wc_hub_product_drafts') is not null draft_table,
  exists(select 1 from storage.buckets where id='hub-product-drafts') bucket_exists,
  exists(select 1 from storage.buckets where id='hub-product-drafts' and public) public_bucket,
  exists(select 1 from supabase_migrations.schema_migrations where version='${version}') registered;`))[0];
if(!preflight?.manager_rpc||!preflight?.catalog_projection)throw Error('Hub manager RPC or catalog projection is missing');
if(preflight.public_bucket)throw Error('Draft media bucket already exists as public');
if(!preflight.registered&&(preflight.draft_table||preflight.bucket_exists))throw Error('Draft table or bucket exists without a registered migration');
console.log('Preflight:',JSON.stringify(preflight));

const verification=`select
  exists(select 1 from supabase_migrations.schema_migrations where version='${version}') registered,
  to_regclass('public.wc_hub_product_drafts') is not null draft_table,
  coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.wc_hub_product_drafts')),false) rls_enabled,
  exists(select 1 from storage.buckets where id='hub-product-drafts' and not public and file_size_limit=52428800) private_bucket,
  (select count(*)::int from pg_policies where schemaname='public' and tablename='wc_hub_product_drafts')=3 draft_policies,
  (select count(*)::int from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'hub_product_draft_media_%')=3 media_policies,
  not has_column_privilege('authenticated','public.wc_hub_product_drafts','status','UPDATE') status_protected,
  not has_column_privilege('authenticated','public.wc_hub_product_drafts','wix_product_id','UPDATE') wix_id_protected;`;

if(process.argv.includes('--apply')){
  const body=quote(source);
  await sql(`begin;
    select pg_advisory_xact_lock(20260928,1);
    do $release$ begin
      if exists(select 1 from supabase_migrations.schema_migrations where version='${version}') then
        if (select replace(statements[1],E'\\r','') from supabase_migrations.schema_migrations where version='${version}') is distinct from ${body} then
          raise exception 'Registered product draft migration differs from reviewed source';
        end if;
      else
        execute ${body};
        insert into supabase_migrations.schema_migrations(version,name,statements)
          values('${version}','${name}',array[${body}]);
      end if;
    end $release$;
  commit;`,false);
}else if(!process.argv.includes('--verify')){
  throw Error('Use --verify or --apply');
}

if(preflight.registered||process.argv.includes('--apply')){
  const state=(await sql(verification))[0];
  if(!state||Object.values(state).some(value=>value!==true))throw Error(`Product draft postflight failed: ${JSON.stringify(state)}`);
  console.log('Product draft database verified:',JSON.stringify(state));
}else{
  console.log('Product draft migration is not applied yet.');
}
