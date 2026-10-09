-- A Hub manager decides which imported reviews can appear on the storefront.
-- Fera re-imports omit these local fields, so a rerun cannot reverse the decision.
alter table public.wc_fera_reviews
  add column is_published boolean not null default false,
  add column public_author_name text,
  add column published_at timestamptz;

alter table public.wc_fera_reviews
  add constraint wc_fera_public_author_name_length
  check (public_author_name is null or length(public_author_name) <= 100);

create index wc_fera_reviews_published_idx
  on public.wc_fera_reviews(reviewed_at desc, id)
  where is_published;

grant update (is_published, public_author_name, published_at, shipping_product_id)
  on public.wc_fera_reviews to authenticated;
create policy fera_reviews_manager_update on public.wc_fera_reviews
  for update to authenticated
  using (public.wc_is_hub_manager())
  with check (public.wc_is_hub_manager());

-- Reviews already approved by Fera are visible on the existing Wix storefront.
-- Preserve that editorial decision for this initial, owner-private test site.
update public.wc_fera_reviews
  set is_published = true, published_at = now()
  where lower(coalesce(source_state, '')) in ('approved', 'published');

comment on column public.wc_fera_reviews.public_author_name is
  'Manager-approved display name only. Never derive this from private source_data automatically.';

notify pgrst, 'reload schema';
