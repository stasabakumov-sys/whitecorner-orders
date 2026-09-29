export const quote=value=>"'"+value.replaceAll("'","''")+"'";
export function releaseSql(sources){
 const blocks=sources.map(({version,name,source})=>{
  const opening=/^(?:--[^\n]*\n|\s)*begin;\s*/i;
  if(!opening.test(source)||!(/commit;\s*$/i.test(source)))throw Error('Expected transactional security migration');
  const body=source.replace(opening,'').replace(/commit;\s*$/i,'');
  return `if exists(select 1 from supabase_migrations.schema_migrations where version=${quote(version)}) then
   if (select replace(statements[1],E'\\r','') from supabase_migrations.schema_migrations where version=${quote(version)}) is distinct from ${quote(source)} then raise exception 'Registered security migration differs'; end if;
  else execute ${quote(body)};insert into supabase_migrations.schema_migrations(version,name,statements) values(${quote(version)},${quote(name)},array[${quote(source)}]);end if;`;
 }).join('\n');
 return `begin;
 set local lock_timeout='10s';set local statement_timeout='120s';
 select pg_advisory_xact_lock(20260929,1);
 do $release$ declare roster jsonb; begin
 select jsonb_agg(to_jsonb(m) order by user_id) into roster from public.wc_hub_members m;
 ${blocks}
 if roster is distinct from (select jsonb_agg(to_jsonb(m) order by user_id) from public.wc_hub_members m) then raise exception 'Membership changed during security release';end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname<>'wc_storefront_catalog' and (c.relname like 'wc\\_%' escape '\\' or c.relname in ('transactions','business_categories','classification_rules','personal_rules','personal_rule_transactions','imports')) and c.relkind in ('r','p','v') and (has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') or (c.relkind<>'v' and not c.relrowsecurity))) then raise exception 'Private relation grant/RLS verification failed';end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'wc\\_%' escape '\\' and has_function_privilege('anon',p.oid,'execute')) then raise exception 'Anonymous RPC remains executable';end if;
 if exists(select 1 from storage.buckets where id in ('shipping-documents','box-drawings','cnc-files','box-rd-files','hub-product-drafts') and public) then raise exception 'Internal bucket remains public';end if;
 if not has_table_privilege('anon','public.wc_storefront_catalog','SELECT') then raise exception 'Public storefront projection lost read access';end if;
 end $release$;
 commit;`;
}
