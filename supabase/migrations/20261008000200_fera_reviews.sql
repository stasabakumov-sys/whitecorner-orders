-- Fera is the source of imported review content. The Hub owns product links and
-- future publication decisions. A partial import never deletes existing reviews.
create table public.wc_fera_reviews (
  id uuid primary key default gen_random_uuid(),
  fera_review_id text not null unique check (length(btrim(fera_review_id)) > 0),
  subject text not null check (subject in ('product', 'store')),
  fera_product_id text,
  wix_product_id text,
  shipping_product_id uuid references public.wc_shipping_products(id) on delete set null,
  rating smallint check (rating between 1 and 5),
  title text,
  body text,
  author_display_name text,
  reviewed_at timestamptz,
  source_state text,
  verified boolean,
  media jsonb not null default '[]'::jsonb check (jsonb_typeof(media) = 'array'),
  source_data jsonb not null check (jsonb_typeof(source_data) = 'object'),
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((subject = 'store' and wix_product_id is null and shipping_product_id is null)
      or (subject = 'product'))
);

create index wc_fera_reviews_subject_product_idx
  on public.wc_fera_reviews(subject, shipping_product_id, reviewed_at desc);
create index wc_fera_reviews_wix_product_idx
  on public.wc_fera_reviews(wix_product_id) where wix_product_id is not null;

create table public.wc_fera_review_media (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.wc_fera_reviews(id) on delete cascade,
  fera_media_id text not null unique,
  source_url text not null,
  media_type text check (media_type in ('photo', 'video')),
  storage_path text unique,
  content_type text,
  bytes bigint check (bytes > 0),
  sha256 text,
  copied_at timestamptz,
  unique (review_id, source_url),
  check ((storage_path is null and copied_at is null)
      or (storage_path is not null and copied_at is not null and bytes is not null and sha256 is not null))
);

alter table public.wc_fera_reviews enable row level security;
alter table public.wc_fera_review_media enable row level security;
revoke all on public.wc_fera_reviews, public.wc_fera_review_media from public, anon, authenticated;
grant select on public.wc_fera_reviews, public.wc_fera_review_media to authenticated;
grant all on public.wc_fera_reviews, public.wc_fera_review_media to service_role;
create policy fera_reviews_manager_read on public.wc_fera_reviews
  for select to authenticated using (public.wc_is_hub_manager());
create policy fera_review_media_manager_read on public.wc_fera_review_media
  for select to authenticated using (public.wc_is_hub_manager());
create policy fera_reviews_active_member_gate on public.wc_fera_reviews
  as restrictive for all to authenticated
  using (public.wc_is_active_hub_member())
  with check (public.wc_is_active_hub_member());
create policy fera_review_media_active_member_gate on public.wc_fera_review_media
  as restrictive for all to authenticated
  using (public.wc_is_active_hub_member())
  with check (public.wc_is_active_hub_member());

-- Preserve Fera's actual photo/video formats; validate each download before
-- upload. The project's global Storage file-size limit still applies.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('fera-review-media', 'fera-review-media', false, null, null);
create policy fera_review_media_manager_storage_read on storage.objects
  for select to authenticated
  using (bucket_id = 'fera-review-media' and public.wc_is_hub_manager());
create policy fera_review_media_storage_gate on storage.objects
  as restrictive for all to authenticated
  using (bucket_id <> 'fera-review-media' or public.wc_is_hub_manager())
  with check (bucket_id <> 'fera-review-media' or public.wc_is_hub_manager());

comment on table public.wc_fera_reviews is
  'Private Fera review archive. source_data may contain customer contact details; never expose this table to the storefront.';
