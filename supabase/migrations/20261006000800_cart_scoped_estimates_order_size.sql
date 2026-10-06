-- A historical order may have no Wix Size choice. Hub keeps its confirmed size
-- in wc_order_items.size; repeated Wix imports do not write that local field.
create function public.wc_shop_effective_options(p_item public.wc_order_items)
returns jsonb language sql stable set search_path=public as $$
 select case when nullif(btrim(p_item.size),'') is null or exists(
  select 1 from jsonb_object_keys(coalesce(p_item.wix_options,'{}'::jsonb)) key
  where lower(btrim(key)) in ('size','dimension','dimensions'))
 then coalesce(p_item.wix_options,'{}'::jsonb)
 else coalesce(p_item.wix_options,'{}'::jsonb)||jsonb_build_object('Size',btrim(p_item.size)) end
$$;
revoke all on function public.wc_shop_effective_options(public.wc_order_items) from public,anon,authenticated;

create function public.wc_set_order_item_size(p_item uuid,p_size text)
returns text language plpgsql security definer set search_path=public as $$
declare item public.wc_order_items;product public.wc_shipping_products;confirmed text:=btrim(coalesce(p_size,''));
begin
 if not public.wc_is_hub_manager() then raise exception 'Manager access required';end if;
 select * into item from public.wc_order_items where id=p_item for update;
 if not found then raise exception 'Order item not found';end if;
 select * into product from public.wc_shipping_products where id=public.wc_shop_item_product(p_item);
 if product.id is null or not (lower(btrim(coalesce(product.product_type,'')))='backdrop' or product.product_name ~* 'backdrop|display[[:space:]]+arch[[:space:]]+with[[:space:]]+shelves') then
  raise exception 'A linked Backdrop product is required';
 end if;
 if exists(select 1 from jsonb_object_keys(coalesce(item.wix_options,'{}'::jsonb)) key where lower(btrim(key)) in ('size','dimension','dimensions')) then
  raise exception 'This order already has a Wix size';
 end if;
 if length(confirmed)>50 or confirmed !~* '^[0-9]+(\.[0-9]+)?[[:space:]]*cm[[:space:]]*[x×][[:space:]]*[0-9]+(\.[0-9]+)?[[:space:]]*cm$' then
  raise exception 'Enter a two-dimensional size in centimetres';
 end if;
 if public.wc_shop_manual_metric_size(confirmed) is null then raise exception 'Order size is not valid';end if;
 update public.wc_order_items set size=confirmed where id=p_item;
 return confirmed;
end $$;
revoke all on function public.wc_set_order_item_size(uuid,text) from public,anon;
grant execute on function public.wc_set_order_item_size(uuid,text) to authenticated;

-- Template validation and automatic assignment read the effective order size.

-- Cart uses additive CNC by selected Add-on. Backdrops and Others retain the
-- earlier Shared CNC plus Extra CNC for each applicable part.
create or replace function public.wc_shop_unit_product_parts() returns trigger
language plpgsql security definer set search_path=public as $$
declare template wc_shop_templates;product wc_shipping_products;source_item uuid;main_item uuid;main_order_item wc_order_items;main_options jsonb;applicable jsonb;
 components uuid[];cnc_key text;legacy_cnc numeric;legacy_count integer;main_legacy numeric;
 scope_count integer;additive_count integer;additive_cnc numeric;resolved_cnc numeric;is_cart boolean;
