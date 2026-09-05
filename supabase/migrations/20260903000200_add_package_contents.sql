alter table public.wc_shipment_packages
  add column if not exists contents jsonb not null default '[]'::jsonb;

alter table public.wc_shipping_packages
  add column if not exists contents jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'wc_shipment_packages_contents_array_check'
  ) then
    alter table public.wc_shipment_packages
      add constraint wc_shipment_packages_contents_array_check
      check (jsonb_typeof(contents) = 'array');
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'wc_shipping_packages_contents_array_check'
  ) then
    alter table public.wc_shipping_packages
      add constraint wc_shipping_packages_contents_array_check
      check (jsonb_typeof(contents) = 'array');
  end if;
end $$;

comment on column public.wc_shipment_packages.contents is
  'Components packed in this shipment package. A product may appear in multiple packages and one package may contain components from multiple products.';

comment on column public.wc_shipping_packages.contents is
  'Reusable component layout for this saved product package profile.';
