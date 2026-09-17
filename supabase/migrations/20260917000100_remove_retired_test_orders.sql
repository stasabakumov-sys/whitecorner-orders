do $$
begin
  if exists (select 1 from public.wc_orders where id in ('f076f530-6be8-458b-9606-693e0153c101','f076f530-6be8-458b-9606-693e0153c102') and not (order_source='hub_test' and wix_order_id is null and customer_name='White Corner internal test' and ((id='f076f530-6be8-458b-9606-693e0153c101' and order_number='TEST-BACKDROP') or (id='f076f530-6be8-458b-9606-693e0153c102' and order_number='TEST-CART')))) then raise exception 'Retired test order identifiers were reused; deletion stopped'; end if;
end $$;
delete from public.wc_orders where order_source='hub_test' and wix_order_id is null and customer_name='White Corner internal test' and ((id='f076f530-6be8-458b-9606-693e0153c101' and order_number='TEST-BACKDROP') or (id='f076f530-6be8-458b-9606-693e0153c102' and order_number='TEST-CART'));
create or replace function public.wc_retired_test_order_guard() returns trigger language plpgsql set search_path=public as $$
begin
 if new.id in ('f076f530-6be8-458b-9606-693e0153c101','f076f530-6be8-458b-9606-693e0153c102') or new.order_number in ('TEST-BACKDROP','TEST-CART') then raise exception 'TEST-BACKDROP and TEST-CART are retired';end if;
 return new;
end $$;
create trigger wc_retired_test_order_guard before insert or update on public.wc_orders for each row execute function public.wc_retired_test_order_guard();
revoke all on function public.wc_retired_test_order_guard() from public,anon,authenticated;
