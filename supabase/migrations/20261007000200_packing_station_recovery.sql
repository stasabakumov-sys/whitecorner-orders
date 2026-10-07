-- Manager requests contain only a restart command, never executable code or credentials.
create table public.wc_packing_station_controls (
 station_name text primary key references public.wc_packing_stations(station_name),
 supervisor_instance uuid not null,
 supervisor_seen timestamptz not null default now(),
 restart_id uuid,
 restart_state text not null default 'idle' check(restart_state in ('idle','requested','restarting','completed','failed')),
 restart_requested_by uuid references public.wc_hub_members(user_id),
 restart_requested_at timestamptz,
 restart_started_at timestamptz,
 restart_completed_at timestamptz,
 restart_error text,
 check((restart_state='idle')=(restart_id is null))
);
alter table public.wc_packing_station_controls enable row level security;
revoke all on public.wc_packing_station_controls from public,anon,authenticated;
grant select on public.wc_packing_station_controls to authenticated;
create policy packing_station_controls_read on public.wc_packing_station_controls for select to authenticated
 using(public.wc_is_hub_manager());

create function public.wc_packing_station_control_heartbeat(p_station text,p_instance uuid)
returns public.wc_packing_station_controls language plpgsql security definer set search_path=public,pg_temp as $$
declare result public.wc_packing_station_controls;
begin
 if not public.wc_is_hub_manager() then raise exception 'Manager access required';end if;
 if p_station is null or length(trim(p_station)) not between 1 and 80 or p_instance is null then raise exception 'Invalid station identity';end if;
 p_station:=trim(p_station);
 insert into public.wc_packing_stations(station_name,operator_id,last_seen)
 values(p_station,auth.uid(),now()-interval '1 year') on conflict do nothing;
 perform 1 from public.wc_packing_stations where station_name=p_station and operator_id=auth.uid() for update;
 if not found then raise exception 'Station belongs to another manager account';end if;
 select * into result from public.wc_packing_station_controls where station_name=p_station for update;
 if found and result.supervisor_instance<>p_instance and result.supervisor_seen>now()-interval '35 seconds' then
  raise exception 'Another recovery supervisor is already connected for this station';
 end if;
 insert into public.wc_packing_station_controls(station_name,supervisor_instance,supervisor_seen)
 values(p_station,p_instance,now()) on conflict(station_name) do update
 set supervisor_instance=excluded.supervisor_instance,supervisor_seen=now() returning * into result;
 if result.restart_state='requested' and result.restart_requested_at<now()-interval '30 minutes'
 or result.restart_state='restarting' and result.restart_started_at<now()-interval '3 minutes' then
  update public.wc_packing_station_controls set restart_state='failed',restart_completed_at=now(),
   restart_error='Station restart was not confirmed. Keep the laptop awake and connected, then retry.'
  where station_name=p_station returning * into result;
 end if;
 return result;
end $$;

create function public.wc_request_packing_station_restart(p_station text)
returns public.wc_packing_station_controls language plpgsql security definer set search_path=public,pg_temp as $$
declare result public.wc_packing_station_controls;
begin
 if not public.wc_is_hub_manager() then raise exception 'Manager access required';end if;
 select * into result from public.wc_packing_station_controls where station_name=p_station for update;
 if not found then raise exception 'Station recovery is not installed on this laptop';end if;
 if result.restart_state in ('requested','restarting') then return result;end if;
 update public.wc_packing_station_controls set restart_id=gen_random_uuid(),restart_state='requested',
  restart_requested_by=auth.uid(),restart_requested_at=now(),restart_started_at=null,restart_completed_at=null,restart_error=null
 where station_name=p_station returning * into result;
 return result;
end $$;

create function public.wc_begin_packing_station_restart(p_station text,p_instance uuid,p_request uuid)
returns public.wc_packing_station_controls language plpgsql security definer set search_path=public,pg_temp as $$
declare result public.wc_packing_station_controls;
begin
 if not public.wc_is_hub_manager() then raise exception 'Manager access required';end if;
 perform 1 from public.wc_packing_stations where station_name=p_station and operator_id=auth.uid() for update;
 if not found then raise exception 'Station unavailable';end if;
 select * into result from public.wc_packing_station_controls where station_name=p_station and supervisor_instance=p_instance
  and supervisor_seen>now()-interval '35 seconds' and restart_id=p_request for update;
 if not found or result.restart_state not in ('requested','restarting') then raise exception 'Restart request changed. Refresh its status.';end if;
 -- Unknown/unfinished transfers require manual review; never reset or replay them.
 if exists(select 1 from public.wc_packing_transfers where station_name=p_station and state='claimed') then
  update public.wc_packing_station_controls set restart_error='Waiting for the active upload to finish. If it has stopped, check the controller file list and reset the stalled transfer.'
  where station_name=p_station returning * into result;return result;
 end if;
 update public.wc_packing_station_controls set restart_state='restarting',restart_started_at=now(),restart_error=null
 where station_name=p_station returning * into result;return result;
end $$;

create function public.wc_finish_packing_station_restart(p_station text,p_instance uuid,p_request uuid)
returns public.wc_packing_station_controls language plpgsql security definer set search_path=public,pg_temp as $$
declare result public.wc_packing_station_controls;
begin
 if not public.wc_is_hub_manager() then raise exception 'Manager access required';end if;
 select * into result from public.wc_packing_station_controls where station_name=p_station and supervisor_instance=p_instance
  and supervisor_seen>now()-interval '35 seconds' and restart_id=p_request for update;
 if not found then raise exception 'Restart request changed. Refresh its status.';end if;
 if result.restart_state='completed' then return result;end if;
 if result.restart_state<>'restarting' or not exists(select 1 from public.wc_packing_stations
  where station_name=p_station and operator_id=auth.uid() and last_seen>=result.restart_started_at and last_seen>now()-interval '35 seconds') then
  raise exception 'The restarted worker has not connected yet';
 end if;
 update public.wc_packing_station_controls set restart_state='completed',restart_completed_at=now(),restart_error=null
 where station_name=p_station returning * into result;return result;
end $$;

create function public.wc_packing_station_worker_ready(p_station text)
returns public.wc_packing_stations language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.wc_is_hub_manager() then raise exception 'Manager access required';end if;
 -- A replacement worker must not overlap an old worker still uploading, or
 -- make an abandoned claim look live. Existing explicit stale-reset remains.
 perform 1 from public.wc_packing_stations where station_name=p_station for update;
 if exists(select 1 from public.wc_packing_transfers where station_name=p_station and state='claimed') then
  raise exception 'An unfinished upload requires review. Check the controller file list and reset the stalled transfer in Hub before reconnecting.';
 end if;
 return public.wc_packing_station_heartbeat(p_station);
end $$;

revoke all on function public.wc_packing_station_control_heartbeat(text,uuid),public.wc_request_packing_station_restart(text),
 public.wc_begin_packing_station_restart(text,uuid,uuid),public.wc_finish_packing_station_restart(text,uuid,uuid),
 public.wc_packing_station_worker_ready(text) from public,anon;
grant execute on function public.wc_packing_station_control_heartbeat(text,uuid),public.wc_request_packing_station_restart(text),
 public.wc_begin_packing_station_restart(text,uuid,uuid),public.wc_finish_packing_station_restart(text,uuid,uuid),
 public.wc_packing_station_worker_ready(text) to authenticated;
