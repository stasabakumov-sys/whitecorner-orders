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

  -- White Corner fields. Wix sync MUST NOT overwrite these.
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

  -- White Corner item fields. Preserved on Wix refresh.
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

-- One record = one physical product unit on Production Board.
-- Example: Wix quantity 4 => unit_index 1,2,3,4 with independent statuses.
create table if not exists public.wc_production_units (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.wc_order_items(id) on delete cascade,
  unit_index integer not null check (unit_index > 0),
  production_status text not null default 'New'
    check (production_status in ('New','CNC','Assembly','Painting','Packing','Ready')),
  production_comment text,
  priority integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(order_item_id, unit_index)
);

create index if not exists wc_orders_number_idx on public.wc_orders(order_number);
create index if not exists wc_orders_fulfillment_idx on public.wc_orders(fulfillment_status);
create index if not exists wc_order_items_order_idx on public.wc_order_items(order_id);
create index if not exists wc_production_units_item_idx on public.wc_production_units(order_item_id);
create index if not exists wc_production_units_status_idx on public.wc_production_units(production_status);

alter table public.wc_orders enable row level security;
alter table public.wc_order_items enable row level security;
alter table public.wc_production_units enable row level security;

-- App data is available only to signed-in White Corner users.
drop policy if exists "wc_orders_authenticated_all" on public.wc_orders;
create policy "wc_orders_authenticated_all"
on public.wc_orders for all to authenticated using (true) with check (true);

drop policy if exists "wc_order_items_authenticated_all" on public.wc_order_items;
create policy "wc_order_items_authenticated_all"
on public.wc_order_items for all to authenticated using (true) with check (true);

drop policy if exists "wc_production_units_authenticated_all" on public.wc_production_units;
create policy "wc_production_units_authenticated_all"
on public.wc_production_units for all to authenticated using (true) with check (true);

create or replace function public.wc_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists wc_orders_set_updated_at on public.wc_orders;
create trigger wc_orders_set_updated_at before update on public.wc_orders
for each row execute function public.wc_set_updated_at();

drop trigger if exists wc_order_items_set_updated_at on public.wc_order_items;
create trigger wc_order_items_set_updated_at before update on public.wc_order_items
for each row execute function public.wc_set_updated_at();

drop trigger if exists wc_production_units_set_updated_at on public.wc_production_units;
create trigger wc_production_units_set_updated_at before update on public.wc_production_units
for each row execute function public.wc_set_updated_at();
