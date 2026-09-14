-- Resolve a missing Wix size from one explicit manual product size during Shop Floor assignment.
-- Wix order options remain authoritative whenever they contain a valid metric size.
create function public.wc_shop_manual_metric_size(value text) returns text language plpgsql immutable set search_path=public as $$
declare explicit text;m text[];a numeric;b numeric;
begin
 explicit=wc_shop_metric_size(value);if explicit is not null then return explicit;end if;
 m=regexp_match(lower(btrim(value)),'^(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)$');if m is null then return null;end if;
 a=m[1]::numeric*10;b=m[2]::numeric*10;
 if a<=0 or b<=0 or a>10000 or b>10000 or trunc(a)<>a or trunc(b)<>b then return null;end if;
 return greatest(a,b)::int::text||'x'||least(a,b)::int::text;
end $$;

create function public.wc_shop_resolved_variant_size(options jsonb,manual_sizes text) returns text language sql immutable set search_path=public as $$
 with ordered as(select wc_shop_variant_size(options) value),order_values as(
  select wc_shop_manual_metric_size(wc_shop_option_text(value)) value from jsonb_each(coalesce(options,'{}')) where btrim(key) ~* '^size|dimensions?$'
 ),loose_order as(select count(*) count,case when count(*)=count(value) and count(distinct value)=1 then min(value) end value from order_values),manual as(
  select wc_shop_manual_metric_size(line) value from regexp_split_to_table(coalesce(manual_sizes,''),E'\r?\n') line where btrim(line)<>''
 ),fallback as(select case when count(*)=count(value) and count(distinct value)=1 then min(value) end value from manual)
 select coalesce((select value from ordered),(select case when loose_order.count=0 then fallback.value when loose_order.value=fallback.value then loose_order.value end from loose_order cross join fallback))
$$;

create or replace function public.wc_shop_check_template_variant() returns trigger language plpgsql security definer set search_path=public as $$
declare template wc_shop_templates;item wc_order_items;product_name text;manual_sizes text;resolved_size text;
begin
 select * into template from wc_shop_templates where id=new.template_id;
 select p.product_name,p.manual_sizes into product_name,manual_sizes from wc_shipping_products p where p.id=template.product_id;
 if template.size_key is null then
  if coalesce(product_name,'') ~* 'backdrop' then raise exception 'Assign a size and folding option to this product template in Estimated min first';end if;
  return new;
 end if;
 select i.* into item from wc_production_units u join wc_order_items i on i.id=coalesce(wc_cost_main(u.order_item_id),u.order_item_id) where u.id=new.unit_id;
 resolved_size=wc_shop_resolved_variant_size(item.wix_options,manual_sizes);
 if template.size_key is distinct from resolved_size or template.folding is distinct from wc_shop_variant_folding(item.wix_options) then
  raise exception 'Estimated time template does not match the product size and folding option';
 end if;
 return new;
end $$;

revoke all on function public.wc_shop_manual_metric_size(text),public.wc_shop_resolved_variant_size(jsonb,text),public.wc_shop_check_template_variant() from public,anon,authenticated;
