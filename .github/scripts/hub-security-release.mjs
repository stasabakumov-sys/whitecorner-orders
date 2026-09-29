// Management API credentials remain in GitHub Actions secrets. Print metadata only.
import {readFile} from 'node:fs/promises';
import {releaseSql} from './hub-security-release-sql.mjs';
const token=process.env.SUPABASE_ACCESS_TOKEN;
if(!token)throw Error('Supabase access token required');
const api='https://api.supabase.com/v1/projects/zgvnrpspwluapaxnycrg';
async function sql(query,read_only=true){
 const response=await fetch(api+'/database/query',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query,read_only})});
 if(!response.ok){
  const raw=await response.text();
  const state=/ERROR:\s*([A-Z0-9]{5}):/.exec(raw)?.[1]||'unknown';
  const category=['permission denied','cannot set','read-only','syntax error','Nonmember RLS verification failed'].find(label=>raw.includes(label))||'SQL error';
  throw Error(`Production SQL HTTP ${response.status}; SQLSTATE ${state}; ${category}. Raw response omitted.`);
 }
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
 drift_columns:await sql("select table_name,column_name,data_type from information_schema.columns where table_schema='public' and table_name in ('wc_storefront_catalog','wc_catalog_import_access','wc_catalog_media','wc_catalog_media_issues') order by table_name,ordinal_position"),
 drift_policies:await sql("select tablename,policyname,roles,cmd,qual,with_check from pg_policies where (schemaname='public' and tablename in ('wc_storefront_catalog','wc_catalog_import_access','wc_catalog_media','wc_catalog_media_issues','transactions','business_categories','classification_rules','imports','personal_rules','personal_rule_transactions')) or (schemaname='storage' and tablename='objects') order by tablename,policyname"),
 extra_function:await sql("select p.prorettype::regtype::text return_type,p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='rls_auto_enable'"),
};
console.log(JSON.stringify({prerequisites:inventory.prerequisites,migrations:inventory.migrations.slice(-5),tables:inventory.tables.length,functions:inventory.functions.length,buckets:inventory.buckets},null,2));
if(inventory.prerequisites[0].active_managers<1||inventory.prerequisites[0].session_columns!==3)throw Error('Production membership/session prerequisites failed');
const sources=await Promise.all([['20260929000100','hub_access_hardening'],['20260929000200','server_action_state']].map(async([version,name])=>({version,name,source:(await readFile(`supabase/migrations/${version}_${name}.sql`,'utf8')).replaceAll('\r','')})));
if(process.argv.includes('--apply')){
 await sql(releaseSql(sources),false);
 console.log('Both security migrations applied atomically and registered; membership preserved.');
}else if(!process.argv.includes('--verify')&&!process.argv.includes('--smoke'))throw Error('Use --verify, --apply or --smoke');
if(process.argv.includes('--apply')||process.argv.includes('--smoke')){
 const checks=(await sql(`select
  (select count(*)=2 from supabase_migrations.schema_migrations where version in ('20260929000100','20260929000200')) migrations_registered,
  not has_table_privilege('authenticated','wc_mailboxes','SELECT') tokens_private,
  not has_function_privilege('authenticated','wc_claim_courier_booking(text,uuid,timestamptz,bigint)','execute') booking_claim_private,
  not has_function_privilege('authenticated','wc_consume_gmail_oauth(uuid)','execute') oauth_consume_private,
  (select count(*)=5 from storage.buckets where id in ('shipping-documents','box-drawings','cnc-files','box-rd-files','hub-product-drafts') and not public) private_buckets,
  has_table_privilege('anon','wc_storefront_catalog','SELECT') storefront_read_preserved,
  (select md5(coalesce(string_agg(user_id::text||':'||role||':'||active::text,',' order by user_id),'')) from wc_hub_members) roster_digest;`))[0];
 if(checks.roster_digest!==inventory.prerequisites[0].roster_digest||Object.entries(checks).some(([k,v])=>k!=='roster_digest'&&v!==true))throw Error('Production postflight failed');
 await sql(`begin read only;
 do $check$ declare relation text;visible boolean;begin
  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
  execute 'set local role authenticated';
  foreach relation in array array['wc_orders','wc_shipments','wc_mailboxes','transactions'] loop
   begin
    execute format('select exists(select 1 from public.%I)',relation) into visible;
    if visible then raise exception 'Nonmember RLS verification failed';end if;
   exception when insufficient_privilege then null;end;
  end loop;
 end $check$;
 rollback;`,false); // Management API read-only role cannot SET ROLE; SQL itself stays read-only.
 console.log('Production postflight:',JSON.stringify({...checks,nonmember_rls:true}));
}
if(process.argv.includes('--smoke')){
 const functions=['address-review-sync','delivery-cost-review','email-ai','fast-courier-api','gmail-api','gmail-oauth','hub-users','wix-orders-sync'];
 const response=await fetch(api+'/functions',{headers:{Authorization:`Bearer ${token}`}});
 if(!response.ok)throw Error('Could not verify deployed function metadata');
 const deployed=await response.json();
 for(const name of functions){
  const fn=deployed.find(f=>f.slug===name);
  if(!fn||fn.status!=='ACTIVE'||fn.verify_jwt!==(name!=='gmail-oauth'))throw Error('Function configuration mismatch: '+name);
  const denied=await fetch(`https://zgvnrpspwluapaxnycrg.supabase.co/functions/v1/${name}`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  if(denied.status!==401)throw Error(`Unauthenticated ${name} returned ${denied.status}`);
  console.log(JSON.stringify({function:name,version:fn.version,verify_jwt:fn.verify_jwt,unauthenticated_status:denied.status}));
 }
}
