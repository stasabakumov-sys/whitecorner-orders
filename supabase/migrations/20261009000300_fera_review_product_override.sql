-- Fera imports continue to maintain the exact source product link. A manager's
-- explicit correction lives separately, so a repeat import cannot erase it.
alter table public.wc_fera_reviews
  add column product_override_id uuid references public.wc_shipping_products(id) on delete set null;

revoke update (shipping_product_id) on public.wc_fera_reviews from authenticated;
grant update (product_override_id) on public.wc_fera_reviews to authenticated;

create index wc_fera_reviews_product_override_idx
  on public.wc_fera_reviews(product_override_id)
  where product_override_id is not null;

comment on column public.wc_fera_reviews.product_override_id is
  'Explicit Hub manager choice; supersedes the imported exact product link on the storefront.';

notify pgrst, 'reload schema';
