-- Replace an open shipment's packaging atomically. Existing package triggers
-- invalidate approval/quotes and reject an attempted or concurrent booking.
create function public.wc_replace_shipment_packages(
  p_shipment_id uuid, p_expected_version timestamptz, p_packages jsonb
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  shipment public.wc_shipments;
  fulfilment public.wc_fulfilment;
  box jsonb;
  component jsonb;
  sequence integer := 0;
  result jsonb;
begin
  perform public.wc_require_hub_member();
  select f.* into fulfilment from public.wc_fulfilment f
    join public.wc_shipments s on s.fulfilment_id=f.id
    where s.id=p_shipment_id for update of f;
  select * into shipment from public.wc_shipments where id=p_shipment_id for update;
  if shipment.id is null or fulfilment.route<>'Shipping' or fulfilment.status<>'Shipping Preparation'
    or shipment.status in ('Shipping Booked','In Transit','Delivered') then
    raise exception 'Only an open delivery can recalculate packages';
  end if;
  if p_expected_version is null or shipment.updated_at is distinct from p_expected_version then
    raise exception 'Shipment changed. Reload the card before recalculating';
  end if;
  if jsonb_typeof(p_packages) is distinct from 'array' then
    raise exception 'Product packaging must be a list of boxes';
  end if;
  if jsonb_array_length(p_packages)=0 or jsonb_array_length(p_packages)>500 then
    raise exception 'Product packaging must contain 1 to 500 boxes';
  end if;
  for box in select value from jsonb_array_elements(p_packages) loop
    if coalesce((box->>'length_mm')::numeric,0)<=0 or coalesce((box->>'width_mm')::numeric,0)<=0
      or coalesce((box->>'height_mm')::numeric,0)<=0 or coalesce((box->>'weight_kg')::numeric,0)<=0
      or jsonb_typeof(box->'contents') is distinct from 'array' then
      raise exception 'Every box requires dimensions, weight and contents';
    end if;
    if jsonb_array_length(box->'contents')=0 then raise exception 'Every box requires contents'; end if;
    for component in select value from jsonb_array_elements(box->'contents') loop
      if not exists(select 1 from public.wc_order_items i where i.order_id=shipment.order_id
        and i.id=(component->>'order_item_id')::uuid
        and coalesce((component->>'unit_index')::integer,1) between 1 and greatest(1,coalesce(i.quantity,1))) then
        raise exception 'Package contents changed. Reload the card before recalculating';
      end if;
    end loop;
  end loop;
  delete from public.wc_shipment_packages where shipment_id=p_shipment_id;
  for box in select value from jsonb_array_elements(p_packages) loop
    sequence := sequence+1;
    insert into public.wc_shipment_packages(shipment_id,package_no,package_name,length_mm,width_mm,height_mm,weight_kg,contents,source_type)
      values(p_shipment_id,sequence,box->>'package_name',(box->>'length_mm')::numeric,(box->>'width_mm')::numeric,
        (box->>'height_mm')::numeric,(box->>'weight_kg')::numeric,box->'contents','Manual');
  end loop;
  select coalesce(jsonb_agg(to_jsonb(p) order by p.package_no),'[]'::jsonb) into result
    from public.wc_shipment_packages p where p.shipment_id=p_shipment_id;
  select * into shipment from public.wc_shipments where id=p_shipment_id;
  return jsonb_build_object('shipment',to_jsonb(shipment),'packages',result);
end $$;
revoke all on function public.wc_replace_shipment_packages(uuid,timestamptz,jsonb) from public,anon;
grant execute on function public.wc_replace_shipment_packages(uuid,timestamptz,jsonb) to authenticated;
