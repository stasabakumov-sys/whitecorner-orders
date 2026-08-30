-- White Corner Orders backend schema
-- Run once in Supabase SQL Editor.

create table if not exists public.wc_orders (
  id uuid primary key default gen_random_uuid(),
  wix_order_id text not null unique,
  order_number text,
  wix_created_at timestamptz,
  wix_updated_at timestamptz,
  payment_status text,
  fulfillment_status text,
  wix_status text,
  archived boolean not null default false,
  currency text,
  buyer_email text,
  customer_name text,
  company text,
  phone text,
  delivery_type text,
  delivery_title text,
  delivery_address jsonb not null default '{}'::jsonb,
  buyer_note text,
  subtotal numeric,
  shipping numeric,
  tax numeric,
  discount numeric,
  total numeric,
  additional_fees numeric,
  balance_summary jsonb not null default '{}'::jsonb,
  activities jsonb not null default '[]'::jsonb,
  raw_order jsonb not null default '{}'::jsonb,
  wix_synced_at timestamptz not null default now(),

  -- White Corner fields: Wix sync MUST NOT overwrite these
  production_status text not null default 'New',
  internal_comment text,
  due_date date,
  priority integer not null default 0,
  is_hidden boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wc_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.wc_orders(id) on delete cascade,
  wix_line_item_id text,
  product_name text,
  quantity integer not null default 1,
  unit_price numeric,
  custom_line_item boolean not null default false,
  catalog_reference jsonb not null default '{}'::jsonb,
  wix_options jsonb not null default '{}'::jsonb,
  custom_text_fields jsonb not null default '{}'::jsonb,
  description_lines jsonb not null default '[]'::jsonb,
  image jsonb not null default '{}'::jsonb,
  raw_item jsonb not null default '{}'::jsonb,

  -- Production Sheet fields. These are editable and preserved on Wix refresh.
  size text,
  color text,
  tabletop text,
  additional text,
  side_shelf text,
  shelf text,
  ice_shelf text,
  hole text,
  logo text,
  production_comment text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(order_id, wix_line_item_id)
);

create index if not exists wc_orders_number_idx on public.wc_orders(order_number);
create index if not exists wc_orders_production_idx on public.wc_orders(production_status);
create index if not exists wc_orders_fulfillment_idx on public.wc_orders(fulfillment_status);
create index if not exists wc_order_items_order_idx on public.wc_order_items(order_id);

alter table public.wc_orders enable row level security;
alter table public.wc_order_items enable row level security;

-- Current app is for signed-in White Corner users only.
drop policy if exists "wc_orders_authenticated_all" on public.wc_orders;
create policy "wc_orders_authenticated_all"
on public.wc_orders
for all
to authenticated
using (true)
with check (true);

drop policy if exists "wc_order_items_authenticated_all" on public.wc_order_items;
create policy "wc_order_items_authenticated_all"
on public.wc_order_items
for all
to authenticated
using (true)
with check (true);

-- updated_at helper
create or replace function public.wc_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists wc_orders_set_updated_at on public.wc_orders;
create trigger wc_orders_set_updated_at
before update on public.wc_orders
for each row execute function public.wc_set_updated_at();

drop trigger if exists wc_order_items_set_updated_at on public.wc_order_items;
create trigger wc_order_items_set_updated_at
before update on public.wc_order_items
for each row execute function public.wc_set_updated_at();
