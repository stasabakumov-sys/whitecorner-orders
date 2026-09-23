-- The order drawer can display Wix choices from several saved fields. CNC must
-- resolve the same explicit choice, without guessing when sources disagree.
create function public.wc_shop_item_folding(i public.wc_order_items) returns text
language sql stable set search_path=public as $$
 with objects as (
  select value obj from jsonb_array_elements(jsonb_build_array(
   i.wix_options,i.custom_text_fields,i.catalog_reference->'options',i.catalog_reference#>'{options,options}',
   i.raw_item->'options',i.raw_item->'selectedOptions',i.raw_item->'selected_options',
   i.raw_item->'choices',i.raw_item->'customTextFields',i.raw_item->'custom_text_fields',i.raw_item->'lineItemOptions',
   i.raw_item->'catalogReference'->'options',i.raw_item#>'{catalogReference,options,options}'))
 ), choices as (
  select wc_catalog_text(value) value
  from objects cross join lateral jsonb_each(case when jsonb_typeof(obj)='object' then obj else '{}'::jsonb end)
  where lower(btrim(key))='foldable'
  union all
  select wc_catalog_text(coalesce(value->'value',value->'description',value->'text',value->'plainText',value->'plainTextValue'))
  from jsonb_array_elements(case when jsonb_typeof(i.description_lines)='array' then i.description_lines else '[]'::jsonb end)
  where jsonb_typeof(value)='object'
   and lower(btrim(wc_catalog_text(coalesce(value->'name',value->'label',value->'title'))))='foldable'
  union all
  select wc_catalog_text(coalesce(value->'value',value->'description',value->'text',value->'plainText',value->'plainTextValue'))
  from jsonb_array_elements(case when jsonb_typeof(i.raw_item->'descriptionLines')='array' then i.raw_item->'descriptionLines' else '[]'::jsonb end)
  where jsonb_typeof(value)='object'
   and lower(btrim(wc_catalog_text(coalesce(value->'name',value->'label',value->'title'))))='foldable'
 ), normalized as (
  select wc_shop_variant_folding(jsonb_build_object('Foldable',value)) folding from choices
 )
 select case when count(*)>0 and count(*)=count(folding) and count(distinct folding)=1 then min(folding) end
 from normalized
$$;

create or replace function public.wc_shop_check_template_variant() returns trigger language plpgsql security definer set search_path=public as $$
declare template wc_shop_templates;item wc_order_items;product_name text;product_type text;manual_sizes text;resolved_size text;resolved_folding text;
begin
 select * into template from wc_shop_templates where id=new.template_id;
 select p.product_name,p.product_type,p.manual_sizes into product_name,product_type,manual_sizes from wc_shipping_products p where p.id=template.product_id;
 select i.* into item from wc_production_units u join wc_order_items i on i.id=coalesce(wc_cost_main(u.order_item_id),u.order_item_id) where u.id=new.unit_id;
 resolved_folding=wc_shop_item_folding(item);
 if product_type='Backdrop' or coalesce(product_name,'')~*'backdrop' then
  if template.folding is distinct from resolved_folding then raise exception 'Estimated time template does not match the folding option';end if;return new;
 end if;
 if template.size_key is null then return new;end if;
 resolved_size=wc_shop_resolved_variant_size(item.wix_options,manual_sizes);if resolved_size is null and product_name~*'(cart|mobile bar|serving table|event bar)' then resolved_size=nullif(wc_cart_size_key(item.wix_options),'');end if;
 if template.size_key is distinct from resolved_size or template.folding is distinct from resolved_folding then raise exception 'Estimated time template does not match the product size and folding option';end if;return new;
end $$;

create or replace function public.wc_shop_auto_snapshot(p_unit uuid) returns void language plpgsql security definer set search_path=public as $$
declare source_item uuid;main_item uuid;item wc_order_items;resolved_product_id uuid;product_name text;product_type text;manual_sizes text;resolved_size text;resolved_folding text;resolved_finish text;candidate_count integer;template_id uuid;template wc_shop_templates;paint_profile jsonb;combined_estimates jsonb;
begin
 if exists(select 1 from wc_shop_units where unit_id=p_unit) then return;end if;
 select order_item_id into source_item from wc_production_units where id=p_unit;if source_item is null then raise exception 'Production unit does not have an order item';end if;
 main_item=coalesce(wc_cost_main(source_item),source_item);resolved_product_id=wc_shop_item_product(main_item);if resolved_product_id is null then raise exception 'No Product card matches this order item. Link it in Products before CNC';end if;
 select i.* into item from wc_order_items i where i.id=main_item;
 select p.product_name,p.product_type,p.manual_sizes,p.backdrop_paint_profile into product_name,product_type,manual_sizes,paint_profile from wc_shipping_products p where p.id=resolved_product_id;
 resolved_size=wc_shop_resolved_variant_size(item.wix_options,manual_sizes);if resolved_size is null and product_name~*'(cart|mobile bar|serving table|event bar)' then resolved_size=nullif(wc_cart_size_key(item.wix_options),'');end if;resolved_folding=wc_shop_item_folding(item);
 if product_type='Backdrop' or product_name~*'backdrop' then
  if resolved_folding is null then raise exception 'Foldable choice is missing or conflicting in this order. Review its Wix options before CNC';end if;
  select count(*),(array_agg(t.id order by t.id))[1] into candidate_count,template_id from wc_shop_templates t where t.product_id=resolved_product_id and t.size_key is null and t.folding=resolved_folding;
  if candidate_count=0 then select count(*),(array_agg(t.id order by t.id))[1] into candidate_count,template_id from wc_shop_templates t where t.product_id=resolved_product_id and t.size_key=resolved_size and t.folding=resolved_folding;end if;
 else
  select count(*),(array_agg(t.id order by t.id))[1] into candidate_count,template_id from wc_shop_templates t where t.product_id=resolved_product_id and ((t.size_key is null and resolved_size is null) or (t.size_key=resolved_size and t.folding is not distinct from resolved_folding));
 end if;
 if candidate_count=0 then raise exception 'No Estimated min template matches this product. Configure it in Products before CNC';end if;if candidate_count>1 then raise exception 'Multiple Estimated min templates match this product';end if;
 select * into template from wc_shop_templates where id=template_id;resolved_finish=wc_shop_order_finish(item.wix_options,'raw');
 if resolved_finish is null then raise exception 'The order finish is unclear. Choose RAW or Painted in Shop Floor before CNC';end if;
 combined_estimates=template.estimates||case when resolved_finish='painted' then coalesce(paint_profile->'estimates','{}'::jsonb) else '{}'::jsonb end;
 perform wc_shop_validate_parts(template.parts,combined_estimates);insert into wc_shop_units(unit_id,template_id,parts,estimates,finish) values(p_unit,template.id,template.parts,combined_estimates,resolved_finish);
end $$;

revoke all on function public.wc_shop_item_folding(public.wc_order_items) from public,anon,authenticated;
