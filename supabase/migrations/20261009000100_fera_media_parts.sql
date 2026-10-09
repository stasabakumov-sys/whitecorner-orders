-- Preserve oversized Fera videos byte-for-byte as ordered private Storage parts.
-- storage_path points at the first part when storage_parts is populated.
alter table public.wc_fera_review_media
  add column storage_parts jsonb not null default '[]'::jsonb
  check (jsonb_typeof(storage_parts) = 'array');

comment on column public.wc_fera_review_media.storage_parts is
  'Ordered private Storage part paths, byte counts and SHA-256 values for oversized original media.';

notify pgrst, 'reload schema';
