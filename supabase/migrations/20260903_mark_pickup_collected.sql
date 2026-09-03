create or replace function public.wc_mark_pickup_collected(p_fulfilment_id uuid)
returns table(result_fulfilment_id uuid, result_order_id uuid, completed_at timestamptz)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order_id uuid;
  v_route text;
  v_completed_at timestamptz := now();
begin
  select f.order_id, f.route
    into v_order_id, v_route
    from public.wc_fulfilment f
   where f.id = p_fulfilment_id
   for update;

  if v_order_id is null then
    raise exception 'Pickup record not found';
  end if;
  if v_route <> 'Pickup' then
    raise exception 'Only pickup orders can be marked as collected';
  end if;

  update public.wc_fulfilment
     set status = 'Fulfilled',
         fulfilled_at = coalesce(fulfilled_at, v_completed_at),
         updated_at = v_completed_at
   where id = p_fulfilment_id;

  update public.wc_orders
     set fulfillment_status = 'FULFILLED',
         updated_at = v_completed_at
   where id = v_order_id;

  return query select p_fulfilment_id, v_order_id, v_completed_at;
end;
$$;

grant execute on function public.wc_mark_pickup_collected(uuid) to authenticated;

