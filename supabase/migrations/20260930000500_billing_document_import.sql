-- Additive, private Wix document archive. Wix remains the imported source of truth.
begin;
create table public.wc_billing_import_runs (
  id uuid primary key default gen_random_uuid(),
  site_id text not null,
  kind text not null check (kind in ('invoice','receipt')),
  cursor text,
  saved_count integer not null default 0 check (saved_count >= 0),
  scan_complete boolean not null default false,
  started_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default now(),
  started_by uuid not null references auth.users(id),
  last_error text
);
create index wc_billing_runs_latest on public.wc_billing_import_runs(site_id,kind,started_at desc);
create table public.wc_billing_documents (
  id uuid primary key default gen_random_uuid(),
  site_id text not null,
  kind text not null check (kind in ('invoice','receipt')),
  wix_id text not null,
  source_hash text not null check (source_hash ~ '^[a-f0-9]{64}$'),
  number text,
  customer_name text,
  wix_order_id text,
  currency text,
  total text,
  paid text,
  status text not null,
  issued_at timestamptz,
  source_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  unique(site_id,kind,wix_id)
);
create index wc_billing_order_link on public.wc_billing_documents(wix_order_id);
create table public.wc_billing_document_versions (
  document_id uuid not null references public.wc_billing_documents(id),
  source_hash text not null check (source_hash ~ '^[a-f0-9]{64}$'),
  source_json jsonb not null check (jsonb_typeof(source_json) = 'object'),
  imported_at timestamptz not null default now(),
  pdf_path text,
  pdf_sha256 text check (pdf_sha256 ~ '^[a-f0-9]{64}$'),
  pdf_bytes integer check (pdf_bytes > 0 and pdf_bytes <= 20971520),
  pdf_saved_at timestamptz,
  pdf_error text,
  pdf_attempted_at timestamptz,
  primary key(document_id,source_hash),
  check ((pdf_path is null and pdf_sha256 is null and pdf_bytes is null and pdf_saved_at is null)
    or (pdf_path is not null and pdf_sha256 is not null and pdf_bytes is not null and pdf_saved_at is not null))
);
create table public.wc_billing_import_items (
  run_id uuid not null references public.wc_billing_import_runs(id),
  document_id uuid not null,
  source_hash text not null,
  primary key(run_id,document_id),
  foreign key(document_id,source_hash) references public.wc_billing_document_versions(document_id,source_hash)
);
-- No direct client writes and no anonymous access, including raw customer snapshots.
do $$ declare t text; begin
  foreach t in array array['wc_billing_import_runs','wc_billing_documents','wc_billing_document_versions','wc_billing_import_items'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('grant all on public.%I to service_role',t);
    execute format('create policy billing_member_read on public.%I for select to authenticated using (public.wc_is_active_hub_member())',t);
  end loop;
end $$;

create view public.wc_billing_document_list with (security_invoker=true) as
select d.*, v.pdf_path is not null as pdf_saved,v.pdf_error,v.pdf_saved_at,
  o.id as hub_order_id,o.order_number
from public.wc_billing_documents d
join public.wc_billing_document_versions v on v.document_id=d.id and v.source_hash=d.source_hash
left join public.wc_orders o on o.wix_order_id=d.wix_order_id;
revoke all on public.wc_billing_document_list from public,anon,authenticated;
grant select on public.wc_billing_document_list to authenticated,service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('billing-documents','billing-documents',false,20971520,array['application/pdf']);
-- Intersect any broad policies with a server-only archive boundary.
create policy billing_archive_private on storage.objects as restrictive for all to anon,authenticated
using (bucket_id <> 'billing-documents') with check (bucket_id <> 'billing-documents');

create function public.wc_billing_begin(p_site text,p_kind text,p_actor uuid,p_restart boolean default false)
returns public.wc_billing_import_runs language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.wc_billing_import_runs;
begin
  if nullif(p_site,'') is null or p_kind not in ('invoice','receipt') or p_kind is null then raise exception 'Invalid billing source'; end if;
  if not exists(select 1 from public.wc_hub_members where user_id=p_actor and active and role='manager') then raise exception 'Manager required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('billing:'||p_site||':'||p_kind,0));
  select * into r from public.wc_billing_import_runs where site_id=p_site and kind=p_kind order by started_at desc limit 1;
  if r.id is not null and not p_restart then return r; end if;
  insert into public.wc_billing_import_runs(site_id,kind,started_by) values(p_site,p_kind,p_actor) returning * into r;
  return r;
end $$;

-- One transaction saves every row and advances the cursor. Replays cannot double count.
create function public.wc_billing_save_page(p_run uuid,p_cursor text,p_next text,p_complete boolean,p_rows jsonb)
returns public.wc_billing_import_runs language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.wc_billing_import_runs; item jsonb; doc uuid; n integer;
begin
  select * into r from public.wc_billing_import_runs where id=p_run;
  if r.id is null then raise exception 'Billing scan not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('billing:'||r.site_id||':'||r.kind,0));
  select * into r from public.wc_billing_import_runs where id=p_run for update;
  if exists(select 1 from public.wc_billing_import_runs where site_id=r.site_id and kind=r.kind and started_at>r.started_at) then
    raise exception 'A newer billing scan has started; resume that scan';
  end if;
  if r.id is null or r.scan_complete or r.cursor is distinct from p_cursor then raise exception 'Billing scan changed; reload before resuming'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or p_complete is null then raise exception 'Invalid billing page'; end if;
  n:=jsonb_array_length(p_rows);
  if n>50 or (not p_complete and (n=0 or nullif(p_next,'') is null or p_next is not distinct from p_cursor))
     or (p_complete and p_next is not null) then raise exception 'Invalid billing pagination'; end if;
  if (select count(distinct v->>'wix_id') from jsonb_array_elements(p_rows) v) <> n then raise exception 'Duplicate or missing document IDs'; end if;
  for item in select value from jsonb_array_elements(p_rows) loop
    if nullif(item->>'wix_id','') is null or item->>'source_hash' is null or jsonb_typeof(item->'source_json') is distinct from 'object'
       or item->'source_json'->>'id' is distinct from item->>'wix_id' then raise exception 'Invalid source snapshot'; end if;
    insert into public.wc_billing_documents(site_id,kind,wix_id,source_hash,number,customer_name,wix_order_id,currency,total,paid,status,issued_at,source_updated_at)
      values(r.site_id,r.kind,item->>'wix_id',item->>'source_hash',item->>'number',item->>'customer_name',item->>'wix_order_id',item->>'currency',item->>'total',item->>'paid',item->>'status',(item->>'issued_at')::timestamptz,(item->>'source_updated_at')::timestamptz)
      on conflict(site_id,kind,wix_id) do update set source_hash=excluded.source_hash,number=excluded.number,customer_name=excluded.customer_name,
        wix_order_id=excluded.wix_order_id,currency=excluded.currency,total=excluded.total,paid=excluded.paid,status=excluded.status,
        issued_at=excluded.issued_at,source_updated_at=excluded.source_updated_at,synced_at=now()
      returning id into doc;
    insert into public.wc_billing_document_versions(document_id,source_hash,source_json)
      values(doc,item->>'source_hash',item->'source_json') on conflict do nothing;
    -- A repeated ID across pages is an inconsistent scan, not an extra document.
    insert into public.wc_billing_import_items(run_id,document_id,source_hash) values(r.id,doc,item->>'source_hash');
  end loop;
  if (select count(*) from public.wc_billing_import_items where run_id=r.id) <> r.saved_count+n then raise exception 'Saved billing count mismatch'; end if;
  update public.wc_billing_import_runs set cursor=p_next,saved_count=saved_count+n,scan_complete=p_complete,updated_at=now(),last_error=null where id=r.id returning * into r;
  return r;
end $$;
revoke all on function public.wc_billing_begin(text,text,uuid,boolean),public.wc_billing_save_page(uuid,text,text,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.wc_billing_begin(text,text,uuid,boolean),public.wc_billing_save_page(uuid,text,text,boolean,jsonb) to service_role;
commit;
