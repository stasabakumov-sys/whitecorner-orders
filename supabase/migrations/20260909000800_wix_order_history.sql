-- Historical Wix snapshots are isolated from operational order triggers.
create table public.wc_wix_order_history (
  wix_order_id text primary key,
  order_number text not null,
  wix_created_at timestamptz,
  raw_order jsonb not null check(jsonb_typeof(raw_order)='object'),
  synced_at timestamptz not null default now()
);
create index wc_wix_order_history_created on public.wc_wix_order_history(wix_created_at desc,wix_order_id);
alter table public.wc_wix_order_history enable row level security;
revoke all on public.wc_wix_order_history from anon, authenticated;
grant select on public.wc_wix_order_history to authenticated;
grant all on public.wc_wix_order_history to service_role;
create policy wix_history_read on public.wc_wix_order_history for select to authenticated using (
  not exists(select 1 from public.wc_orders o where o.wix_order_id=wc_wix_order_history.wix_order_id and (o.is_hidden or o.order_number='10242'))
);
