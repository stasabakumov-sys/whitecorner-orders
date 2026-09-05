create table if not exists public.wc_address_issues (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.wc_orders(id) on delete cascade,
  order_number text,
  customer_name text,
  address_input jsonb not null default '{}'::jsonb,
  address_text text,
  issue_types text[] not null default '{}',
  issue_summary text,
  suggested_address text,
  suggested_postcode text,
  suggested_suburb text,
  suggested_state text,
  google_place_id text,
  validation_status text not null default 'New' check (validation_status in ('New','Reviewed','Ignored')),
  checked_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wc_address_issues_status_idx on public.wc_address_issues(validation_status);
create index if not exists wc_address_issues_order_number_idx on public.wc_address_issues(order_number);

alter table public.wc_address_issues enable row level security;

drop policy if exists "Authenticated users can read address issues" on public.wc_address_issues;
create policy "Authenticated users can read address issues"
on public.wc_address_issues for select
to authenticated
using (true);

drop policy if exists "Authenticated users can update address issues" on public.wc_address_issues;
create policy "Authenticated users can update address issues"
on public.wc_address_issues for update
to authenticated
using (true)
with check (true);