begin
 select * into template from wc_shop_templates where id=new.template_id;
 if template.product_id is null then return new;end if;
 select * into product from wc_shipping_products where id=template.product_id;
 is_cart=lower(btrim(coalesce(product.product_type,'')))='cart' or coalesce(product.product_name,'')~*'(cart|mobile bar|serving table|event bar)';
 select order_item_id into source_item from wc_production_units where id=new.unit_id;
 main_item=coalesce(wc_cost_main(source_item),source_item);
 if wc_shop_item_product(main_item) is distinct from template.product_id then
  raise exception 'Choose a parts template saved in this product card';
 end if;
 select * into main_order_item from wc_order_items where id=main_item;
 main_options=wc_shop_effective_options(main_order_item);
 select array_agg(distinct wc_shop_item_product(i.id)) into components from wc_order_items i
 where i.id=main_item or (i.order_id=main_order_item.order_id and wc_cost_main(i.id)=main_item);
 select jsonb_agg(part.value order by part.ordinality) into applicable
 from jsonb_array_elements(template.parts) with ordinality part
 where (part.value->>'component_product_id')::uuid=any(components)
  and wc_shop_part_matches_options(part.value,main_options);
 if applicable is null or jsonb_array_length(applicable)=0 then raise exception 'No saved parts apply to this product composition';end if;
 new.parts=applicable;
 select count(*),coalesce(sum((template.estimates->>('CNC:'||(part.value->>'id')))::numeric),0),
  coalesce(sum(case when nullif(btrim(part.value->>'option_name'),'') is null
   and part.value->>'component_product_id'=template.product_id::text
   then (template.estimates->>('CNC:'||(part.value->>'id')))::numeric else 0 end),0)
 into legacy_count,legacy_cnc,main_legacy from jsonb_array_elements(applicable) part
 where template.estimates ? ('CNC:'||(part.value->>'id'));
 resolved_cnc=null;
 if template.estimates ? 'CNC' then
  if not is_cart then
   resolved_cnc=(template.estimates->>'CNC')::numeric+legacy_cnc;
  else
   cnc_key=wc_shop_cnc_composition_key(template.parts,template.estimates,template.product_id,main_options,components);
   scope_count=0;additive_count=0;additive_cnc=0;
   if cnc_key<>'CNC' then
    select count(*),count(*) filter(where template.estimates ? ('CNC+'||scope)),
     coalesce(sum((template.estimates->>('CNC+'||scope))::numeric),0)
    into scope_count,additive_count,additive_cnc
    from regexp_split_to_table(substring(cnc_key from 5),'[|]') scope;
   end if;
   if scope_count=0 then resolved_cnc=(template.estimates->>'CNC')::numeric+legacy_cnc;
   elsif additive_count=scope_count then resolved_cnc=(template.estimates->>'CNC')::numeric+main_legacy+additive_cnc;
   elsif template.estimates ? cnc_key then resolved_cnc=(template.estimates->>cnc_key)::numeric;
   elsif additive_count=0 and legacy_count>0 then resolved_cnc=(template.estimates->>'CNC')::numeric+legacy_cnc;
   end if;
  end if;
 end if;
 new.estimates=(select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) from jsonb_each(new.estimates) entry
  where key not like 'CNC@%' and key not like 'CNC+%' and key not like 'CNC:%');
 if resolved_cnc is null then new.estimates=new.estimates-'CNC';
 else new.estimates=jsonb_set(new.estimates,'{CNC}',to_jsonb(resolved_cnc),true);end if;
 return new;
end $$;

-- Recalculate only unstarted snapshots; work already recorded keeps its history.
update public.wc_shop_units unit set parts=unit.parts
from public.wc_production_units production,public.wc_shop_templates template,public.wc_shipping_products product
where production.id=unit.unit_id and production.production_status='New'
 and template.id=unit.template_id and product.id=template.product_id
 and not (lower(btrim(coalesce(product.product_type,'')))='cart' or coalesce(product.product_name,'')~*'(cart|mobile bar|serving table|event bar)')
 and not exists(select 1 from public.wc_shop_intervals work where work.unit_id=unit.unit_id)
 and coalesce(array_length(unit.completed,1),0)=0;
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
 resolved_size=wc_shop_resolved_variant_size(public.wc_shop_effective_options(item),manual_sizes);if resolved_size is null and product_name~*'(cart|mobile bar|serving table|event bar)' then resolved_size=nullif(wc_cart_size_key(public.wc_shop_effective_options(item)),'');end if;
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
 resolved_size=wc_shop_resolved_variant_size(public.wc_shop_effective_options(item),manual_sizes);if resolved_size is null and product_name~*'(cart|mobile bar|serving table|event bar)' then resolved_size=nullif(wc_cart_size_key(public.wc_shop_effective_options(item)),'');end if;resolved_folding=wc_shop_item_folding(item);
 if product_type='Backdrop' or product_name~*'backdrop' then
  if resolved_folding is null then raise exception 'Foldable choice is missing or conflicting in this order. Review its Wix options before CNC';end if;
  select count(*),(array_agg(t.id order by t.id))[1] into candidate_count,template_id from wc_shop_templates t where t.product_id=resolved_product_id and t.size_key is null and t.folding=resolved_folding;
  if candidate_count=0 then select count(*),(array_agg(t.id order by t.id))[1] into candidate_count,template_id from wc_shop_templates t where t.product_id=resolved_product_id and t.size_key=resolved_size and t.folding=resolved_folding;end if;
 else
  select count(*),(array_agg(t.id order by t.id))[1] into candidate_count,template_id from wc_shop_templates t where t.product_id=resolved_product_id and ((t.size_key is null and resolved_size is null) or (t.size_key=resolved_size and t.folding is not distinct from resolved_folding));
 end if;
 if candidate_count=0 then raise exception 'No Estimated min template matches this product. Configure it in Products before CNC';end if;if candidate_count>1 then raise exception 'Multiple Estimated min templates match this product';end if;
 select * into template from wc_shop_templates where id=template_id;resolved_finish=wc_shop_order_finish(public.wc_shop_effective_options(item),'raw');
 if resolved_finish is null then raise exception 'The order finish is unclear. Choose RAW or Painted in Shop Floor before CNC';end if;
 combined_estimates=template.estimates||case when resolved_finish='painted' then coalesce(paint_profile->'estimates','{}'::jsonb) else '{}'::jsonb end;
 perform wc_shop_validate_parts(template.parts,combined_estimates);insert into wc_shop_units(unit_id,template_id,parts,estimates,finish) values(p_unit,template.id,template.parts,combined_estimates,resolved_finish);
end $$;
