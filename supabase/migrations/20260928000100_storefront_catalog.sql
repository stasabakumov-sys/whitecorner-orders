-- A deliberately separate, allowlisted read model. Operational tables keep their RLS.
create table public.wc_wix_catalog_collections (
 id text primary key,
 source_collection jsonb not null check(jsonb_typeof(source_collection)='object'),
 synced_at timestamptz not null default now()
);
create table public.wc_catalog_media (
 source_url text primary key,
 bucket text not null check(bucket in ('catalog-media','catalog-source-media')),
 path text not null,
 content_type text not null,
 bytes bigint not null check(bytes>0),
 sha256 text not null,
 copied_at timestamptz not null default now(),
 unique(bucket,path)
);
create table public.wc_storefront_catalog (
 id text primary key check(id='live'),
 payload jsonb not null check(jsonb_typeof(payload)='object' and payload->>'schemaVersion'='1'
   and jsonb_typeof(payload->'products')='array' and jsonb_typeof(payload->'categories')='array'),
 published_at timestamptz not null default now()
);
alter table public.wc_wix_catalog_collections enable row level security;
alter table public.wc_catalog_media enable row level security;
alter table public.wc_storefront_catalog enable row level security;
revoke all on public.wc_wix_catalog_collections,public.wc_catalog_media,public.wc_storefront_catalog from public,anon,authenticated;
grant select on public.wc_wix_catalog_collections,public.wc_catalog_media to authenticated;
create policy collections_staff_read on public.wc_wix_catalog_collections for select to authenticated using(true);
create policy media_staff_read on public.wc_catalog_media for select to authenticated using(true);
grant select on public.wc_storefront_catalog to anon,authenticated;
create policy storefront_read on public.wc_storefront_catalog for select to anon,authenticated using(id='live');
grant all on public.wc_wix_catalog_collections,public.wc_catalog_media,public.wc_storefront_catalog to service_role;
-- Only product media from visible products is copied to the public bucket.
-- Hidden catalogue assets use a separate private bucket. No drawing/shipping bucket changes.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('catalog-media','catalog-media',true,52428800,array['image/jpeg','image/png','image/webp','image/gif','video/mp4']),
 ('catalog-source-media','catalog-source-media',false,52428800,array['image/jpeg','image/png','image/webp','image/gif','video/mp4']);
