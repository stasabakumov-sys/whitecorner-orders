-- Wix owns commercial snapshots; existing operational product UUIDs remain stable.
create table public.wc_wix_catalog_jobs (
 site_id text primary key,
 run_id uuid not null default gen_random_uuid(),
 next_offset integer not null default 0 check(next_offset>=0),
 expected_total integer check(expected_total>=0),
 complete boolean not null default false,
 updated_at timestamptz not null default now()
);
create table public.wc_wix_catalog_products (
 wix_product_id text primary key,
 site_id text not null,
 shipping_product_id uuid not null unique references public.wc_shipping_products(id),
 run_id uuid not null,
 source_product jsonb not null check(jsonb_typeof(source_product)='object'),
 source_json text,
 synced_at timestamptz not null default now()
);
alter table public.wc_wix_catalog_jobs enable row level security;
alter table public.wc_wix_catalog_products enable row level security;
create policy catalog_read on public.wc_wix_catalog_products for select to authenticated using(true);
create policy catalog_job_read on public.wc_wix_catalog_jobs for select to authenticated using(true);
revoke all on public.wc_wix_catalog_jobs,public.wc_wix_catalog_products from public,anon,authenticated;
grant select on public.wc_wix_catalog_jobs,public.wc_wix_catalog_products to authenticated;
grant all on public.wc_wix_catalog_jobs,public.wc_wix_catalog_products to service_role;

create function public.wc_wix_catalog_begin(p_site text,p_restart boolean default false)
returns public.wc_wix_catalog_jobs language plpgsql security definer set search_path=public as $$
declare j wc_wix_catalog_jobs;
begin
 if nullif(btrim(p_site),'') is null then raise exception 'Invalid site';end if;
 -- Match the catalogue/cost registration lock used by order sync.
 perform pg_advisory_xact_lock(20260907,8);
 if exists(select 1 from wc_wix_catalog_jobs where site_id<>p_site) then raise exception 'Catalogue belongs to a different Wix site';end if;
 insert into wc_wix_catalog_jobs(site_id) values(p_site) on conflict do nothing;
 select * into j from wc_wix_catalog_jobs where site_id=p_site for update;
 -- Explicit restart changes the run token, fencing out in-flight pages from the old run.
 if p_restart then
  update wc_wix_catalog_jobs set run_id=gen_random_uuid(),next_offset=0,expected_total=null,complete=false,updated_at=now() where site_id=p_site returning * into j;
 end if;
 return j;
end $$;

create function public.wc_wix_catalog_page(p_site text,p_run uuid,p_offset integer,p_total integer,p_rows jsonb)
returns public.wc_wix_catalog_jobs language plpgsql security definer set search_path=public as $$
declare j wc_wix_catalog_jobs; r jsonb; p jsonb; pid uuid; n integer; wid text;
begin
 perform pg_advisory_xact_lock(20260907,8);
 select * into j from wc_wix_catalog_jobs where site_id=p_site for update;
 if not found or j.run_id<>p_run then raise exception 'Catalogue run changed';end if;
 if j.next_offset<>p_offset or j.complete then return j;end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or p_total is null or p_total<0 then raise exception 'Invalid catalogue page';end if;
 n=jsonb_array_length(p_rows);
 if n>25 or p_offset+n>p_total or (n=0 and p_offset<p_total) then raise exception 'Invalid catalogue count';end if;
 if j.expected_total is not null and j.expected_total<>p_total then raise exception 'Wix catalogue total changed; review required';end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  p=r->'product'; wid=p->>'id'; pid=null;
  if nullif(wid,'') is null or nullif(btrim(p->>'name'),'') is null then raise exception 'Invalid product';end if;
  if exists(select 1 from wc_wix_catalog_products where wix_product_id=wid and run_id=p_run) then raise exception 'Repeated Wix product in different page';end if;
  select id into pid from wc_shipping_products where wix_product_id=wid;
  if pid is null then
   if exists(select 1 from wc_shipping_products where wix_product_id is null and lower(btrim(product_name))=lower(btrim(p->>'name'))) then
    raise exception 'Unlinked name candidate requires review';
   end if;
   insert into wc_shipping_products(wix_product_id,product_name,product_type) values(wid,p->>'name','Other')
    on conflict(wix_product_id) do update set product_name=excluded.product_name returning id into pid;
  else
   update wc_shipping_products set product_name=p->>'name',updated_at=now() where id=pid;
  end if;
  insert into wc_wix_catalog_products(wix_product_id,site_id,shipping_product_id,run_id,source_product,source_json)
   values(wid,p_site,pid,p_run,p,r->>'source_json')
   on conflict(wix_product_id) do update set source_product=excluded.source_product,source_json=excluded.source_json,run_id=excluded.run_id,synced_at=now();
 end loop;
 update wc_wix_catalog_jobs set next_offset=p_offset+n,expected_total=p_total,complete=(p_offset+n=p_total),updated_at=now()
  where site_id=p_site returning * into j;
 return j;
end $$;
revoke all on function public.wc_wix_catalog_begin(text,boolean),public.wc_wix_catalog_page(text,uuid,integer,integer,jsonb) from public,anon,authenticated;
grant execute on function public.wc_wix_catalog_begin(text,boolean),public.wc_wix_catalog_page(text,uuid,integer,integer,jsonb) to service_role;
