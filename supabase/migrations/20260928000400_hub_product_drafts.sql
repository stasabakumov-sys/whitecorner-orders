-- Hub owns new product drafts. A draft is neither a Wix product nor a public storefront product.
create table public.wc_hub_product_drafts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 80),
  description text not null default '' check (length(description) <= 8000),
  ribbon text not null default '' check (length(ribbon) <= 30),
  base_price_aud numeric(12,2) not null check (base_price_aud >= 0),
  sku text not null default '' check (length(sku) <= 40),
  category_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(category_ids) = 'array'),
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  variants jsonb not null default '[]'::jsonb check (jsonb_typeof(variants) = 'array' and jsonb_array_length(variants) between 1 and 1000),
  media jsonb not null default '[]'::jsonb check (jsonb_typeof(media) = 'array'),
  status text not null default 'draft' check (status in ('draft','publishing','sync_error','published')),
  wix_product_id text unique,
  wix_visible_at timestamptz,
  storefront_published_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hub_product_published_only_after_both check (
    status <> 'published' or
    (wix_product_id is not null and wix_visible_at is not null and storefront_published_at is not null)
  )
);

create index wc_hub_product_drafts_created_at_idx on public.wc_hub_product_drafts(created_at desc);
alter table public.wc_hub_product_drafts enable row level security;
revoke all on public.wc_hub_product_drafts from public, anon, authenticated;
grant select on public.wc_hub_product_drafts to authenticated;
grant insert(name,description,ribbon,base_price_aud,sku,category_ids,options,variants,media)
  on public.wc_hub_product_drafts to authenticated;
grant update(name,description,ribbon,base_price_aud,sku,category_ids,options,variants,media)
  on public.wc_hub_product_drafts to authenticated;
grant all on public.wc_hub_product_drafts to service_role;
create policy hub_product_drafts_manager_read on public.wc_hub_product_drafts
  for select to authenticated using (public.wc_is_hub_manager());
create policy hub_product_drafts_manager_insert on public.wc_hub_product_drafts
  for insert to authenticated with check (public.wc_is_hub_manager() and status = 'draft' and wix_product_id is null);
create policy hub_product_drafts_manager_update on public.wc_hub_product_drafts
  for update to authenticated using (public.wc_is_hub_manager() and status = 'draft')
  with check (public.wc_is_hub_manager() and status = 'draft' and wix_product_id is null);

create function public.wc_hub_product_draft_touch() returns trigger language plpgsql set search_path=public as $$
begin
  new.updated_at = now();
  return new;
end $$;
create trigger wc_hub_product_draft_touch before update on public.wc_hub_product_drafts
  for each row execute function public.wc_hub_product_draft_touch();

-- Files stay private until a later, explicitly authorized publishing flow copies them to public media.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('hub-product-drafts','hub-product-drafts',false,52428800,
  array['image/jpeg','image/png','image/webp','video/mp4','video/webm'])
on conflict (id) do nothing;
create policy hub_product_draft_media_read on storage.objects for select to authenticated
  using (bucket_id = 'hub-product-drafts' and public.wc_is_hub_manager());
create policy hub_product_draft_media_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'hub-product-drafts' and public.wc_is_hub_manager());
create policy hub_product_draft_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'hub-product-drafts' and public.wc_is_hub_manager());
