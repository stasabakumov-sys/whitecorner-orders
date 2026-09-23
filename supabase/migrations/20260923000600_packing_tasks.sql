-- All accounts present at rollout are the two existing managers. Future accounts
-- enter as workers and can be invited only through the manager-only server API.
create table public.wc_hub_members (
 user_id uuid primary key references auth.users(id) on delete cascade,
 email text not null,
 display_name text not null,
 role text not null default 'worker' check (role in ('manager','worker')),
 active boolean not null default true,
 created_at timestamptz not null default now()
);
do $$ begin
 if (select count(*) from auth.users)<>2 then
  raise exception 'Expected exactly two existing Hub users before assigning manager roles. Review the accounts first.';
 end if;
end $$;
insert into public.wc_hub_members(user_id,email,display_name,role)
select id,coalesce(email,''),coalesce(nullif(raw_user_meta_data->>'full_name',''),split_part(coalesce(email,''),'@',1)),'manager'
from auth.users;
create function public.wc_hub_member_sync() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.wc_hub_members(user_id,email,display_name)
 values(new.id,coalesce(new.email,''),coalesce(nullif(new.raw_user_meta_data->>'full_name',''),split_part(coalesce(new.email,''),'@',1)))
 on conflict(user_id) do update set email=excluded.email;
 return new;
end $$;
create trigger wc_hub_member_sync after insert or update of email on auth.users
for each row execute function public.wc_hub_member_sync();
alter table public.wc_hub_members enable row level security;
revoke all on public.wc_hub_members from public,anon,authenticated;
grant select on public.wc_hub_members to authenticated;
create function public.wc_is_hub_manager() returns boolean language sql stable security definer
set search_path=public as $$
 select exists(select 1 from public.wc_hub_members where user_id=auth.uid() and role='manager' and active)
$$;
revoke all on function public.wc_is_hub_manager() from public,anon;
grant execute on function public.wc_is_hub_manager() to authenticated;
drop policy box_rd_files_upload on storage.objects;
create policy box_rd_files_upload on storage.objects for insert to authenticated
with check (bucket_id='box-rd-files' and (storage.foldername(name))[1]=auth.uid()::text
 and public.wc_is_hub_manager());
create function public.wc_box_rd_manager_guard() returns trigger language plpgsql security definer
set search_path=public as $$
begin
 if not public.wc_is_hub_manager() then raise exception 'Manager access required to edit box RD files'; end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
create trigger wc_box_rd_manager_guard before insert or update or delete on public.wc_box_rd_files
for each row execute function public.wc_box_rd_manager_guard();
create policy hub_members_read on public.wc_hub_members for select to authenticated
using (active and (user_id=auth.uid() or public.wc_is_hub_manager()));

create table public.wc_packing_tasks (
 id uuid primary key default gen_random_uuid(),
 unit_id uuid not null references public.wc_production_units(id),
 order_number text not null,
 product_name text not null,
 profile_signature text not null references public.wc_delivery_packaging_profiles(signature),
 assigned_to uuid not null references public.wc_hub_members(user_id),
 assigned_by uuid not null references public.wc_hub_members(user_id),
 files jsonb not null check(jsonb_typeof(files)='array' and jsonb_array_length(files)>0),
 state text not null default 'assigned' check(state in ('assigned','transfer_requested','transferred','completed','cancelled')),
 assigned_at timestamptz not null default now(),
 transferred_at timestamptz,
 completed_at timestamptz,
 revision uuid not null default gen_random_uuid()
);
create unique index wc_packing_active_unit on public.wc_packing_tasks(unit_id) where state<>'cancelled';
create index wc_packing_assignee on public.wc_packing_tasks(assigned_to,state,assigned_at);
alter table public.wc_packing_tasks enable row level security;
revoke all on public.wc_packing_tasks from public,anon,authenticated;
grant select on public.wc_packing_tasks to authenticated;
create policy packing_tasks_read on public.wc_packing_tasks for select to authenticated
using (assigned_to=auth.uid() or public.wc_is_hub_manager());

