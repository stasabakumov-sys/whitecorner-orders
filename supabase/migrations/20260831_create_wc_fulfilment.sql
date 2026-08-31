create extension if not exists pgcrypto;

create table if not exists public.wc_fulfilment (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.wc_orders(id) on delete cascade,
  route text not null check (route in ('Pickup','Shipping')),
  status text not null check (status in ('Awaiting Pickup','Shipping Preparation','Shipping Booked','Fulfilled')),
  ready_at timestamptz not null default now(),
  pickup_email_status text not null default 'Not required' check (pickup_email_status in ('Not required','Pending integration','Sent')),
  pickup_email_sent_at timestamptz,
  shipping_booked_at timestamptz,
  fulfilled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wc_fulfilment_status_idx on public.wc_fulfilment(status);
create index if not exists wc_fulfilment_route_idx on public.wc_fulfilment(route);

alter table public.wc_fulfilment enable row level security;

drop policy if exists wc_fulfilment_auth_select on public.wc_fulfilment;
create policy wc_fulfilment_auth_select on public.wc_fulfilment for select to authenticated using (true);

drop policy if exists wc_fulfilment_auth_insert on public.wc_fulfilment;
create policy wc_fulfilment_auth_insert on public.wc_fulfilment for insert to authenticated with check (true);

drop policy if exists wc_fulfilment_auth_update on public.wc_fulfilment;
create policy wc_fulfilment_auth_update on public.wc_fulfilment for update to authenticated using (true) with check (true);
