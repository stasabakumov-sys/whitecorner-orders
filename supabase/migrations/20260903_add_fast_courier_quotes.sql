alter table public.wc_shipments
  add column if not exists courier_provider text,
  add column if not exists courier_order_id text,
  add column if not exists quote_request jsonb,
  add column if not exists courier_quotes jsonb,
  add column if not exists quoted_at timestamptz,
  add column if not exists selected_quote_id text,
  add column if not exists selected_quote jsonb,
  add column if not exists packages_approved_at timestamptz;

alter table public.wc_shipments drop constraint if exists wc_shipments_status_check;
alter table public.wc_shipments add constraint wc_shipments_status_check check (status in (
  'Packaging Review',
  'Ready to Quote',
  'Quoted',
  'Quote Selected',
  'Shipping Booked',
  'In Transit',
  'Delivered'
));

create index if not exists wc_shipments_courier_order_idx
  on public.wc_shipments(courier_provider, courier_order_id);

comment on column public.wc_shipments.courier_order_id is
  'Fast Courier draft orderId returned by POST /api/quotes; retained for steps 2 and 3.';
