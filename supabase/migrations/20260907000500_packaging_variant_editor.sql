-- Metadata for standalone, one-product exact-option profiles. No order backfill.
alter table public.wc_delivery_packaging_profiles
 add column shipping_product_id uuid references public.wc_shipping_products(id),
 add column template_item jsonb;
create index delivery_profiles_shipping_product on public.wc_delivery_packaging_profiles(shipping_product_id);
-- Existing read-only authenticated RLS and service-role writes are retained.
