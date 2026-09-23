-- Laser cutting jobs belong to a saved packaging box, independently of CNC files.
create table public.wc_box_rd_files (
 id uuid primary key default gen_random_uuid(),
 profile_signature text not null references public.wc_delivery_packaging_profiles(signature) on delete cascade,
 box_index integer not null check (box_index >= 0),
 object_path text not null unique,
 filename text not null check (length(filename) between 4 and 255 and lower(filename) like '%.rd'),
 size_bytes integer not null check (size_bytes between 1 and 20971520),
 copies integer not null check (copies between 1 and 1000),
 revision uuid not null default gen_random_uuid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index wc_box_rd_files_box on public.wc_box_rd_files(profile_signature,box_index,created_at);
alter table public.wc_box_rd_files enable row level security;
revoke all on public.wc_box_rd_files from public,anon,authenticated;
grant select on public.wc_box_rd_files to authenticated;
create policy box_rd_files_read on public.wc_box_rd_files for select to authenticated using (true);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('box-rd-files','box-rd-files',false,20971520,array['application/octet-stream']);
create policy box_rd_files_upload on storage.objects for insert to authenticated
with check (bucket_id='box-rd-files' and (storage.foldername(name))[1]=auth.uid()::text);
create policy box_rd_files_download on storage.objects for select to authenticated
using (bucket_id='box-rd-files');
create policy box_rd_files_cleanup on storage.objects for delete to authenticated
using (bucket_id='box-rd-files' and not exists
 (select 1 from public.wc_box_rd_files f where f.object_path=name));

create function public.wc_save_box_rd_file(
 p_id uuid,p_signature text,p_index integer,p_path text,p_filename text,
 p_bytes integer,p_copies integer,p_expected uuid
) returns public.wc_box_rd_files language plpgsql security definer set search_path=public as $$
declare box_count integer; previous public.wc_box_rd_files; result public.wc_box_rd_files;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select jsonb_array_length(packages) into box_count
 from public.wc_delivery_packaging_profiles where signature=p_signature for update;
 if box_count is null or p_index is null or p_index<0 or p_index>=box_count then
  raise exception 'Packaging box changed. Reload the product before saving.';
 end if;
 if p_copies is null or p_copies<1 or p_copies>1000 then
  raise exception 'Enter a copy count from 1 to 1000.';
 end if;
 if p_id is not null then
  select * into previous from public.wc_box_rd_files where id=p_id for update;
  if not found or previous.profile_signature<>p_signature or previous.box_index<>p_index then
   raise exception 'RD file changed. Reload before saving.';
  end if;
  if previous.revision is distinct from p_expected then
   raise exception 'RD file changed. Reload before saving.';
  end if;
 end if;
 if p_path is null then
  if p_id is null then raise exception 'Choose an RD file before saving.'; end if;
  update public.wc_box_rd_files set copies=p_copies,revision=gen_random_uuid(),updated_at=now()
  where id=p_id returning * into result;
 else
  if p_filename is null or length(p_filename) not between 4 and 255 or lower(p_filename) not like '%.rd'
   or p_bytes is null or p_bytes not between 1 and 20971520
   or split_part(p_path,'/',1)<>auth.uid()::text
   or not exists(select 1 from storage.objects where bucket_id='box-rd-files' and name=p_path
      and (metadata->>'size')::bigint=p_bytes) then
   raise exception 'RD upload is missing or invalid. Choose the file again.';
  end if;
  if p_id is null then
   insert into public.wc_box_rd_files(profile_signature,box_index,object_path,filename,size_bytes,copies)
   values(p_signature,p_index,p_path,p_filename,p_bytes,p_copies) returning * into result;
  else
   update public.wc_box_rd_files set object_path=p_path,filename=p_filename,size_bytes=p_bytes,
    copies=p_copies,revision=gen_random_uuid(),updated_at=now()
   where id=p_id returning * into result;
  end if;
 end if;
 return result;
end $$;
revoke all on function public.wc_save_box_rd_file(uuid,text,integer,text,text,integer,integer,uuid) from public,anon;
grant execute on function public.wc_save_box_rd_file(uuid,text,integer,text,text,integer,integer,uuid) to authenticated;

create function public.wc_delete_box_rd_file(p_id uuid,p_expected uuid)
returns text language plpgsql security definer set search_path=public as $$
declare old_path text;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 delete from public.wc_box_rd_files where id=p_id and revision=p_expected
 returning object_path into old_path;
 if old_path is null then raise exception 'RD file changed. Reload before deleting.'; end if;
 return old_path;
end $$;
revoke all on function public.wc_delete_box_rd_file(uuid,uuid) from public,anon;
grant execute on function public.wc_delete_box_rd_file(uuid,uuid) to authenticated;
