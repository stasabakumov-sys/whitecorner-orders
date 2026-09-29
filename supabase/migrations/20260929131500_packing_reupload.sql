create or replace function public.wc_request_packing_transfer(p_task uuid)
returns public.wc_packing_transfers language plpgsql security definer set search_path=public as $$
declare task public.wc_packing_tasks; station public.wc_packing_stations; result public.wc_packing_transfers;
begin
 if not exists(select 1 from public.wc_hub_members where user_id=auth.uid() and active) then
  raise exception 'Active Hub membership required';
 end if;
 select * into task from public.wc_packing_tasks where id=p_task for update;
 if not found then raise exception 'Packing task unavailable'; end if;
 if task.state='transfer_requested' then
  select * into result from public.wc_packing_transfers where task_id=p_task and state in ('queued','claimed');
  if found then return result; end if;
 end if;
 if task.state not in ('assigned','transferred') then raise exception 'Only unfinished packing tasks can be loaded'; end if;
 select * into station from public.wc_packing_stations where last_seen>now()-interval '35 seconds'
 order by last_seen desc limit 1;
 if not found then raise exception 'No cutting station is connected. Start the laptop station and retry.'; end if;
 insert into public.wc_packing_transfers(task_id,requested_by,station_name)
 values(p_task,auth.uid(),station.station_name) returning * into result;
 update public.wc_packing_tasks set state='transfer_requested',revision=gen_random_uuid() where id=p_task;
 return result;
end $$;