create function public.wc_assign_packing_task(p_unit uuid,p_profile text,p_worker uuid)
returns public.wc_packing_tasks language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); product_id uuid; product_label text; order_label text;
 box_count integer; box_number integer;
 snapshot jsonb; existing public.wc_packing_tasks; result public.wc_packing_tasks;
begin
 if not exists(select 1 from public.wc_hub_members where user_id=actor and role='manager' and active) then
  raise exception 'Manager access required';
 end if;
 if not exists(select 1 from public.wc_hub_members where user_id=p_worker and active) then
  raise exception 'Choose an active employee';
 end if;
 select public.wc_shop_item_product(main.id),main.product_name,o.order_number::text
 into product_id,product_label,order_label
 from public.wc_production_units u join public.wc_order_items i on i.id=u.order_item_id
 join public.wc_order_items main on main.id=coalesce(public.wc_cost_main(i.id),i.id)
 join public.wc_orders o on o.id=i.order_id
 where u.id=p_unit and u.production_status in ('New','CNC','Assembly','Sanding','Painting','Packing')
 for update of u;
 if product_id is null then raise exception 'Product is unavailable for Packing. Link it in Products and check its production status.'; end if;
 select jsonb_array_length(packages) into box_count from public.wc_delivery_packaging_profiles
 where signature=p_profile and shipping_product_id=product_id;
 if box_count is null or box_count=0 then raise exception 'Choose a saved Packing profile for this product'; end if;
 for box_number in 0..box_count-1 loop
  if not exists(select 1 from public.wc_box_rd_files where profile_signature=p_profile and box_index=box_number) then
   raise exception 'Box % has no RD files. Add them in the product Packing tab before assigning work',box_number+1;
  end if;
 end loop;
 select jsonb_agg(jsonb_build_object('file_id',f.id,'box_index',f.box_index,
  'box_name',p.box->>'package_name','object_path',f.object_path,'filename',f.filename,
  'size_bytes',f.size_bytes,'copies',f.copies) order by f.box_index,f.created_at,f.id)
 into snapshot
 from public.wc_delivery_packaging_profiles profile
 cross join lateral jsonb_array_elements(profile.packages) with ordinality p(box,n)
 join public.wc_box_rd_files f on f.profile_signature=profile.signature and f.box_index=p.n-1
 where profile.signature=p_profile;
 if snapshot is null then raise exception 'Add RD files to every box before assigning work'; end if;
 select * into existing from public.wc_packing_tasks where unit_id=p_unit and state<>'cancelled' for update;
 if found then
  if existing.state not in ('assigned') then raise exception 'This Packing task has already started. Finish or cancel it before assigning again.'; end if;
  update public.wc_packing_tasks set order_number=order_label,product_name=product_label,
   profile_signature=p_profile,assigned_to=p_worker,assigned_by=actor,
   files=snapshot,assigned_at=now(),revision=gen_random_uuid()
  where id=existing.id returning * into result;
 else
  insert into public.wc_packing_tasks(unit_id,order_number,product_name,profile_signature,assigned_to,assigned_by,files)
  values(p_unit,order_label,product_label,p_profile,p_worker,actor,snapshot) returning * into result;
 end if;
 return result;
end $$;
revoke all on function public.wc_assign_packing_task(uuid,text,uuid) from public,anon;
grant execute on function public.wc_assign_packing_task(uuid,text,uuid) to authenticated;

