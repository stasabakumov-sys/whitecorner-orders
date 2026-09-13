-- Preserve existing size-only rows for explicit classification; never guess folding.
alter table public.wc_backdrop_box_drawings
 drop constraint wc_backdrop_box_drawings_size_key_check,
 add constraint wc_backdrop_box_drawings_size_key_check
 check(size_key ~ '^[1-9][0-9]{0,4}x[1-9][0-9]{0,4}(:foldable|:nonfoldable)?$');

create or replace function public.wc_save_backdrop_box_drawing(p_size text,p_path text,p_filename text,p_bytes integer,p_expected uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare previous uuid; result wc_backdrop_box_drawings; dimensions text;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 if p_size is null or p_size !~ '^[1-9][0-9]{0,4}x[1-9][0-9]{0,4}:(foldable|nonfoldable)$' then
  raise exception 'Explicit backdrop size and folding option are required. Refresh the application.';
 end if;
 dimensions:=split_part(p_size,':',1);
 if split_part(dimensions,'x',1)::int<split_part(dimensions,'x',2)::int or split_part(dimensions,'x',1)::int>10000 then raise exception 'Invalid backdrop dimensions';end if;
 -- One lock for both folding variants and the unclassified legacy row.
 perform pg_advisory_xact_lock(hashtextextended('backdrop-drawing:'||dimensions,0));
 select revision into previous from wc_backdrop_box_drawings where size_key=p_size;
 if previous is distinct from p_expected then raise exception 'Packaging drawing already exists or changed. Refresh before replacing it.';end if;
 if exists(select 1 from wc_backdrop_box_drawings where size_key=dimensions) then
  raise exception 'A drawing already exists for this size. Classify its folding option in Backdrop box drawings first.';
 end if;
 if p_path is null or split_part(p_path,'/',1)<>auth.uid()::text or not exists(select 1 from storage.objects where bucket_id='box-drawings' and name=p_path and (metadata->>'size')::bigint=p_bytes) then raise exception 'Uploaded file not found or size mismatch';end if;
 insert into wc_backdrop_box_drawings(size_key,object_path,filename,size_bytes) values(p_size,p_path,p_filename,p_bytes)
 on conflict(size_key) do update set object_path=excluded.object_path,filename=excluded.filename,size_bytes=excluded.size_bytes,revision=gen_random_uuid(),updated_at=now() returning * into result;
 return to_jsonb(result);
end $$;
revoke all on function public.wc_save_backdrop_box_drawing(text,text,text,integer,uuid) from public,anon;
grant execute on function public.wc_save_backdrop_box_drawing(text,text,text,integer,uuid) to authenticated;

create function public.wc_classify_backdrop_box_drawing(p_size text,p_folding text,p_expected uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare previous uuid; result wc_backdrop_box_drawings;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 if p_size is null or p_size !~ '^[1-9][0-9]{0,4}x[1-9][0-9]{0,4}$' or p_folding is null or p_folding not in ('foldable','nonfoldable') then raise exception 'Explicit size and folding option are required';end if;
 perform pg_advisory_xact_lock(hashtextextended('backdrop-drawing:'||p_size,0));
 select revision into previous from wc_backdrop_box_drawings where size_key=p_size;
 if previous is null or previous is distinct from p_expected then raise exception 'Drawing changed. Refresh the library before classifying it.';end if;
 if exists(select 1 from wc_backdrop_box_drawings where size_key=p_size||':'||p_folding) then raise exception 'A drawing already exists for this size and folding option. Review both files before replacing either.';end if;
 update wc_backdrop_box_drawings set size_key=p_size||':'||p_folding,revision=gen_random_uuid(),updated_at=now() where size_key=p_size returning * into result;
 return to_jsonb(result);
end $$;
revoke all on function public.wc_classify_backdrop_box_drawing(text,text,uuid) from public,anon;
grant execute on function public.wc_classify_backdrop_box_drawing(text,text,uuid) to authenticated;

-- Old clients must not create another individual backdrop attachment either.
-- Existing individual records/files remain intact for manual review.
create function public.wc_require_shared_backdrop_drawing()
returns trigger language plpgsql security definer set search_path=public as $$
declare profile jsonb; product_name text;
begin
 select to_jsonb(p) into profile from wc_delivery_packaging_profiles p where signature=new.profile_signature;
 select to_jsonb(p)->>'product_name' into product_name from wc_shipping_products p where p.id::text=profile->>'shipping_product_id';
 if coalesce(product_name,'') ~* 'backdrop' or coalesce(profile->'template_item'->>'product_name','') ~* 'backdrop' then
  raise exception 'Backdrops use one shared packaging drawing per size and folding option. Open Backdrop box drawings; an individual drawing cannot be added.';
 end if;
 return new;
end $$;
revoke all on function public.wc_require_shared_backdrop_drawing() from public,anon,authenticated;
create trigger wc_box_drawings_shared_backdrop_guard before insert or update on public.wc_box_drawings
for each row execute function public.wc_require_shared_backdrop_drawing();
