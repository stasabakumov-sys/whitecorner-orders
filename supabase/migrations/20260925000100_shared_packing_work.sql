-- Packing jobs are sent to the whole team. The sender remains recorded.
alter table public.wc_packing_tasks alter column assigned_to drop not null;
alter table public.wc_packing_tasks add column packages jsonb;
update public.wc_packing_tasks t set packages=p.packages
from public.wc_delivery_packaging_profiles p where p.signature=t.profile_signature;
alter table public.wc_packing_tasks alter column packages set not null;
drop index if exists public.wc_packing_assignee;
create index wc_packing_work_queue on public.wc_packing_tasks(state,assigned_at);

drop policy packing_tasks_read on public.wc_packing_tasks;
create policy packing_tasks_read on public.wc_packing_tasks for select to authenticated
using (exists (select 1 from public.wc_hub_members m where m.user_id=auth.uid() and m.active));
drop policy packing_transfers_read on public.wc_packing_transfers;
create policy packing_transfers_read on public.wc_packing_transfers for select to authenticated
using (exists (select 1 from public.wc_hub_members m where m.user_id=auth.uid() and m.active));

-- Retire the employee-specific entry point so older clients cannot silently assign work.
drop function public.wc_assign_packing_task(uuid,text,uuid);

create function public.wc_send_packing_task(p_unit uuid,p_profile text)
returns public.wc_packing_tasks language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); product_id uuid; product_label text; order_label text;
 box_count integer; box_number integer; snapshot jsonb; package_snapshot jsonb; result public.wc_packing_tasks;
begin
 if not public.wc_is_hub_manager() then raise exception 'Manager access required'; end if;
 select public.wc_shop_item_product(main.id),main.product_name,o.order_number::text
 into product_id,product_label,order_label
 from public.wc_production_units u join public.wc_order_items i on i.id=u.order_item_id
 join public.wc_order_items main on main.id=coalesce(public.wc_cost_main(i.id),i.id)
 join public.wc_orders o on o.id=i.order_id
 where u.id=p_unit and u.production_status in ('New','CNC','Assembly','Sanding','Painting','Packing')
  and btrim(coalesce(i.product_name,'')) !~* '^(delivery|shipping)(\s+(fee|charge))?$'
  and btrim(coalesce(main.product_name,'')) !~* '^(delivery|shipping)(\s+(fee|charge))?$'
  and not coalesce(o.is_hidden,false) and not coalesce(o.archived,false)
  and coalesce(o.fulfillment_status,'')<>'FULFILLED' and coalesce(o.wix_status,'') !~* 'cancel'
 for update of u;
 if product_id is null then raise exception 'Product is unavailable for Packing. Check its link and order status.'; end if;
 select packages,jsonb_array_length(packages) into package_snapshot,box_count from public.wc_delivery_packaging_profiles
 where signature=p_profile and shipping_product_id=product_id;
 if box_count is null or box_count=0 then raise exception 'Choose a saved Packing profile for this product'; end if;
 for box_number in 0..box_count-1 loop
  if not exists(select 1 from public.wc_box_rd_files where profile_signature=p_profile and box_index=box_number) then
   raise exception 'Box % has no RD files. Add them in the Product Packing tab before sending work',box_number+1;
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
 if snapshot is null then raise exception 'Add RD files to every box before sending work'; end if;
 if exists(select 1 from public.wc_packing_tasks where unit_id=p_unit and state<>'cancelled') then
  raise exception 'Packing work was already sent for this product unit';
 end if;
 insert into public.wc_packing_tasks(unit_id,order_number,product_name,profile_signature,assigned_to,assigned_by,files,packages)
 values(p_unit,order_label,product_label,p_profile,null,actor,snapshot,package_snapshot) returning * into result;
 return result;
end $$;
revoke all on function public.wc_send_packing_task(uuid,text) from public,anon;
grant execute on function public.wc_send_packing_task(uuid,text) to authenticated;

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
 if task.state<>'assigned' then raise exception 'This task is already transferred or completed'; end if;
 select * into station from public.wc_packing_stations where last_seen>now()-interval '35 seconds'
 order by last_seen desc limit 1;
 if not found then raise exception 'No cutting station is connected. Start the laptop station and retry.'; end if;
 insert into public.wc_packing_transfers(task_id,requested_by,station_name)
 values(p_task,auth.uid(),station.station_name) returning * into result;
 update public.wc_packing_tasks set state='transfer_requested',revision=gen_random_uuid() where id=p_task;
 return result;
end $$;

create or replace function public.wc_complete_packing_task(p_id uuid)
returns public.wc_packing_tasks language plpgsql security definer set search_path=public as $$
declare result public.wc_packing_tasks;
begin
 if not exists(select 1 from public.wc_hub_members where user_id=auth.uid() and active) then
  raise exception 'Active Hub membership required';
 end if;
 update public.wc_packing_tasks set state='completed',completed_at=now(),revision=gen_random_uuid()
 where id=p_id and state='transferred' returning * into result;
 if not found then raise exception 'Transfer must be confirmed before completing Packing.'; end if;
 return result;
end $$;