create function public.wc_cancel_packing_task(p_id uuid)
returns public.wc_packing_tasks language plpgsql security definer set search_path=public as $$
declare result public.wc_packing_tasks; current_task public.wc_packing_tasks;
begin
 if not exists(select 1 from public.wc_hub_members where user_id=auth.uid() and role='manager' and active) then
  raise exception 'Manager access required';
 end if;
 perform 1 from public.wc_packing_transfers where task_id=p_id and state in ('queued','claimed') for update;
 select * into current_task from public.wc_packing_tasks where id=p_id for update;
 if not found or current_task.state not in ('assigned','transfer_requested') then
  raise exception 'Task has changed or already reached the machine. Reload before cancelling.';
 end if;
 if exists(select 1 from public.wc_packing_transfers where task_id=p_id and state='claimed') then
  raise exception 'The laptop has already claimed this task. Wait for its result before cancelling.';
 end if;
 update public.wc_packing_transfers set state='failed',error='Task cancelled by manager',finished_at=now()
 where task_id=p_id and state='queued';
 update public.wc_packing_tasks set state='cancelled',revision=gen_random_uuid()
 where id=p_id and state in ('assigned','transfer_requested') returning * into result;
 return result;
end $$;
revoke all on function public.wc_cancel_packing_task(uuid) from public,anon;
grant execute on function public.wc_cancel_packing_task(uuid) to authenticated;

create function public.wc_complete_packing_task(p_id uuid)
returns public.wc_packing_tasks language plpgsql security definer set search_path=public as $$
declare result public.wc_packing_tasks;
begin
 update public.wc_packing_tasks set state='completed',completed_at=now(),revision=gen_random_uuid()
 where id=p_id and state='transferred' and (assigned_to=auth.uid() or exists
  (select 1 from public.wc_hub_members where user_id=auth.uid() and role='manager' and active))
 returning * into result;
 if not found then raise exception 'Transfer must be confirmed before completing Packing.'; end if;
 return result;
end $$;
revoke all on function public.wc_complete_packing_task(uuid) from public,anon;
grant execute on function public.wc_complete_packing_task(uuid) to authenticated;

-- A task is a historical snapshot. Keep its RD objects until the task is cancelled.
drop policy box_rd_files_cleanup on storage.objects;
create policy box_rd_files_cleanup on storage.objects for delete to authenticated
using (bucket_id='box-rd-files'
 and (storage.foldername(name))[1]=auth.uid()::text
 and not exists(select 1 from public.wc_box_rd_files f where f.object_path=name)
 and not exists(select 1 from public.wc_packing_tasks t,
  jsonb_array_elements(t.files) file where t.state<>'cancelled' and file->>'object_path'=name));
create function public.wc_box_rd_active_guard() returns trigger language plpgsql set search_path=public as $$
begin
 if tg_op='DELETE' then
  if exists(select 1 from public.wc_packing_tasks t,jsonb_array_elements(t.files) file
   where t.state not in ('cancelled','completed') and file->>'file_id'=old.id::text) then
   raise exception 'This RD file is used by an active Packing task. Complete or cancel that task first.';
  end if;
  return old;
 end if;
 if old.object_path is distinct from new.object_path or old.copies is distinct from new.copies then
  if exists(select 1 from public.wc_packing_tasks t,jsonb_array_elements(t.files) file
   where t.state not in ('cancelled','completed') and file->>'file_id'=old.id::text) then
   raise exception 'This RD file is used by an active Packing task. Complete or cancel that task first.';
  end if;
 end if;
 return new;
end $$;
create trigger wc_box_rd_active_guard before update or delete on public.wc_box_rd_files
for each row execute function public.wc_box_rd_active_guard();

create function public.wc_packing_candidates()
returns table(unit_id uuid,order_number text,product_name text,production_status text,
 product_id uuid,item_id uuid,item jsonb)
language sql stable security definer set search_path=public as $$
 select u.id,o.order_number::text,main.product_name,u.production_status,
  public.wc_shop_item_product(main.id),main.id,to_jsonb(main)
 from public.wc_production_units u
 join public.wc_order_items i on i.id=u.order_item_id
 join public.wc_orders o on o.id=i.order_id
 join public.wc_order_items main on main.id=coalesce(public.wc_cost_main(i.id),i.id)
 where public.wc_is_hub_manager()
  and u.production_status in ('New','CNC','Assembly','Sanding','Painting','Packing')
  and not coalesce(o.is_hidden,false) and not coalesce(o.archived,false)
  and coalesce(o.fulfillment_status,'')<>'FULFILLED'
  and coalesce(o.wix_status,'') !~* 'cancel'
  and (i.id=main.id and not (o.order_number::text='10812' and exists
   (select 1 from public.wc_order_items legacy join public.wc_production_units tracked
    on tracked.order_item_id=legacy.id where legacy.order_id=o.id
    and legacy.product_name ~* 'tasmanian oak timber benchtop upgrade'))
   or o.order_number::text='10812' and i.product_name ~* 'tasmanian oak timber benchtop upgrade')
 order by case u.production_status when 'Packing' then 0 when 'Painting' then 1
  when 'Sanding' then 2 when 'Assembly' then 3 when 'CNC' then 4 else 5 end,
  o.wix_created_at,u.id
