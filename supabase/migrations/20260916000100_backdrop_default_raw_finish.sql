-- Backdrops without an explicit Colour/Finish are unfinished timber and must
-- follow the RAW production path. Other products still require an explicit
-- finish, and conflicting finish values remain an error instead of being guessed.
create or replace function public.wc_shop_order_finish(options jsonb,missing_default text) returns text
language sql immutable set search_path=public as $$
 with normalized as(
  select lower(btrim(wc_shop_option_text(value))) value
  from jsonb_each(case when jsonb_typeof(options)='object' then options else '{}'::jsonb end)
  where lower(btrim(key)) ~ '^(colou?r|finish)$'
 ),resolved as(
  select count(distinct value) count,min(value) value from normalized where value<>''
 )
 select case when count=0 then case when missing_default in('raw','painted') then missing_default end
  when count<>1 then null
  when value ~ '^(raw|unpainted|natural)([[:space:]]*/|$)' then 'raw'
  else 'painted' end from resolved
$$;

create or replace function public.wc_shop_auto_snapshot(p_unit uuid) returns void language plpgsql security definer set search_path=public as $$
declare source_item uuid;main_item uuid;item_options jsonb;resolved_product_id uuid;product_name text;manual_sizes text;resolved_size text;resolved_folding text;resolved_finish text;candidate_count integer;template_id uuid;template wc_shop_templates;
begin
 if exists(select 1 from wc_shop_units where unit_id=p_unit) then return;end if;
 select order_item_id into source_item from wc_production_units where id=p_unit;if source_item is null then raise exception 'Production unit does not have an order item';end if;
 main_item=coalesce(wc_cost_main(source_item),source_item);resolved_product_id=wc_shop_item_product(main_item);if resolved_product_id is null then raise exception 'No Product card matches this order item. Link it in Products before CNC';end if;
 select i.wix_options,p.product_name,p.manual_sizes into item_options,product_name,manual_sizes from wc_order_items i cross join wc_shipping_products p where i.id=main_item and p.id=resolved_product_id;
 resolved_size=wc_shop_resolved_variant_size(item_options,manual_sizes);if resolved_size is null and product_name~*'(cart|mobile bar|serving table|event bar)' then resolved_size=nullif(wc_cart_size_key(item_options),'');end if;resolved_folding=wc_shop_variant_folding(item_options);
 select count(*),(array_agg(t.id order by t.id))[1] into candidate_count,template_id from wc_shop_templates t where t.product_id=resolved_product_id and ((t.size_key is null and resolved_size is null and coalesce(product_name,'')!~*'backdrop') or (t.size_key=resolved_size and t.folding is not distinct from resolved_folding));
 if candidate_count=0 then raise exception 'No Estimated min template matches this product size. Configure it in Products before CNC';end if;if candidate_count>1 then raise exception 'Multiple Estimated min templates match this product size';end if;
 select * into template from wc_shop_templates where id=template_id;
 resolved_finish=wc_shop_order_finish(item_options,case when product_name~*'backdrop' then 'raw' end);
 if resolved_finish is null then raise exception 'The order finish is unclear. Choose RAW or Painted in Shop Floor before CNC';end if;
 perform wc_shop_validate_parts(template.parts,template.estimates);insert into wc_shop_units(unit_id,template_id,parts,estimates,finish) values(p_unit,template.id,template.parts,template.estimates,resolved_finish);
end $$;

revoke all on function public.wc_shop_order_finish(jsonb,text) from public,anon,authenticated;
