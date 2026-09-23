-- Exclude non-product delivery charges from laser Packing.
create or replace function public.wc_assign_packing_task(p_unit uuid,p_profile text,p_worker uuid)
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
 and btrim(coalesce(i.product_name,'')) !~* '^(delivery|shipping)(\s+(fee|charge))?$'
 and btrim(coalesce(main.product_name,'')) !~* '^(delivery|shipping)(\s+(fee|charge))?$'
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

create or replace function public.wc_packing_candidates()
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
  and btrim(coalesce(i.product_name,'')) !~* '^(delivery|shipping)(\s+(fee|charge))?$'
  and btrim(coalesce(main.product_name,'')) !~* '^(delivery|shipping)(\s+(fee|charge))?$'
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
