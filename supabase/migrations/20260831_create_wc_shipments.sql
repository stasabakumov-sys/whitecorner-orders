create extension if not exists pgcrypto;

create table if not exists public.wc_shipments (
  id uuid primary key default gen_random_uuid(),
  fulfilment_id uuid not null unique references public.wc_fulfilment(id) on delete cascade,
  order_id uuid not null unique references public.wc_orders(id) on delete cascade,
  status text not null default 'Packaging Review' check (status in ('Packaging Review','Ready to Book','Shipping Booked','In Transit','Delivered')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wc_shipment_packages (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.wc_shipments(id) on delete cascade,
  package_no integer not null,
  package_name text,
  length_mm numeric,
  width_mm numeric,
  height_mm numeric,
  weight_kg numeric,
  source_type text not null default 'Manual' check (source_type in ('Profile','Manual')),
  shipping_product_id uuid references public.wc_shipping_products(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(shipment_id, package_no)
);

create index if not exists wc_shipments_status_idx on public.wc_shipments(status);
create index if not exists wc_shipment_packages_shipment_idx on public.wc_shipment_packages(shipment_id, package_no);

alter table public.wc_shipments enable row level security;
alter table public.wc_shipment_packages enable row level security;

drop policy if exists wc_shipments_auth_all on public.wc_shipments;
create policy wc_shipments_auth_all on public.wc_shipments for all to authenticated using (true) with check (true);

drop policy if exists wc_shipment_packages_auth_all on public.wc_shipment_packages;
create policy wc_shipment_packages_auth_all on public.wc_shipment_packages for all to authenticated using (true) with check (true);
