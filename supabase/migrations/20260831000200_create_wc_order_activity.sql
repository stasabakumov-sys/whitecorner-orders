create extension if not exists pgcrypto;

create table if not exists public.wc_order_activity (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.wc_orders(id) on delete cascade,
  production_unit_id uuid references public.wc_production_units(id) on delete set null,
  activity_type text not null check (activity_type in ('note','status_change')),
  message text,
  old_status text,
  new_status text,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists wc_order_activity_order_created_idx
  on public.wc_order_activity(order_id, created_at desc);

create index if not exists wc_order_activity_unit_idx
  on public.wc_order_activity(production_unit_id);

alter table public.wc_order_activity enable row level security;

drop policy if exists wc_order_activity_auth_select on public.wc_order_activity;
create policy wc_order_activity_auth_select
  on public.wc_order_activity
  for select
  to authenticated
  using (true);

drop policy if exists wc_order_activity_auth_insert on public.wc_order_activity;
create policy wc_order_activity_auth_insert
  on public.wc_order_activity
  for insert
  to authenticated
  with check (true);
