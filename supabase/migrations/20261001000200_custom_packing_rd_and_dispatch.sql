-- Custom work uses the same private RD storage and cutting queue as product work.
create table public.wc_custom_packing_rd_files (
 id uuid primary key default gen_random_uuid(),
 job_id uuid not null references public.wc_custom_packing_jobs(id) on delete cascade,
 object_path text not null unique,
 filename text not null check (length(filename) between 4 and 255 and lower(filename) like '%.rd'),
 size_bytes integer not null check (size_bytes between 1 and 20971520),
 copies integer not null check (copies between 1 and 1000),
 revision uuid not null default gen_random_uuid(),
 created_at timestamptz not null default now()
);
create index wc_custom_packing_rd_files_job on public.wc_custom_packing_rd_files(job_id,created_at);
alter table public.wc_custom_packing_rd_files enable row level security;
revoke all on public.wc_custom_packing_rd_files from public,anon,authenticated;
grant select on public.wc_custom_packing_rd_files to authenticated;
create policy custom_packing_rd_manager_read on public.wc_custom_packing_rd_files
 for select to authenticated using (public.wc_is_hub_manager());

alter table public.wc_packing_tasks alter column unit_id drop not null;
alter table public.wc_packing_tasks alter column profile_signature drop not null;
alter table public.wc_packing_tasks add column custom_job_id uuid references public.wc_custom_packing_jobs(id);
alter table public.wc_packing_tasks add column custom_instructions text;
alter table public.wc_packing_tasks add constraint wc_packing_task_source
 check ((unit_id is not null and custom_job_id is null and profile_signature is not null)
     or (unit_id is null and custom_job_id is not null and profile_signature is null));
create unique index wc_packing_active_custom_job on public.wc_packing_tasks(custom_job_id)
 where custom_job_id is not null and state not in ('cancelled','completed');

create function public.wc_save_custom_packing_rd_file(
 p_id uuid,p_job uuid,p_path text,p_filename text,p_bytes integer,p_copies integer,p_expected uuid
) returns public.wc_custom_packing_rd_files language plpgsql security definer
set search_path=public,pg_temp as $$
declare previous public.wc_custom_packing_rd_files; result public.wc_custom_packing_rd_files;
begin
 if not public.wc_is_hub_manager() then raise exception 'Manager access required'; end if;
 perform 1 from public.wc_custom_packing_jobs where id=p_job for update;
 if not found then raise exception 'Custom job unavailable. Refresh and retry.'; end if;
 if exists(select 1 from public.wc_packing_tasks where custom_job_id=p_job
  and state not in ('cancelled','completed')) then
  raise exception 'This job is already sent. Complete or cancel it before changing RD files.';
 end if;
 if p_copies is null or p_copies not between 1 and 1000 then raise exception 'Enter a copy count from 1 to 1000.'; end if;
 if p_id is not null then
  select * into previous from public.wc_custom_packing_rd_files where id=p_id and job_id=p_job for update;
  if not found or previous.revision is distinct from p_expected then
   raise exception 'RD file changed. Refresh before saving.';
  end if;
 end if;
 if p_path is null then
  if p_id is null then raise exception 'Choose an RD file before saving.'; end if;
  update public.wc_custom_packing_rd_files set copies=p_copies,revision=gen_random_uuid()
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
   insert into public.wc_custom_packing_rd_files(job_id,object_path,filename,size_bytes,copies)
   values(p_job,p_path,p_filename,p_bytes,p_copies) returning * into result;
  else
   update public.wc_custom_packing_rd_files set object_path=p_path,filename=p_filename,
    size_bytes=p_bytes,copies=p_copies,revision=gen_random_uuid()
   where id=p_id returning * into result;
  end if;
 end if;
 return result;
end $$;
revoke all on function public.wc_save_custom_packing_rd_file(uuid,uuid,text,text,integer,integer,uuid) from public,anon;
grant execute on function public.wc_save_custom_packing_rd_file(uuid,uuid,text,text,integer,integer,uuid) to authenticated;

create function public.wc_delete_custom_packing_rd_file(p_id uuid,p_expected uuid)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare job uuid; old_path text;
begin
 if not public.wc_is_hub_manager() then raise exception 'Manager access required'; end if;
 select job_id into job from public.wc_custom_packing_rd_files where id=p_id;
 if job is null then raise exception 'RD file unavailable. Refresh and retry.'; end if;
 perform 1 from public.wc_custom_packing_jobs where id=job for update;
 if exists(select 1 from public.wc_packing_tasks where custom_job_id=job
  and state not in ('cancelled','completed')) then
  raise exception 'This job is already sent. Complete or cancel it before removing RD files.';
 end if;
 delete from public.wc_custom_packing_rd_files where id=p_id and revision=p_expected
 returning object_path into old_path;
 if old_path is null then raise exception 'RD file changed. Refresh before removing.'; end if;
 return old_path;
end $$;
revoke all on function public.wc_delete_custom_packing_rd_file(uuid,uuid) from public,anon;
grant execute on function public.wc_delete_custom_packing_rd_file(uuid,uuid) to authenticated;

create function public.wc_send_custom_packing_job(p_job uuid)
returns public.wc_packing_tasks language plpgsql security definer set search_path=public,pg_temp as $$
declare job public.wc_custom_packing_jobs; snapshot jsonb; result public.wc_packing_tasks;
begin
 if not public.wc_is_hub_manager() then raise exception 'Manager access required'; end if;
 select * into job from public.wc_custom_packing_jobs where id=p_job for update;
 if not found then raise exception 'Custom job unavailable. Refresh and retry.'; end if;
 if exists(select 1 from public.wc_packing_tasks where custom_job_id=p_job
  and state not in ('cancelled','completed')) then
  raise exception 'This Custom job is already in Packing work.';
 end if;
 select jsonb_agg(jsonb_build_object('file_id',f.id,'box_index',0,'box_name','Custom job',
  'object_path',f.object_path,'filename',f.filename,'size_bytes',f.size_bytes,'copies',f.copies)
  order by f.created_at,f.id) into snapshot
 from public.wc_custom_packing_rd_files f where f.job_id=p_job;
 if snapshot is null then raise exception 'Add at least one RD file before sending this job.'; end if;
 insert into public.wc_packing_tasks(custom_job_id,order_number,product_name,custom_instructions,assigned_by,files,packages)
 values(p_job,'',job.title,job.instructions,auth.uid(),snapshot,
  jsonb_build_array(jsonb_build_object('package_name','Custom job')))
 returning * into result;
 return result;
end $$;
revoke all on function public.wc_send_custom_packing_job(uuid) from public,anon;
grant execute on function public.wc_send_custom_packing_job(uuid) to authenticated;

-- Allow cleanup only when neither the saved file nor a task snapshot uses the object.
drop policy box_rd_files_cleanup on storage.objects;
create policy box_rd_files_cleanup on storage.objects for delete to authenticated
using (bucket_id='box-rd-files' and (storage.foldername(name))[1]=auth.uid()::text
 and not exists(select 1 from public.wc_box_rd_files f where f.object_path=name)
 and not exists(select 1 from public.wc_custom_packing_rd_files f where f.object_path=name)
 and not exists(select 1 from public.wc_packing_tasks t,jsonb_array_elements(t.files) file
  where t.state<>'cancelled' and file->>'object_path'=name));
