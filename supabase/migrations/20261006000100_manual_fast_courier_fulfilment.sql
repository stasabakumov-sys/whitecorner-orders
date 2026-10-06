-- Record a courier booking made outside Hub without creating a Wix fulfillment.
alter table public.wc_fulfilment
  add column if not exists completion_source text;

alter table public.wc_fulfilment
  add constraint wc_fulfilment_completion_source_check
  check (completion_source is null or completion_source = 'manual_fast_courier');

create function public.wc_complete_manual_fast_courier(p_order_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  result public.wc_fulfilment;
begin
  perform public.wc_require_hub_member(true);

  select * into result from public.wc_fulfilment
    where order_id = p_order_id for update;
  if result.id is null or result.route <> 'Shipping' or result.status <> 'Shipping Preparation' then
    raise exception 'Only an open delivery can be completed manually';
  end if;
  if exists (
    select 1 from public.wc_shipments s
    where s.order_id = p_order_id
      and (s.status in ('Shipping Booked','In Transit','Delivered')
        or s.courier_order_id is not null)
  ) or exists (
    select 1 from public.wc_shipping_fulfillment_sync where order_id = p_order_id
  ) then
    raise exception 'This delivery has a Hub courier or Wix sync record; review it before manual completion';
  end if;

  update public.wc_fulfilment
    set status = 'Fulfilled', completion_source = 'manual_fast_courier',
        fulfilled_at = now(), updated_at = now()
    where id = result.id returning * into result;
  update public.wc_orders set fulfillment_status = 'FULFILLED' where id = p_order_id;
  insert into public.wc_order_activity(order_id, activity_type, message, created_by)
    values (p_order_id, 'note', 'Fulfilled in Hub; Fast Courier booked on website. Wix was not updated.', 'Fulfilment');
  return to_jsonb(result);
end $$;

revoke all on function public.wc_complete_manual_fast_courier(uuid) from public, anon;
grant execute on function public.wc_complete_manual_fast_courier(uuid) to authenticated;
