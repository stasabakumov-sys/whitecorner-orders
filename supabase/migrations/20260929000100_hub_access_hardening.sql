-- Preserve the established roster; do not infer membership from auth.users.
-- Requires the already agreed Packing membership rollout. No accounts/roles are added.
begin;
do $$ begin
 if not exists(select 1 from public.wc_hub_members where active and role='manager') then
  raise exception 'Review existing Hub membership before applying security hardening: no active manager';
 end if;
end $$;
create or replace function public.wc_hub_member_sync() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 -- Signup and user-controlled metadata cannot grant membership or reactivate it.
 update public.wc_hub_members set email=coalesce(new.email,'') where user_id=new.id;
 return new;
end $$;
create function public.wc_is_active_hub_member() returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select auth.uid() is not null and exists
 (select 1 from public.wc_hub_members where user_id=auth.uid() and active and role in ('worker','manager'))
$$;
create function public.wc_require_hub_member(p_manager boolean default false) returns void
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if not public.wc_is_active_hub_member() then raise exception 'Active Hub membership required' using errcode='42501'; end if;
 if p_manager and not public.wc_is_hub_manager() then raise exception 'Manager access required' using errcode='42501'; end if;
end $$;
revoke create on schema public from public,anon,authenticated;

-- Restrictive policies intersect EVERY existing permissive policy. They preserve
-- row ownership, manager-only rules, immutable snapshots and existing grants.
do $$ declare r record; begin
 for r in select c.relname,c.relkind from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and (c.relname like 'wc\_%' escape '\' or c.relname in ('transactions','business_categories','classification_rules','personal_rules','personal_rule_transactions','imports')) and c.relkind in ('r','p','v')
 loop
  -- Production has a separately published, read-only `live` storefront projection.
  -- Its catalog publication contract is outside private Hub operations.
  if r.relname='wc_storefront_catalog' then continue; end if;
  execute format('revoke all on public.%I from public,anon',r.relname);
  if r.relkind='v' then
   execute format('alter view public.%I set (security_invoker=true)',r.relname);
  else
   execute format('revoke truncate,references,trigger on public.%I from authenticated',r.relname);
   execute format('alter table public.%I enable row level security',r.relname);
   execute format('create policy hub_active_member_gate on public.%I as restrictive for all to authenticated using (public.wc_is_active_hub_member()) with check (public.wc_is_active_hub_member())',r.relname);
  end if;
 end loop;
end $$;
-- Mailbox credentials remain server-only even if default grants exist.
revoke all on public.wc_mailboxes from public,anon,authenticated;

update storage.buckets set public=false where id in
 ('shipping-documents','box-drawings','cnc-files','box-rd-files','hub-product-drafts');
create policy hub_private_files_member_gate on storage.objects as restrictive for all to authenticated
using (bucket_id not in ('shipping-documents','box-drawings','cnc-files','box-rd-files','hub-product-drafts') or public.wc_is_active_hub_member())
with check (bucket_id not in ('shipping-documents','box-drawings','cnc-files','box-rd-files','hub-product-drafts') or public.wc_is_active_hub_member());

-- Close PUBLIC's default EXECUTE, including old helper functions which were
-- unintentionally PostgREST-callable. Only the reviewed application RPC surface
-- is re-granted; existing service_role grants are preserved.
do $$
declare r record; definition text; body text;
 exposed text[] := array['wc_assign_packing_task',
  'wc_attach_box_drawing',
  'wc_attach_product_cnc_file',
  'wc_cancel_packing_task',
  'wc_catalog_cost_parts',
  'wc_catalog_cost_report',
  'wc_claim_packing_transfer',
  'wc_classify_backdrop_box_drawing',
  'wc_complete_packing_task',
  'wc_costing_report',
  'wc_delete_box_rd_file',
  'wc_finish_packing_transfer',
  'wc_is_hub_manager',
  'wc_packing_candidates',
  'wc_packing_station_heartbeat',
  'wc_request_packing_transfer',
  'wc_reset_stale_packing_transfer',
  'wc_save_backdrop_box_drawing',
  'wc_save_backdrop_material_profile',
  'wc_save_backdrop_packaging_dimensions',
  'wc_save_backdrop_paint_profile',
  'wc_save_box_rd_file',
  'wc_save_cart_material_profile',
  'wc_save_catalog_cost_profile',
  'wc_save_material',
  'wc_save_material_group',
  'wc_save_material_profile',
  'wc_save_product_cnc_sheet',
  'wc_save_product_drawing',
  'wc_save_product_paint_profile',
  'wc_save_shared_backdrop_material_profile',
  'wc_save_shipping_booking',
  'wc_save_work_rate',
  'wc_send_packing_task',
  'wc_set_partner_pans_status',
  'wc_shop_command',
  'wc_shop_product_components',
  'wc_shop_save_backdrop_template',
  'wc_shop_save_product_template',
  'wc_shop_save_sized_product_template',
  'wc_shop_save_variant_template','wc_is_active_hub_member','wc_require_hub_member'];
 manager_only text[] := array['wc_save_shipping_booking','wc_assign_packing_task','wc_send_packing_task','wc_cancel_packing_task','wc_packing_station_heartbeat','wc_claim_packing_transfer','wc_finish_packing_transfer','wc_reset_stale_packing_transfer','wc_save_box_rd_file','wc_delete_box_rd_file'];
begin
 for r in select p.*,l.lanname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  join pg_language l on l.oid=p.prolang where n.nspname='public' and p.proname like 'wc\_%' escape '\'
 loop
  execute format('revoke all on function %s from public,anon,authenticated',r.oid::regprocedure);
  if r.proname=any(exposed) and r.prorettype <> 'trigger'::regtype then
   -- Helpers implement their own check and must avoid recursion.
   if r.proname not in ('wc_is_hub_manager','wc_is_active_hub_member','wc_require_hub_member') then
    definition := pg_get_functiondef(r.oid);
    if r.lanname='plpgsql' then
     body := regexp_replace(r.prosrc,'\mbegin\M',
      'begin' || chr(10) || ' perform public.wc_require_hub_member(' || case when r.proname=any(manager_only) then 'true' else 'false' end || ');','i');
     if body=r.prosrc then raise exception 'Unrecognized RPC body: %',r.proname; end if;
    elsif r.lanname='sql' then
     body := '#variable_conflict use_column' || chr(10) || 'begin perform public.wc_require_hub_member(false); ' ||
       case when r.proretset then 'return query ' || r.prosrc || ';'
       else 'return (' || regexp_replace(btrim(r.prosrc),';$','') || ');' end || ' end';
     definition := replace(definition,'LANGUAGE sql','LANGUAGE plpgsql');
    else raise exception 'Unrecognized RPC language: %',r.proname;
    end if;
    execute replace(definition,r.prosrc,body);
   end if;
   execute format('grant execute on function %s to authenticated',r.oid::regprocedure);
  end if;
  if r.prosecdef then execute format('alter function %s set search_path=public,pg_temp',r.oid::regprocedure); end if;
 end loop;
end $$;
create policy hub_private_files_no_anon on storage.objects as restrictive for all to anon
using (bucket_id not in ('shipping-documents','box-drawings','cnc-files','box-rd-files','hub-product-drafts'))
with check (bucket_id not in ('shipping-documents','box-drawings','cnc-files','box-rd-files','hub-product-drafts'));
commit;
