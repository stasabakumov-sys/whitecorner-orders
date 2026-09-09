-- Local catalogue fields; Wix import does not own or overwrite these columns.
alter table public.wc_shipping_products
 add column short_name text not null default '' check(length(short_name)<=100),
 add column manual_sizes text not null default '' check(length(manual_sizes)<=2000);
