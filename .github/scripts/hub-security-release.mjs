// Management API credentials remain in GitHub Actions secrets. Print metadata only.
const token=process.env.SUPABASE_ACCESS_TOKEN;
if(!token)throw Error('Supabase access token required');
const api='https://api.supabase.com/v1/projects/zgvnrpspwluapaxnycrg';
async function sql(query,read_only=true){
 const response=await fetch(api+'/database/query',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query,read_only})});
 if(!response.ok)throw Error(`Production SQL HTTP ${response.status}; response omitted to protect credentials/data`);
 return response.json();
}
const inventory={
 prerequisites:await sql(`select current_setting('server_version') server_version,
  (select count(*)::int from wc_hub_members where active) active_members,
  (select count(*)::int from wc_hub_members where active and role='manager') active_managers,
  (select count(*)::int from wc_hub_members where not active) inactive_members,
  (select md5(coalesce(string_agg(user_id::text||':'||role||':'||active::text,',' order by user_id),'')) from wc_hub_members) roster_digest,
  (select count(*)::int from information_schema.columns where table_schema='auth' and table_name='sessions' and column_name in ('id','user_id','not_after')) session_columns;`),
 migrations:await sql('select version,name from supabase_migrations.schema_migrations order by version'),
 tables:await sql(`select c.relname,c.relkind,c.relrowsecurity,c.reloptions from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m') order by c.relname`),
 functions:await sql(`select p.oid::regprocedure::text signature,p.prosecdef,l.lanname,
  has_function_privilege('anon',p.oid,'execute') anon_execute,
  has_function_privilege('authenticated',p.oid,'execute') authenticated_execute,
  has_function_privilege('service_role',p.oid,'execute') service_execute,
  p.prosrc ~ 'wc_is_hub_manager|wc_require_hub_member|wc_is_active_hub_member' membership_check,
  p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
  where n.nspname='public' order by signature`),
 buckets:await sql("select id,public from storage.buckets order by id"),
};
console.log(JSON.stringify(inventory,null,2));
if(inventory.prerequisites[0].active_managers<1||inventory.prerequisites[0].session_columns!==3)throw Error('Production membership/session prerequisites failed');
if(!process.argv.includes('--verify'))throw Error('Only --verify is supported in this preflight revision');
