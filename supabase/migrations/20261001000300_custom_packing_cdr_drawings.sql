-- Manager-only source drawings. They never enter wc_packing_tasks.files or laser transfers.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('custom-packing-drawings','custom-packing-drawings',false,52428800,array['application/octet-stream']);

create table public.wc_custom_packing_drawings (
 id uuid primary key default gen_random_uuid(),
 job_id uuid not null references public.wc_custom_packing_jobs(id) on delete cascade,
 object_path text not null unique,
 filename text not null check (length(filename) between 5 and 255 and lower(filename) like '%.cdr'),
 size_bytes integer not null check (size_bytes between 1 and 52428800),
 revision uuid not null default gen_random_uuid(),
 created_at timestamptz not null default now()
);
create index wc_custom_packing_drawings_job on public.wc_custom_packing_drawings(job_id,created_at);
alter table public.wc_custom_packing_drawings enable row level security;
revoke all on public.wc_custom_packing_drawings from public,anon,authenticated;
grant select on public.wc_custom_packing_drawings to authenticated;
create policy custom_packing_drawings_manager_read on public.wc_custom_packing_drawings
 for select to authenticated using (public.wc_is_hub_manager());

create policy custom_packing_drawings_upload on storage.objects for insert to authenticated
 with check (bucket_id='custom-packing-drawings' and (storage.foldername(name))[1]=auth.uid()::text
  and public.wc_is_hub_manager());
create policy custom_packing_drawings_download on storage.objects for select to authenticated
 using (bucket_id='custom-packing-drawings' and public.wc_is_hub_manager());
create policy custom_packing_drawings_cleanup on storage.objects for delete to authenticated
 using (bucket_id='custom-packing-drawings' and public.wc_is_hub_manager()
  and not exists(select 1 from public.wc_custom_packing_drawings d where d.object_path=name));

create function public.wc_save_custom_packing_drawing(
 p_job uuid,p_path text,p_filename text,p_bytes integer
) returns public.wc_custom_packing_drawings language plpgsql security definer
set search_path=public,pg_temp as $$
declare result public.wc_custom_packing_drawings;
begin
 if not public.wc_is_hub_manager() then raise exception 'Manager access required'; end if;
 perform 1 from public.wc_custom_packing_jobs where id=p_job for update;
 if not found then raise exception 'Custom job unavailable. Refresh and retry.'; end if;
 if p_filename is null or length(p_filename) not between 5 and 255 or lower(p_filename) not like '%.cdr'
  or p_bytes is null or p_bytes not between 1 and 52428800
  or p_path is null or split_part(p_path,'/',1)<>auth.uid()::text
  or not exists(select 1 from storage.objects where bucket_id='custom-packing-drawings' and name=p_path
   and (metadata->>'size')::bigint=p_bytes) then
  raise exception 'CDR upload is missing or invalid. Choose the file again.';
 end if;
 insert into public.wc_custom_packing_drawings(job_id,object_path,filename,size_bytes)
 values(p_job,p_path,p_filename,p_bytes) returning * into result;
 return result;
end $$;
revoke all on function public.wc_save_custom_packing_drawing(uuid,text,text,integer) from public,anon;
grant execute on function public.wc_save_custom_packing_drawing(uuid,text,text,integer) to authenticated;

create function public.wc_delete_custom_packing_drawing(p_id uuid,p_expected uuid)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare job uuid; old_path text;
begin
 if not public.wc_is_hub_manager() then raise exception 'Manager access required'; end if;
 select job_id into job from public.wc_custom_packing_drawings where id=p_id;
 if job is null then raise exception 'CDR drawing unavailable. Refresh and retry.'; end if;
 perform 1 from public.wc_custom_packing_jobs where id=job for update;
 delete from public.wc_custom_packing_drawings where id=p_id and revision=p_expected
 returning object_path into old_path;
 if old_path is null then raise exception 'CDR drawing changed. Refresh before removing.'; end if;
 return old_path;
end $$;
revoke all on function public.wc_delete_custom_packing_drawing(uuid,uuid) from public,anon;
grant execute on function public.wc_delete_custom_packing_drawing(uuid,uuid) to authenticated;