$$;
revoke all on function public.wc_packing_candidates() from public,anon;
grant execute on function public.wc_packing_candidates() to authenticated;

create table public.wc_packing_stations (
 station_name text primary key check(length(station_name) between 1 and 80),
 operator_id uuid not null references public.wc_hub_members(user_id),
 last_seen timestamptz not null default now()
);
alter table public.wc_packing_stations enable row level security;
revoke all on public.wc_packing_stations from public,anon,authenticated;
grant select on public.wc_packing_stations to authenticated;
create policy packing_stations_read on public.wc_packing_stations for select to authenticated using(true);

create table public.wc_packing_transfers (
 id uuid primary key default gen_random_uuid(),
 task_id uuid not null references public.wc_packing_tasks(id),
 requested_by uuid not null references public.wc_hub_members(user_id),
 station_name text references public.wc_packing_stations(station_name),
 state text not null default 'queued' check(state in ('queued','claimed','transferred','failed')),
 error text,
 requested_at timestamptz not null default now(),
 claimed_at timestamptz,
 finished_at timestamptz
);
create unique index wc_packing_transfer_inflight on public.wc_packing_transfers(task_id)
where state in ('queued','claimed');
create index wc_packing_transfer_queue on public.wc_packing_transfers(state,requested_at);
alter table public.wc_packing_transfers enable row level security;
revoke all on public.wc_packing_transfers from public,anon,authenticated;
grant select on public.wc_packing_transfers to authenticated;
create policy packing_transfers_read on public.wc_packing_transfers for select to authenticated
using (public.wc_is_hub_manager() or exists
 (select 1 from public.wc_packing_tasks t where t.id=task_id and t.assigned_to=auth.uid()));

create function public.wc_packing_station_heartbeat(p_station text)
returns public.wc_packing_stations language plpgsql security definer set search_path=public as $$
declare result public.wc_packing_stations;
begin
 if not public.wc_is_hub_manager() then raise exception 'Manager access required for the station'; end if;
 if p_station is null or length(trim(p_station)) not between 1 and 80 then raise exception 'Invalid station name'; end if;
 insert into public.wc_packing_stations(station_name,operator_id,last_seen)
 values(trim(p_station),auth.uid(),now())
 on conflict(station_name) do update set operator_id=excluded.operator_id,last_seen=now()
 returning * into result;
 return result;
end $$;
revoke all on function public.wc_packing_station_heartbeat(text) from public,anon;
grant execute on function public.wc_packing_station_heartbeat(text) to authenticated;

create function public.wc_request_packing_transfer(p_task uuid)
returns public.wc_packing_transfers language plpgsql security definer set search_path=public as $$
declare task public.wc_packing_tasks; station public.wc_packing_stations; result public.wc_packing_transfers;
begin
 select * into task from public.wc_packing_tasks where id=p_task for update;
 if not found or not (task.assigned_to=auth.uid() or public.wc_is_hub_manager()) then
  raise exception 'Packing task unavailable';
 end if;
 if task.state='transfer_requested' then
  select * into result from public.wc_packing_transfers where task_id=p_task and state in ('queued','claimed');
  if found then return result; end if;
 end if;
 if task.state<>'assigned' then raise exception 'This task is already transferred or completed'; end if;
 select * into station from public.wc_packing_stations where last_seen>now()-interval '35 seconds'
 order by last_seen desc limit 1;
 if not found then raise exception 'No cutting station is connected. Start the laptop station and retry.'; end if;
 insert into public.wc_packing_transfers(task_id,requested_by,station_name)
 values(p_task,auth.uid(),station.station_name) returning * into result;
 update public.wc_packing_tasks set state='transfer_requested',revision=gen_random_uuid() where id=p_task;
 return result;
