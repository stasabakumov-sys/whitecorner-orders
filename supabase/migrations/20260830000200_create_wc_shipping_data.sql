create extension if not exists pgcrypto;

create table if not exists public.wc_shipping_products (
  id uuid primary key default gen_random_uuid(),
  wix_product_id text unique,
  product_name text not null,
  product_type text not null default 'Other',
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists wc_shipping_products_name_ci_uq
  on public.wc_shipping_products (lower(product_name));

create table if not exists public.wc_shipping_packages (
  id uuid primary key default gen_random_uuid(),
  shipping_product_id uuid not null references public.wc_shipping_products(id) on delete cascade,
  package_no integer not null,
  package_name text,
  length_mm numeric,
  width_mm numeric,
  height_mm numeric,
  weight_kg numeric,
  quantity integer not null default 1 check (quantity > 0),
  source_type text not null default 'Base' check (source_type in ('Base','Option','Add-on')),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shipping_product_id, source_type, package_no)
);

create table if not exists public.wc_shipping_rules (
  id uuid primary key default gen_random_uuid(),
  shipping_product_id uuid references public.wc_shipping_products(id) on delete cascade,
  rule_type text not null check (rule_type in ('Option','Add-on')),
  match_name text not null,
  match_value text,
  effect_type text not null default 'No effect' check (effect_type in ('No effect','Add package','Modify package','Replace profile')),
  package_count_delta integer not null default 0,
  package_name text,
  length_mm numeric,
  width_mm numeric,
  height_mm numeric,
  weight_kg numeric,
  active boolean not null default true,
  exact_match_required boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wc_shipping_rules_product_idx on public.wc_shipping_rules(shipping_product_id);
create index if not exists wc_shipping_rules_match_idx on public.wc_shipping_rules(rule_type, lower(match_name));

create or replace view public.wc_shipping_product_summary as
select
  p.id,
  p.wix_product_id,
  p.product_name,
  p.product_type,
  p.active,
  count(pkg.id) filter (where pkg.active and pkg.source_type = 'Base') as base_packages,
  coalesce(sum(pkg.quantity) filter (where pkg.active and pkg.source_type = 'Base'),0) as base_package_units,
  coalesce(sum(pkg.weight_kg * pkg.quantity) filter (where pkg.active and pkg.source_type = 'Base' and pkg.weight_kg is not null),0) as known_base_weight_kg,
  count(pkg.id) filter (
    where pkg.active and pkg.source_type = 'Base'
      and (pkg.length_mm is null or pkg.width_mm is null or pkg.height_mm is null or pkg.weight_kg is null)
  ) as incomplete_base_packages
from public.wc_shipping_products p
left join public.wc_shipping_packages pkg on pkg.shipping_product_id = p.id
group by p.id;

alter table public.wc_shipping_products enable row level security;
alter table public.wc_shipping_packages enable row level security;
alter table public.wc_shipping_rules enable row level security;

drop policy if exists wc_shipping_products_auth_all on public.wc_shipping_products;
create policy wc_shipping_products_auth_all on public.wc_shipping_products
  for all to authenticated using (true) with check (true);

drop policy if exists wc_shipping_packages_auth_all on public.wc_shipping_packages;
create policy wc_shipping_packages_auth_all on public.wc_shipping_packages
  for all to authenticated using (true) with check (true);

drop policy if exists wc_shipping_rules_auth_all on public.wc_shipping_rules;
create policy wc_shipping_rules_auth_all on public.wc_shipping_rules
  for all to authenticated using (true) with check (true);

-- Initial products already discussed. Wix IDs can be attached later without changing the packing model.
insert into public.wc_shipping_products (product_name, product_type, notes)
values
  ('Essential Cart - Plywood Mobile Cart - Plywood Mobile Bar', 'Cart', 'Base packing confirmed: 3 boxes.'),
  ('MDF Mobile Bar Cart with Decorative Wheels – Foldable Serving Cart', 'Cart', 'Base packing confirmed: 3 boxes.')
on conflict (lower(product_name)) do nothing;

-- Three base boxes for Essential Cart. Dimensions/weights intentionally left blank until measured.
with p as (
  select id from public.wc_shipping_products
  where lower(product_name)=lower('Essential Cart - Plywood Mobile Cart - Plywood Mobile Bar')
)
insert into public.wc_shipping_packages (shipping_product_id, package_no, package_name, source_type, notes)
select p.id, x.n, 'Base box '||x.n, 'Base', 'Dimensions and weight pending.'
from p cross join (values (1),(2),(3)) as x(n)
on conflict (shipping_product_id, source_type, package_no) do nothing;

-- Three base boxes for decorative-wheel MDF cart.
with p as (
  select id from public.wc_shipping_products
  where lower(product_name)=lower('MDF Mobile Bar Cart with Decorative Wheels – Foldable Serving Cart')
)
insert into public.wc_shipping_packages (shipping_product_id, package_no, package_name, source_type, notes)
select p.id, x.n, 'Base box '||x.n, 'Base', 'Dimensions and weight pending.'
from p cross join (values (1),(2),(3)) as x(n)
on conflict (shipping_product_id, source_type, package_no) do nothing;

-- Rules for the decorative-wheel MDF cart.
with p as (
  select id from public.wc_shipping_products
  where lower(product_name)=lower('MDF Mobile Bar Cart with Decorative Wheels – Foldable Serving Cart')
)
insert into public.wc_shipping_rules
  (shipping_product_id, rule_type, match_name, match_value, effect_type, package_count_delta, package_name, exact_match_required, notes)
select p.id, r.rule_type, r.match_name, r.match_value, r.effect_type, r.delta, r.package_name, r.exact_match_required, r.notes
from p
cross join (values
  ('Option','Internal Shelf','Yes','Add package',1,'Internal shelf box',true,'Confirmed: shelf selected as a product option adds one box.'),
  ('Add-on','Umbrella hole for the Mobile Cart (only as an addition to the main order)',null,'No effect',0,null,true,'Confirmed: cut-out only; no extra package.'),
  ('Add-on','Back panel with a pair of closable doors',null,'Add package',1,'Back panel / doors box',true,'Confirmed: adds one box.'),
  ('Add-on','Customisation of the tabletop and shelf height',null,'No effect',0,null,true,'Confirmed: customisation only; no extra package.'),
  ('Add-on','Shelf add-on',null,'Add package',1,'Shelf box',false,'Placeholder until the exact Wix add-on product name is captured. Keep inactive until matched exactly.')
) as r(rule_type,match_name,match_value,effect_type,delta,package_name,exact_match_required,notes)
on conflict do nothing;

-- Disable the placeholder shelf rule until exact Wix name is known.
update public.wc_shipping_rules
set active=false
where match_name='Shelf add-on' and exact_match_required=false;
