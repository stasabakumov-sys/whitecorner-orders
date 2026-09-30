import {readFile} from 'node:fs/promises';

const project = 'zgvnrpspwluapaxnycrg';
const version = '20260930000500', name = 'billing_document_import';
const source = (await readFile(`supabase/migrations/${version}_${name}.sql`, 'utf8')).replaceAll('\r', '');
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) throw Error('Supabase management token is required.');
const api = `https://api.supabase.com/v1/projects/${project}`;
const quote = value => "'" + value.replaceAll("'", "''") + "'";
async function sql(query, read_only = true) {
  const response = await fetch(`${api}/database/query`, {
    method: 'POST', headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({query, read_only}), signal: AbortSignal.timeout(150000),
  });
  if (!response.ok) throw Error(`Billing production query failed: HTTP ${response.status}. Raw response omitted.`);
  return response.json();
}
const verification = `select
  exists(select 1 from supabase_migrations.schema_migrations where version='${version}' and name='${name}' and replace(statements[1],E'\\r','')=${quote(source)}) registered_source_matches,
  (select count(*)=4 and bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('wc_billing_documents','wc_billing_document_versions','wc_billing_import_runs','wc_billing_import_items')) tables_have_rls,
  exists(select 1 from storage.buckets where id='billing-documents' and not public and file_size_limit=20971520) bucket_private,
  exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='billing_archive_private' and permissive='RESTRICTIVE') storage_gate,
  not has_table_privilege('anon','public.wc_billing_documents','SELECT') anonymous_denied,
  not has_table_privilege('authenticated','public.wc_billing_documents','INSERT,UPDATE,DELETE,TRUNCATE') client_writes_denied,
  not has_function_privilege('authenticated','public.wc_billing_begin(text,text,uuid,boolean)','EXECUTE') begin_server_only,
  not has_function_privilege('authenticated','public.wc_billing_save_page(uuid,text,text,boolean,jsonb)','EXECUTE') save_server_only,
  has_function_privilege('service_role','public.wc_billing_begin(text,text,uuid,boolean)','EXECUTE') service_can_begin,
  has_function_privilege('service_role','public.wc_billing_save_page(uuid,text,text,boolean,jsonb)','EXECUTE') service_can_save,
  (select reloptions @> array['security_invoker=true'] from pg_class where oid='public.wc_billing_document_list'::regclass) view_respects_rls;`;

if (process.argv.includes('--apply')) {
  const opening = /^(?:--[^\n]*\n|\s)*begin;\s*/i;
  if (!opening.test(source) || !/commit;\s*$/i.test(source)) throw Error('Expected a transactional migration.');
  const body = source.replace(opening, '').replace(/commit;\s*$/i, '');
  await sql(`begin; set local lock_timeout='15s'; set local statement_timeout='120s';
    select pg_advisory_xact_lock(20260930,5);
    do $billing_release$ begin
      if to_regprocedure('public.wc_is_active_hub_member()') is null or to_regclass('public.wc_hub_members') is null then raise exception 'Hub membership prerequisites missing'; end if;
      if exists(select 1 from supabase_migrations.schema_migrations where version='${version}') then
        if (select replace(statements[1],E'\\r','') from supabase_migrations.schema_migrations where version='${version}') is distinct from ${quote(source)} then raise exception 'Registered billing migration differs'; end if;
      else
        if to_regclass('public.wc_billing_documents') is not null or exists(select 1 from storage.buckets where id='billing-documents') then raise exception 'Unregistered billing archive already exists'; end if;
        execute ${quote(body)};
        insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','${name}',array[${quote(source)}]);
      end if;
    end $billing_release$; commit;`, false);
  const state = (await sql(verification))[0];
  if (!state || Object.values(state).some(value => value !== true)) throw Error('Billing migration postflight failed: ' + JSON.stringify(state));
  console.log('Billing migration applied and verified:', JSON.stringify(state));
} else if (process.argv.includes('--verify')) {
  const state = (await sql(verification))[0];
  if (!state || Object.values(state).some(value => value !== true)) throw Error('Billing migration verification failed: ' + JSON.stringify(state));
  console.log('Billing database security:', JSON.stringify(state));
  const response = await fetch(`${api}/functions`, {headers: {Authorization: `Bearer ${token}`}});
  if (!response.ok) throw Error(`Function metadata request failed: HTTP ${response.status}`);
  const fn = (await response.json()).find(f => f.slug === 'wix-billing-import');
  if (!fn || fn.status !== 'ACTIVE' || fn.verify_jwt !== true) throw Error('Billing Edge Function must be ACTIVE with JWT verification.');
  const denied = await fetch(`https://${project}.supabase.co/functions/v1/wix-billing-import`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action: 'status'})});
  if (denied.status !== 401) throw Error(`Unauthenticated billing request returned HTTP ${denied.status}, expected 401.`);
  console.log('Billing function:', JSON.stringify({version: fn.version, status: fn.status, verify_jwt: fn.verify_jwt, unauthenticated_status: denied.status}));
  // Aggregate-only audit. Never print customer records, document URLs or tokens.
  console.log('Saved archive counts:', JSON.stringify(await sql(`select kind,count(*)::int documents,count(*) filter(where pdf_saved)::int pdfs_saved,count(*) filter(where not pdf_saved)::int pdfs_pending from public.wc_billing_document_list group by kind order by kind`)));
  console.log('Latest scan audit:', JSON.stringify(await sql(`select distinct on (kind) kind,saved_count,scan_complete,started_at,last_error is not null has_error,(select count(*)::int from public.wc_billing_import_items i where i.run_id=r.id) verified_items from public.wc_billing_import_runs r order by kind,started_at desc`)));
} else throw Error('Use --apply or --verify.');
