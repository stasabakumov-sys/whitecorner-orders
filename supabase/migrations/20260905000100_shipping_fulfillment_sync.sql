-- No historical bookings are processed by this migration.
create table public.wc_shipping_fulfillment_sync (
  order_id uuid primary key references public.wc_orders(id) on delete cascade,
  status text not null check (status in ('pending','syncing','uncertain','failed','synced')),
  error text,
  token uuid,
  started_at timestamptz,
  updated_at timestamptz not null default now(),
  wix_fulfillment_id text
);
alter table public.wc_shipping_fulfillment_sync enable row level security;
create policy shipping_sync_read on public.wc_shipping_fulfillment_sync
  for select to authenticated using (true);

-- Save the acknowledged booking as one transaction before starting Wix work.
create function public.wc_save_shipping_booking(p_shipment_id uuid, p_booking jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare shipment public.wc_shipments;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into shipment from wc_shipments where id=p_shipment_id for update;
  if shipment.id is null or shipment.status <> 'Quote Selected' or shipment.courier_order_id is null then
    raise exception 'A selected shipping quote is required';
  end if;
  update wc_fulfilment set status='Shipping Booked',shipping_booked_at=now(),updated_at=now()
    where id=shipment.fulfilment_id and order_id=shipment.order_id and route='Shipping' and status='Shipping Preparation';
  if not found then raise exception 'Shipping preparation record was not found'; end if;
  update wc_shipments set status='Shipping Booked',
    selected_quote=jsonb_set(selected_quote,'{booking}',p_booking),updated_at=now() where id=p_shipment_id;
  insert into wc_shipping_fulfillment_sync(order_id,status) values(shipment.order_id,'pending')
    on conflict do nothing;
end $$;
revoke all on function public.wc_save_shipping_booking(uuid,jsonb) from public,anon;
grant execute on function public.wc_save_shipping_booking(uuid,jsonb) to authenticated;

-- Only the server can claim work or record its outcome. A lease serializes
-- requests; an uncertain POST is never automatically submitted a second time.
create function public.wc_claim_shipping_fulfillment(p_order_id uuid, p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare job public.wc_shipping_fulfillment_sync; previous_status text;
begin
  if not exists (
    select 1 from wc_fulfilment f join wc_shipments s
      on s.fulfilment_id = f.id and s.order_id = f.order_id
    where f.order_id = p_order_id and f.route = 'Shipping'
      and f.status in ('Shipping Booked','Fulfilled')
      and f.shipping_booked_at is not null
      and s.status in ('Shipping Booked','In Transit','Delivered')
      and s.courier_order_id is not null
  ) then raise exception 'A saved shipping booking is required'; end if;
  insert into wc_shipping_fulfillment_sync(order_id,status) values(p_order_id,'pending')
    on conflict do nothing;
  select * into job from wc_shipping_fulfillment_sync where order_id=p_order_id for update;
  if job.status='synced' then return jsonb_build_object('status','synced'); end if;
  if job.token is not null and job.started_at > now()-interval '2 minutes' then
    return jsonb_build_object('status','busy');
  end if;
  previous_status := job.status;
  update wc_shipping_fulfillment_sync set token=p_token, started_at=now(),
    status=case when previous_status='uncertain' then 'uncertain' else 'syncing' end,
    updated_at=now() where order_id=p_order_id;
  return jsonb_build_object('status','claimed','uncertain',previous_status='uncertain');
end $$;

create function public.wc_record_shipping_fulfillment(
  p_order_id uuid, p_token uuid, p_status text, p_error text default null,
  p_wix_fulfillment_id text default null
) returns void language plpgsql security definer set search_path = public as $$
declare job public.wc_shipping_fulfillment_sync;
begin
  select * into job from wc_shipping_fulfillment_sync where order_id=p_order_id for update;
  if job.token is distinct from p_token or job.order_id is null then
    raise exception 'Shipping synchronization lease lost';
  end if;
  if p_status not in ('uncertain','failed','synced') then raise exception 'Invalid sync result'; end if;
  update wc_shipping_fulfillment_sync set status=p_status,error=p_error,
    wix_fulfillment_id=coalesce(p_wix_fulfillment_id,wix_fulfillment_id),
    -- Keep the lease while the caller is about to POST to Wix.
    token=case when p_status='uncertain' and p_error is null then p_token else null end,
    updated_at=now() where order_id=p_order_id;
  if p_status='synced' then
    update wc_fulfilment set status='Fulfilled',fulfilled_at=coalesce(fulfilled_at,now()),updated_at=now()
      where order_id=p_order_id and route='Shipping';
    update wc_orders set fulfillment_status='FULFILLED',
      raw_order=jsonb_set(coalesce(raw_order,'{}'::jsonb),'{fulfillmentStatus}','"FULFILLED"'::jsonb),
      wix_synced_at=now() where id=p_order_id;
    insert into wc_order_activity(order_id,activity_type,message,created_by)
      values(p_order_id,'note','WIX fulfilled — shipping booking synchronized','Fulfilment');
  elsif p_error is not null then
    insert into wc_order_activity(order_id,activity_type,message,created_by)
      values(p_order_id,'note','Wix fulfillment sync: ' || p_error,'Fulfilment');
  end if;
end $$;

revoke all on function public.wc_claim_shipping_fulfillment(uuid,uuid) from public,anon,authenticated;
revoke all on function public.wc_record_shipping_fulfillment(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.wc_claim_shipping_fulfillment(uuid,uuid) to service_role;
grant execute on function public.wc_record_shipping_fulfillment(uuid,uuid,text,text,text) to service_role;
