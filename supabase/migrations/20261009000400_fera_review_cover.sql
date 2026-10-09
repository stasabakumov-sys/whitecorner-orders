-- Hub owns the public cover choice. Fera imports keep their original media rows.
alter table public.wc_fera_review_media
  add column is_cover boolean not null default false;

alter table public.wc_fera_review_media
  add constraint wc_fera_review_cover_photo_check
  check (not is_cover or (coalesce(media_type = 'photo', false) and storage_path is not null));

create unique index wc_fera_review_one_cover_idx
  on public.wc_fera_review_media(review_id) where is_cover;

create or replace function public.wc_set_fera_review_cover(p_review_id uuid, p_media_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.wc_is_hub_manager() then
    raise exception 'Manager access required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.wc_fera_review_media
    where id = p_media_id and review_id = p_review_id
      and media_type = 'photo' and storage_path is not null
  ) then
    raise exception 'Select an available photo from this review' using errcode = '22023';
  end if;

  update public.wc_fera_review_media set is_cover = false
    where review_id = p_review_id and is_cover;
  update public.wc_fera_review_media set is_cover = true
    where id = p_media_id and review_id = p_review_id;
end;
$$;

revoke all on function public.wc_set_fera_review_cover(uuid,uuid) from public, anon;
grant execute on function public.wc_set_fera_review_cover(uuid,uuid) to authenticated;
