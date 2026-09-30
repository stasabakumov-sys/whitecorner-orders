-- Replacing a saved RD file also replaces that file in unfinished Packing work.
-- Task locks serialize replacement with transfer requests and cut completion.
create or replace function public.wc_box_rd_active_guard()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare task public.wc_packing_tasks;
begin
 if not public.wc_is_hub_manager() then raise exception 'Manager access required to edit box RD files'; end if;
 if tg_op='UPDATE' then
  if old.object_path is not distinct from new.object_path and old.copies is not distinct from new.copies then
   return new;
  end if;
 end if;
 for task in
  select t.* from public.wc_packing_tasks t
  where t.state not in ('cancelled','completed')
   and exists(select 1 from jsonb_array_elements(t.files) file where file->>'file_id'=old.id::text)
  order by t.id for update
 loop
  if tg_op='DELETE' then
   raise exception 'This RD file is used by an active Packing task. Replace the file instead, or complete or cancel the task first.';
  end if;
  if old.object_path is not distinct from new.object_path then
   raise exception 'This RD file is used by an active Packing task. Replace the file to update its copies in unfinished tasks.';
  end if;
  if task.state='transfer_requested' or exists(
   select 1 from public.wc_packing_transfers where task_id=task.id and state in ('queued','claimed')
  ) then
   raise exception 'An affected Packing task is loading files to the laser. Wait for the transfer to finish, then replace the file again.';
  end if;
  update public.wc_packing_tasks set
   files=(select jsonb_agg(case when file->>'file_id'=old.id::text then
    file || jsonb_build_object('object_path',new.object_path,'filename',new.filename,
     'size_bytes',new.size_bytes,'copies',new.copies)
    else file end order by position)
    from jsonb_array_elements(task.files) with ordinality entry(file,position)),
   cut_file_ids=array_remove(task.cut_file_ids,old.id),
   state='assigned',transferred_at=null,completed_at=null,revision=gen_random_uuid()
  where id=task.id;
 end loop;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
revoke all on function public.wc_box_rd_active_guard() from public,anon,authenticated;

-- Serialize new task snapshots with wc_save_box_rd_file using the same profile lock.
create or replace function public.wc_send_packing_task(p_unit uuid,p_profile text)
returns public.wc_packing_tasks language plpgsql security definer set search_path=public,pg_temp as $$
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
 where signature=p_profile and shipping_product_id=product_id for update;
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
