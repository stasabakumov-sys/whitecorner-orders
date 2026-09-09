-- Private, downloadable drawings belong to a saved box, not a courier booking.
create table public.wc_box_drawings (
 profile_signature text not null references public.wc_delivery_packaging_profiles(signature) on delete cascade,
 box_index integer not null check(box_index>=0),
 box_snapshot jsonb not null check(jsonb_typeof(box_snapshot)='object'),
 object_path text not null unique,
 filename text not null check(length(filename) between 1 and 255),
 size_bytes integer not null check(size_bytes between 1 and 1048576),
 revision uuid not null default gen_random_uuid(),
 updated_at timestamptz not null default now(),
 primary key(profile_signature,box_index)
);
alter table public.wc_box_drawings enable row level security;
revoke all on public.wc_box_drawings from public,anon,authenticated;
grant select on public.wc_box_drawings to authenticated;
create policy box_drawings_read on public.wc_box_drawings for select to authenticated using(true);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('box-drawings','box-drawings',false,1048576,array['application/octet-stream']);
create policy box_drawings_upload on storage.objects for insert to authenticated
with check(bucket_id='box-drawings' and (storage.foldername(name))[1]=auth.uid()::text);
create policy box_drawings_download on storage.objects for select to authenticated
using(bucket_id='box-drawings');
-- Uploaded files are immutable. Replacement uses a new path; only unlinked files can be removed.
create policy box_drawings_cleanup on storage.objects for delete to authenticated
using(bucket_id='box-drawings' and not exists(select 1 from public.wc_box_drawings d where d.object_path=name));

create function public.wc_attach_box_drawing(p_signature text,p_index integer,p_box jsonb,p_path text,p_filename text,p_size integer,p_expected uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare boxes jsonb; current_revision uuid; result wc_box_drawings;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 select packages into boxes from wc_delivery_packaging_profiles where signature=p_signature for update;
 if not found or p_index is null or p_index<0 or p_box is null or boxes->p_index is distinct from p_box then raise exception 'Box changed. Refresh the packaging profile before uploading.';end if;
 select revision into current_revision from wc_box_drawings where profile_signature=p_signature and box_index=p_index;
 if current_revision is distinct from p_expected then raise exception 'Drawing changed. Refresh before replacing it.';end if;
 if p_path is null or split_part(p_path,'/',1)<>auth.uid()::text or not exists(select 1 from storage.objects where bucket_id='box-drawings' and name=p_path and (metadata->>'size')::bigint=p_size) then raise exception 'Uploaded file not found or size mismatch';end if;
 insert into wc_box_drawings(profile_signature,box_index,box_snapshot,object_path,filename,size_bytes)
 values(p_signature,p_index,p_box,p_path,p_filename,p_size)
 on conflict(profile_signature,box_index) do update set box_snapshot=excluded.box_snapshot,object_path=excluded.object_path,filename=excluded.filename,size_bytes=excluded.size_bytes,revision=gen_random_uuid(),updated_at=now()
 returning * into result;
 return to_jsonb(result);
end $$;
revoke all on function public.wc_attach_box_drawing(text,integer,jsonb,text,text,integer,uuid) from public,anon;
grant execute on function public.wc_attach_box_drawing(text,integer,jsonb,text,text,integer,uuid) to authenticated;
