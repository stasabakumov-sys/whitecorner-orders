-- Use Wix after-tax delivery totals for exception validation. No row updates or external calls.
create or replace function public.wc_approve_delivery_review(p_order_id uuid,p_actor uuid,p_reason text,p_input_key text,p_invoice_cents bigint,p_order_updated_at timestamptz,p_items jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare r wc_delivery_reviews; invoice_cents bigint;
begin
 if length(btrim(p_reason))<3 then raise exception 'Approval reason required'; end if;
 perform 1 from wc_orders where id=p_order_id and updated_at=p_order_updated_at for update;
 if not found or (select jsonb_agg(to_jsonb(i) order by i.id) from wc_order_items i where order_id=p_order_id) is distinct from (select jsonb_agg(e order by e->>'id') from jsonb_array_elements(p_items) e) then raise exception 'Order changed; reload review'; end if;
 select round((coalesce((o.raw_order#>>'{shippingInfo,cost,totalPriceAfterTax,amount}')::numeric,o.shipping,0)+coalesce((select sum(coalesce((i.raw_item#>>'{totalPriceAfterTax,amount}')::numeric,i.unit_price*i.quantity)) from wc_order_items i where i.order_id=o.id and i.product_name ~* '^(delivery|shipping)(\s+(fee|charge))?$'),0))*100)::bigint into invoice_cents from wc_orders o where o.id=p_order_id;
 select * into strict r from wc_delivery_reviews where order_id=p_order_id for update;
 if r.state<>'quoted' or r.input_key is distinct from p_input_key or invoice_cents is distinct from p_invoice_cents then raise exception 'Review changed; reload before approving'; end if;
 update wc_delivery_reviews set approval=jsonb_build_object('actor',p_actor,'at',now(),'reason',btrim(p_reason),'input_key',p_input_key,'invoice_cents',invoice_cents),
 approval_history=approval_history||jsonb_build_array(jsonb_build_object('actor',p_actor,'at',now(),'reason',btrim(p_reason),'input_key',p_input_key,'invoice_cents',invoice_cents)),updated_at=now() where order_id=p_order_id;
end $$;
