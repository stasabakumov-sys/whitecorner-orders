-- Keep collection membership tied to the complete product scan.
alter table public.wc_wix_catalog_collections add column run_id uuid;

create function public.wc_storefront_publish_run(p_site text, p_run uuid, p_payload jsonb)
returns timestamptz language plpgsql security definer set search_path=public as $$
declare j public.wc_wix_catalog_jobs; published timestamptz := now();
begin
 perform pg_advisory_xact_lock(20260907,8);
 select * into j from public.wc_wix_catalog_jobs where site_id=p_site for update;
 if not found or j.run_id<>p_run or not j.complete or j.expected_total is null
  or j.next_offset<>j.expected_total
  or (select count(*) from public.wc_wix_catalog_products where site_id=p_site and run_id=p_run)<>j.expected_total
  or not exists(select 1 from public.wc_wix_catalog_collections where run_id=p_run)
 then raise exception 'Catalogue scan or collections are incomplete or changed'; end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or p_payload->>'schemaVersion'<>'1'
  or jsonb_typeof(p_payload->'products') is distinct from 'array'
  or jsonb_array_length(p_payload->'products')=0
  or jsonb_typeof(p_payload->'categories') is distinct from 'array'
 then raise exception 'Invalid public catalogue'; end if;
 insert into public.wc_storefront_catalog(id,payload,published_at) values('live',p_payload,published)
 on conflict(id) do update set payload=excluded.payload,published_at=excluded.published_at;
 return published;
end $$;
revoke all on function public.wc_storefront_publish_run(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.wc_storefront_publish_run(text,uuid,jsonb) to service_role;
