-- Additive status support; no historical orders or sync rows are processed.
-- Apply before deploying the updated fulfillShipping action.
alter table public.wc_shipping_fulfillment_sync drop constraint wc_shipping_fulfillment_sync_status_check;
alter table public.wc_shipping_fulfillment_sync add constraint wc_shipping_fulfillment_sync_status_check
  check (status in ('pending','syncing','uncertain','failed','synced','completed'));
create or replace function public.wc_claim_shipping_fulfillment(p_order_id uuid, p_token uuid)
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
  if job.status in ('completed','synced') then return jsonb_build_object('status','synced','contractVersion',2,'wixFulfillmentId',job.wix_fulfillment_id); end if;
  if job.token is not null and job.started_at > now()-interval '2 minutes' then
    return jsonb_build_object('status','busy');
  end if;
  previous_status := job.status;
  update wc_shipping_fulfillment_sync set token=p_token, started_at=now(),
    status=case when previous_status='uncertain' then 'uncertain' else 'syncing' end,
    updated_at=now() where order_id=p_order_id;
  return jsonb_build_object('status','claimed','uncertain',previous_status='uncertain','contractVersion',2);
end $$;

create or replace function public.wc_record_shipping_fulfillment(
  p_order_id uuid, p_token uuid, p_status text, p_error text default null,
  p_wix_fulfillment_id text default null
) returns void language plpgsql security definer set search_path = public as $$
declare job public.wc_shipping_fulfillment_sync;
begin
  select * into job from wc_shipping_fulfillment_sync where order_id=p_order_id for update;
  if job.status='completed' and p_status='completed' and job.wix_fulfillment_id=p_wix_fulfillment_id then return; end if;
  if job.token is distinct from p_token or job.order_id is null then
    raise exception 'Shipping synchronization lease lost';
  end if;
  if p_status not in ('uncertain','failed','synced','completed') then raise exception 'Invalid sync result'; end if;
  if p_status='completed' and nullif(btrim(p_wix_fulfillment_id),'') is null then raise exception 'Confirmed Wix fulfillment ID required'; end if;
  update wc_shipping_fulfillment_sync set status=p_status,error=p_error,
    wix_fulfillment_id=coalesce(p_wix_fulfillment_id,wix_fulfillment_id),
    -- Keep the lease while the caller is about to POST to Wix.
    token=case when p_status='uncertain' and p_error is null then p_token else null end,
    updated_at=now() where order_id=p_order_id;
  if p_status in ('synced','completed') then
    update wc_fulfilment set status='Fulfilled',fulfilled_at=coalesce(fulfilled_at,now()),updated_at=now()
      where order_id=p_order_id and route='Shipping';
    update wc_orders set fulfillment_status='FULFILLED',
      raw_order=jsonb_set(coalesce(raw_order,'{}'::jsonb),'{fulfillmentStatus}','"FULFILLED"'::jsonb),
      wix_synced_at=now() where id=p_order_id;
    if not exists(select 1 from wc_order_activity where order_id=p_order_id and activity_type='note' and message in ('WIX fulfilled','WIX fulfilled — shipping booking synchronized')) then
      insert into wc_order_activity(order_id,activity_type,message,created_by) values(p_order_id,'note','WIX fulfilled','Fulfilment');
    end if;

  end if;
end $$;

revoke all on function public.wc_claim_shipping_fulfillment(uuid,uuid) from public,anon,authenticated;
revoke all on function public.wc_record_shipping_fulfillment(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.wc_claim_shipping_fulfillment(uuid,uuid) to service_role;
grant execute on function public.wc_record_shipping_fulfillment(uuid,uuid,text,text,text) to service_role;
