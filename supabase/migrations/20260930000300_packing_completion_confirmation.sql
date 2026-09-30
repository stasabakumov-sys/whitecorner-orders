-- A checkbox saves progress only. Closing work requires the separate, explicit
-- wc_complete_packing_task call, which already checks all files under a row lock.
create or replace function public.wc_set_packing_file_done(p_task uuid,p_file uuid,p_done boolean)
returns public.wc_packing_tasks language plpgsql security definer set search_path=public,pg_temp as $$
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
 update public.wc_packing_tasks set cut_file_ids=next_ids,revision=gen_random_uuid()
 where id=p_task returning * into result;
 return result;
end $$;
revoke all on function public.wc_set_packing_file_done(uuid,uuid,boolean) from public,anon;
grant execute on function public.wc_set_packing_file_done(uuid,uuid,boolean) to authenticated;