end $$;
revoke all on function public.wc_request_packing_transfer(uuid) from public,anon;
grant execute on function public.wc_request_packing_transfer(uuid) to authenticated;

create function public.wc_claim_packing_transfer(p_station text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare transfer public.wc_packing_transfers; task public.wc_packing_tasks;
begin
 if not public.wc_is_hub_manager() then raise exception 'Manager access required for the station'; end if;
 perform 1 from public.wc_packing_stations where station_name=p_station and operator_id=auth.uid()
  and last_seen>now()-interval '35 seconds';
 if not found then raise exception 'Station heartbeat required'; end if;
 select * into transfer from public.wc_packing_transfers
 where state='queued' and station_name=p_station order by requested_at,id
 for update skip locked limit 1;
 if not found then return null; end if;
 update public.wc_packing_transfers set state='claimed',claimed_at=now() where id=transfer.id;
 select * into task from public.wc_packing_tasks where id=transfer.task_id;
 return jsonb_build_object('transfer_id',transfer.id,'task_id',task.id,'files',task.files);
end $$;
revoke all on function public.wc_claim_packing_transfer(text) from public,anon;
grant execute on function public.wc_claim_packing_transfer(text) to authenticated;

create function public.wc_finish_packing_transfer(p_transfer uuid,p_ok boolean,p_error text)
returns public.wc_packing_transfers language plpgsql security definer set search_path=public as $$
declare result public.wc_packing_transfers;
begin
 if not public.wc_is_hub_manager() then raise exception 'Manager access required for the station'; end if;
 update public.wc_packing_transfers set state=case when p_ok then 'transferred' else 'failed' end,
  error=case when p_ok then null else left(coalesce(p_error,'Transfer failed'),500) end,finished_at=now()
 where id=p_transfer and state='claimed' and station_name in
  (select station_name from public.wc_packing_stations where operator_id=auth.uid())
 returning * into result;
 if not found then raise exception 'Transfer changed. Reload its status.'; end if;
 update public.wc_packing_tasks set state=case when p_ok then 'transferred' else 'assigned' end,
  transferred_at=case when p_ok then now() else null end,revision=gen_random_uuid()
 where id=result.task_id and state='transfer_requested';
 if not found then raise exception 'Packing task changed. Reload before retrying.'; end if;
 return result;
end $$;
revoke all on function public.wc_finish_packing_transfer(uuid,boolean,text) from public,anon;
grant execute on function public.wc_finish_packing_transfer(uuid,boolean,text) to authenticated;

create function public.wc_reset_stale_packing_transfer(p_transfer uuid)
returns public.wc_packing_transfers language plpgsql security definer set search_path=public as $$
declare result public.wc_packing_transfers;
begin
 if not public.wc_is_hub_manager() then raise exception 'Manager access required'; end if;
 update public.wc_packing_transfers set state='failed',
  error='Station stopped before confirming transfer. Check the controller file list before retrying.',
  finished_at=now()
 where id=p_transfer and state='claimed' and claimed_at<now()-interval '2 minutes'
  and not exists(select 1 from public.wc_packing_stations s
   where s.station_name=wc_packing_transfers.station_name and s.last_seen>now()-interval '35 seconds')
 returning * into result;
 if not found then raise exception 'Transfer is still active or already finished. Reload before resetting.'; end if;
 update public.wc_packing_tasks set state='assigned',revision=gen_random_uuid()
 where id=result.task_id and state='transfer_requested';
 return result;
end $$;
revoke all on function public.wc_reset_stale_packing_transfer(uuid) from public,anon;
grant execute on function public.wc_reset_stale_packing_transfer(uuid) to authenticated;
