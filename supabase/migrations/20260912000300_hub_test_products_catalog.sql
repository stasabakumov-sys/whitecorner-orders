-- Make the two owner-requested practice products visible in Products.
-- Their orders remain protected by order_source='hub_test' delivery/cost guards.
insert into public.wc_shipping_products(id,wix_product_id,product_name,product_type,active,notes)
values
 ('f076f530-6be8-458b-9606-693e0153c401',null,'TEST Backdrop','Backdrop',true,'Hub test product — no Wix, customer, payment or delivery.'),
 ('f076f530-6be8-458b-9606-693e0153c402',null,'TEST Cart','Cart',true,'Hub test product — no Wix, customer, payment or delivery.')
on conflict (lower(product_name)) where wix_product_id is null do update
set product_type=excluded.product_type,active=true,notes=excluded.notes,updated_at=clock_timestamp();
