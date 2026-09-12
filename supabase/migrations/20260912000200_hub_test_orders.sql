-- Hub-owned fixtures have no external identity. Existing/imported orders remain Wix-owned.
alter table public.wc_orders add column order_source text not null default 'wix';
alter table public.wc_orders alter column wix_order_id drop not null;
alter table public.wc_orders add constraint wc_order_source_identity check (
 (order_source='wix' and wix_order_id is not null) or
 (order_source='hub_test' and wix_order_id is null)
);
create function public.wc_test_order_guard() returns trigger language plpgsql set search_path=public as $$
begin
 if tg_op='UPDATE' and new.order_source is distinct from old.order_source then
  raise exception 'Order source cannot be changed';
 end if;
 if new.order_source='hub_test' then
  if new.order_number not like 'TEST-%' or new.order_number is null then raise exception 'Test order number must start with TEST-';end if;
  -- Pickup keeps older delivery-review clients from requesting quotes, too.
  new.delivery_type='Pickup';new.delivery_title='Internal test — no collection or delivery';
  new.buyer_email=null;new.phone=null;new.delivery_address='{}';
  new.subtotal=0;new.shipping=0;new.tax=0;new.discount=0;new.total=0;new.additional_fees=0;
 end if;
 return new;
end $$;
create trigger wc_test_order_guard before insert or update on public.wc_orders
 for each row execute function public.wc_test_order_guard();

-- Enforced on the server, including older Hub clients and background jobs.
create function public.wc_test_order_isolation() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from wc_orders where id=new.order_id and order_source='hub_test') then
  if tg_table_name in ('wc_product_costs','wc_order_pans_costs') then return null;end if;
  raise exception 'TEST orders are for Hub production only; delivery and fulfilment are disabled';
 end if;
 return new;
end $$;
create trigger wc_test_no_fulfilment before insert or update on public.wc_fulfilment for each row execute function public.wc_test_order_isolation();
create trigger wc_test_no_shipments before insert or update on public.wc_shipments for each row execute function public.wc_test_order_isolation();
create trigger wc_test_no_material_cost before insert or update on public.wc_product_costs for each row execute function public.wc_test_order_isolation();
create trigger wc_test_no_pans_cost before insert or update on public.wc_order_pans_costs for each row execute function public.wc_test_order_isolation();
revoke all on function public.wc_test_order_guard(),public.wc_test_order_isolation() from public,anon,authenticated;

-- Practice products must not register themselves in the real packaging catalogue.
create or replace function public.wc_catalog_register(p_item uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare i wc_order_items; pid uuid; wix text;
begin
 select * into i from wc_order_items where id=p_item;if not found then return null;end if;
 if exists(select 1 from wc_orders where id=i.order_id and order_source='hub_test') then return null;end if;
 wix=coalesce(nullif(i.catalog_reference->>'catalogItemId',''),nullif(i.catalog_reference->>'productId',''));
 if wix is not null then select id into pid from wc_shipping_products where wix_product_id=wix;end if;
 if pid is null then
  select id into pid from wc_shipping_products where wix_product_id is null and lower(product_name)=lower(i.product_name);
  if pid is not null and wix is not null then update wc_shipping_products set wix_product_id=wix where id=pid;end if;
 end if;
 if pid is null then insert into wc_shipping_products(wix_product_id,product_name,product_type) values(wix,coalesce(i.product_name,'Unnamed product'),'Other') returning id into pid;end if;
 return pid;
end $$;
