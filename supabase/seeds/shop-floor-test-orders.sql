-- Explicitly requested by the owner: two Hub-only practice orders.
-- Stable IDs make reruns a no-op; never reset a tested product's progress.
insert into public.wc_orders(id,order_source,wix_order_id,order_number,customer_name,fulfillment_status,payment_status,currency,internal_comment)
values
 ('f076f530-6be8-458b-9606-693e0153c101','hub_test',null,'TEST-BACKDROP','White Corner internal test','NOT_FULFILLED','NOT_PAID','AUD','TEST: Hub only. Practice Shop Floor; no real customer, payment or delivery.'),
 ('f076f530-6be8-458b-9606-693e0153c102','hub_test',null,'TEST-CART','White Corner internal test','NOT_FULFILLED','NOT_PAID','AUD','TEST: Hub only. Practice Shop Floor; no real customer, payment or delivery.')
on conflict(id) do nothing;
insert into public.wc_order_items(id,order_id,wix_line_item_id,product_name,quantity,unit_price)
values
 ('f076f530-6be8-458b-9606-693e0153c201','f076f530-6be8-458b-9606-693e0153c101',null,'TEST Backdrop',1,0),
 ('f076f530-6be8-458b-9606-693e0153c202','f076f530-6be8-458b-9606-693e0153c102',null,'TEST Cart',1,0)
on conflict(id) do nothing;
insert into public.wc_production_units(id,order_item_id,unit_index,production_status)
values
 ('f076f530-6be8-458b-9606-693e0153c301','f076f530-6be8-458b-9606-693e0153c201',1,'New'),
 ('f076f530-6be8-458b-9606-693e0153c302','f076f530-6be8-458b-9606-693e0153c202',1,'New')
on conflict(id) do nothing;
