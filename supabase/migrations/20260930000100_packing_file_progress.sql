-- Each checkbox is saved to the task. The final checkbox completes the task atomically.
alter table public.wc_packing_tasks
 add column cut_file_ids uuid[] not null default '{}'::uuid[];

create function public.wc_set_packing_file_done(p_task uuid,p_file uuid,p_done boolean)
returns public.wc_packing_tasks language plpgsql security definer set search_path=public as $$
declare task public.wc_packing_tasks; result public.wc_packing_tasks; next_ids uuid[];
begin
 if not exists(select 1 from public.wc_hub_members where user_id=auth.uid() and active) then
  raise exception 'Active Hub membership required';
 end if;
 select * into task from public.wc_packing_tasks where id=p_task for update;
 if not found then raise exception 'Packing task unavailable'; end if;
 if task.state<>'transferred' then raise exception 'Transfer must be confirmed before recording cuts'; end if;
 if p_file is null or not exists(select 1 from jsonb_array_elements(task.files) file where (file->>'file_id')::uuid=p_file) then
  raise exception 'RD file is not part of this Packing task';
 end if;
 if p_done is null then raise exception 'Cut completion must be true or false'; end if;
 if p_done then
  select coalesce(array_agg(distinct id),'{}'::uuid[]) into next_ids from unnest(task.cut_file_ids || p_file) id;
 else
  next_ids:=array_remove(task.cut_file_ids,p_file);
 end if;
 if p_done and not exists(
  select 1 from jsonb_array_elements(task.files) file
  where not ((file->>'file_id')::uuid=any(next_ids))
 ) then
  update public.wc_packing_tasks set cut_file_ids=next_ids,state='completed',completed_at=now(),revision=gen_random_uuid()
  where id=p_task returning * into result;
 else
  update public.wc_packing_tasks set cut_file_ids=next_ids,revision=gen_random_uuid()
  where id=p_task returning * into result;
 end if;
 return result;
end $$;
revoke all on function public.wc_set_packing_file_done(uuid,uuid,boolean) from public,anon;
grant execute on function public.wc_set_packing_file_done(uuid,uuid,boolean) to authenticated;

-- Older callers cannot bypass file-by-file completion.
create or replace function public.wc_complete_packing_task(p_id uuid)
returns public.wc_packing_tasks language plpgsql security definer set search_path=public as $$
declare task public.wc_packing_tasks; result public.wc_packing_tasks;
begin
 if not exists(select 1 from public.wc_hub_members where user_id=auth.uid() and active) then
  raise exception 'Active Hub membership required';
 end if;
 select * into task from public.wc_packing_tasks where id=p_id for update;
 if not found or task.state<>'transferred' then raise exception 'Transfer must be confirmed before completing Packing'; end if;
 if exists(select 1 from jsonb_array_elements(task.files) file
  where not ((file->>'file_id')::uuid=any(task.cut_file_ids))) then
  raise exception 'Mark every RD file done before completing Packing';
 end if;
 update public.wc_packing_tasks set state='completed',completed_at=now(),revision=gen_random_uuid()
 where id=p_id returning * into result;
 return result;
end $$;
