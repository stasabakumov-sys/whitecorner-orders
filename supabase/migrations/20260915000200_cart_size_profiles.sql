-- Cart operational data is scoped by the exact Wix size. Other product types
-- keep their existing profile model.
create or replace function public.wc_cart_size_key(options jsonb) returns text language sql immutable set search_path=public as $$
 with values as(
  select btrim(regexp_replace(lower(case jsonb_typeof(value) when 'object' then coalesce(value->>'original',value->>'value','') else value#>>'{}' end),'[^a-z0-9]+',' ','g')) value
  from jsonb_each(case when jsonb_typeof(options)='object' then options else '{}'::jsonb end)
  where lower(btrim(key)) ~ '^(size|dimensions?)$'
 ) select case when count(distinct value)=1 then min(value) else '' end from values where value<>''
$$;

alter table public.wc_shipping_packages add column if not exists size_key text;
alter table public.wc_shipping_rules add column if not exists size_key text;
alter table public.wc_shipping_packages drop constraint if exists wc_shipping_packages_shipping_product_id_source_type_package_no_key;
alter table public.wc_shipping_packages drop constraint if exists wc_shipping_packages_shipping_product_id_source_type_packag_key;

with ranked as(
 select pr.shipping_product_id,wc_cart_size_key(pr.template_item->'wix_options') size_key,
  row_number() over(partition by pr.shipping_product_id order by pr.updated_at desc) rank
 from wc_delivery_packaging_profiles pr join wc_shipping_products p on p.id=pr.shipping_product_id and p.product_type='Cart'
 where wc_cart_size_key(pr.template_item->'wix_options')<>'' and not exists(
  select 1 from jsonb_each_text(coalesce(pr.template_item->'wix_options','{}')) option
  where lower(btrim(option.key)) in('internal shelf','side shelves') and lower(btrim(option.value)) in('yes','true','included','selected'))
) update wc_shipping_packages package set size_key=ranked.size_key
 from ranked where ranked.rank=1 and package.shipping_product_id=ranked.shipping_product_id and package.size_key is null;

with assigned as(select shipping_product_id,min(size_key) size_key from wc_shipping_packages where size_key is not null group by shipping_product_id)
update wc_shipping_rules rule set size_key=assigned.size_key from assigned
where rule.shipping_product_id=assigned.shipping_product_id and rule.size_key is null;

create unique index if not exists wc_shipping_packages_product_size_source_no_uq
 on public.wc_shipping_packages(shipping_product_id,size_key,source_type,package_no) nulls not distinct;

-- The previous Cart base key already contained Size in its option object, so
-- it can be migrated safely. Global option profiles are deliberately not copied.
insert into wc_material_profiles(variant_key,product_name,options,lines,updated_by,updated_at,shipping_product_id,template_item,work_costs,pans_cost_gst,materials_confirmed,costing_version)
select jsonb_build_array('catalog-v4-cart-base',old.shipping_product_id,wc_cart_size_key(old.options),case when coalesce(old.template_item->>'standard_top_excluded','false')::boolean then 'standard-top-excluded' else 'complete' end)::text,
 old.product_name,old.options,old.lines,old.updated_by,old.updated_at,old.shipping_product_id,old.template_item,old.work_costs,old.pans_cost_gst,old.materials_confirmed,old.costing_version
from wc_material_profiles old join wc_shipping_products product on product.id=old.shipping_product_id and product.product_type='Cart'
where old.costing_version=2 and old.template_item->>'kind'='main' and wc_cart_size_key(old.options)<>''
 and old.variant_key like '["catalog-v3-cart-base",%'
on conflict(variant_key) do nothing;

with sizes as(
 select distinct pr.shipping_product_id,wc_cart_size_key(pr.template_item->'wix_options') size_key
 from wc_delivery_packaging_profiles pr join wc_shipping_products p on p.id=pr.shipping_product_id and p.product_type='Cart'
 union select distinct p.id,wc_cart_size_key(i.wix_options) from wc_order_items i join wc_shipping_products p on p.product_type='Cart' and
  ((p.wix_product_id is not null and p.wix_product_id=coalesce(nullif(i.catalog_reference->>'catalogItemId',''),i.catalog_reference->>'productId')) or (p.wix_product_id is null and lower(p.product_name)=lower(i.product_name)))
), package_numbers as(
 select p.id shipping_product_id,n package_no from wc_shipping_products p cross join lateral generate_series(1,greatest(1,(select count(*)::int from wc_shipping_packages x where x.shipping_product_id=p.id and x.source_type='Base'))) n where p.product_type='Cart'
) insert into wc_shipping_packages(shipping_product_id,size_key,source_type,package_no,package_name,contents,notes)
select sizes.shipping_product_id,sizes.size_key,'Base',numbers.package_no,'Base box '||numbers.package_no,'[]','Complete this Cart size independently.'
from sizes join package_numbers numbers using(shipping_product_id) where sizes.size_key<>''
on conflict(shipping_product_id,size_key,source_type,package_no) do nothing;

with sizes as(
 select distinct pr.shipping_product_id,wc_cart_size_key(pr.template_item->'wix_options') size_key
 from wc_delivery_packaging_profiles pr join wc_shipping_products p on p.id=pr.shipping_product_id and p.product_type='Cart'
 union select distinct p.id,wc_cart_size_key(i.wix_options) from wc_order_items i join wc_shipping_products p on p.product_type='Cart' and
  ((p.wix_product_id is not null and p.wix_product_id=coalesce(nullif(i.catalog_reference->>'catalogItemId',''),i.catalog_reference->>'productId')) or (p.wix_product_id is null and lower(p.product_name)=lower(i.product_name)))
), rules as(
 select distinct on(shipping_product_id,rule_type,lower(btrim(match_name)),lower(btrim(coalesce(match_value,'')))) * from wc_shipping_rules
 where effect_type='Add package' order by shipping_product_id,rule_type,lower(btrim(match_name)),lower(btrim(coalesce(match_value,''))),updated_at desc
) insert into wc_shipping_rules(shipping_product_id,size_key,rule_type,match_name,match_value,effect_type,package_count_delta,package_name,active,exact_match_required,notes)
select sizes.shipping_product_id,sizes.size_key,rules.rule_type,rules.match_name,rules.match_value,rules.effect_type,rules.package_count_delta,rules.package_name,rules.active,rules.exact_match_required,'Complete this Cart size independently.'
from sizes join rules using(shipping_product_id) where sizes.size_key<>'' and not exists(select 1 from wc_shipping_rules existing where existing.shipping_product_id=sizes.shipping_product_id and existing.size_key=sizes.size_key and existing.rule_type=rules.rule_type and lower(btrim(existing.match_name))=lower(btrim(rules.match_name)) and lower(btrim(coalesce(existing.match_value,'')))=lower(btrim(coalesce(rules.match_value,''))));

create or replace function public.wc_catalog_parts(p_main uuid) returns table(item_id uuid,multiplier numeric,variant_key text,kind text)
language sql stable security definer set search_path=public as $$
 with m as(
  select i.*,s.id shipping_id,s.product_type,exists(select 1 from wc_material_tabletop(i.order_id) t where t.main_id=i.id) top_replaced
  from wc_order_items i left join wc_shipping_products s on (s.wix_product_id is not null and s.wix_product_id=coalesce(nullif(i.catalog_reference->>'catalogItemId',''),i.catalog_reference->>'productId')) or (s.wix_product_id is null and lower(s.product_name)=lower(i.product_name)) where i.id=p_main
 ), main_part as(
  select m.id,1::numeric,case when m.product_type='Cart' then jsonb_build_array('catalog-v4-cart-base',m.shipping_id,wc_cart_size_key(m.wix_options),case when m.top_replaced then 'standard-top-excluded' else 'complete' end)::text else jsonb_build_array('catalog-v2',(select wc_material_line_variant(i) from wc_order_items i where i.id=m.id),case when m.top_replaced then 'standard-top-excluded' else 'complete' end)::text end,'main'::text from m
 ), option_parts as(
  select m.id,1::numeric,jsonb_build_array('catalog-v4-cart-option',m.shipping_id,wc_cart_size_key(m.wix_options),lower(btrim(o.key)),lower(btrim(o.value#>>'{}')))::text,'option:'||o.key
  from m cross join lateral jsonb_each(coalesce(m.wix_options,'{}')) o where m.product_type='Cart' and lower(btrim(o.key)) in('internal shelf','side shelves') and lower(btrim(o.value#>>'{}')) in('yes','true','included','selected')
 ), addon_parts as(
  select i.id,i.quantity::numeric/m.quantity,jsonb_build_array('catalog-v2',wc_material_line_variant(i),case when i.id=m.id and m.top_replaced then 'standard-top-excluded' else 'complete' end)::text,case when i.product_name~*'custom cutout' then 'processing' when i.product_name~*'benchtop upgrade' then 'replacement' else 'addon' end
  from m join wc_order_items i on i.order_id=m.order_id where i.id<>m.id and m.quantity>0 and wc_cost_main(i.id)=m.id and btrim(coalesce(i.product_name,''))!~*'^(delivery|shipping)(\s+(fee|charge))?$'
 ) select * from main_part union all select * from option_parts union all select * from addon_parts
$$;

alter table wc_shop_templates drop constraint if exists wc_shop_template_scope;
alter table wc_shop_templates add constraint wc_shop_template_scope check(
 (size_key is null and folding is null) or
 (folding in('foldable','nonfoldable') and size_key ~ '^[1-9][0-9]{0,4}x[1-9][0-9]{0,4}$') or
 (folding is null and length(btrim(size_key)) between 1 and 300));
create unique index if not exists wc_shop_template_sized_product_unique on wc_shop_templates(product_id,size_key) where size_key is not null and folding is null;

create or replace function public.wc_shop_save_sized_product_template(p_id uuid,p_product uuid,p_name text,p_parts jsonb,p_estimates jsonb,p_version integer,p_size text) returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;saved wc_shop_templates;
begin
 if auth.uid() is null then raise exception 'Sign in required';end if;
 if p_size is null or length(btrim(p_size)) not between 1 and 300 then raise exception 'Choose a Cart size';end if;
 perform pg_advisory_xact_lock(hashtextextended('shop-template:'||p_product::text||':'||p_size,0));
 if exists(select 1 from wc_shop_templates where product_id=p_product and size_key=p_size and folding is null and id is distinct from p_id) then raise exception 'Estimated time already exists for this Cart size.';end if;
 result=wc_shop_save_product_template(p_id,p_product,p_name,p_parts,p_estimates,p_version);
 update wc_shop_templates set size_key=p_size,folding=null where id=(result->>'id')::uuid returning * into saved;return to_jsonb(saved);
end $$;

create or replace function public.wc_shop_resolved_variant_size(options jsonb,manual_sizes text) returns text language sql immutable set search_path=public as $$
 with ordered as(select wc_shop_variant_size(options) value),order_values as(
  select wc_shop_manual_metric_size(wc_shop_option_text(value)) value from jsonb_each(coalesce(options,'{}')) where btrim(key) ~* '^size|dimensions?$'
 ),loose_order as(select count(*) count,case when count(*)=count(value) and count(distinct value)=1 then min(value) end value from order_values),manual as(
  select wc_shop_manual_metric_size(line) value from regexp_split_to_table(coalesce(manual_sizes,''),E'\r?\n') line where btrim(line)<>''
 ),fallback as(select case when count(*)=count(value) and count(distinct value)=1 then min(value) end value from manual)
 select coalesce((select value from ordered),(select case when loose_order.count=0 then fallback.value when loose_order.value=fallback.value then loose_order.value end from loose_order cross join fallback))
$$;

create or replace function public.wc_shop_check_template_variant() returns trigger language plpgsql security definer set search_path=public as $$
declare template wc_shop_templates;item wc_order_items;product_name text;manual_sizes text;resolved_size text;resolved_folding text;
begin
 select * into template from wc_shop_templates where id=new.template_id;
 select p.product_name,p.manual_sizes into product_name,manual_sizes from wc_shipping_products p where p.id=template.product_id;
 if template.size_key is null then
  if coalesce(product_name,'') ~* 'backdrop' then raise exception 'Assign a size and folding option to this product template in Estimated min first';end if;return new;
 end if;
 select i.* into item from wc_production_units u join wc_order_items i on i.id=coalesce(wc_cost_main(u.order_item_id),u.order_item_id) where u.id=new.unit_id;
 resolved_size=wc_shop_resolved_variant_size(item.wix_options,manual_sizes);if resolved_size is null and product_name~*'(cart|mobile bar|serving table|event bar)' then resolved_size=nullif(wc_cart_size_key(item.wix_options),'');end if;resolved_folding=wc_shop_variant_folding(item.wix_options);
 if template.size_key is distinct from resolved_size or template.folding is distinct from resolved_folding then raise exception 'Estimated time template does not match the product size and folding option';end if;return new;
end $$;

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
 select * into template from wc_shop_templates where id=template_id;resolved_finish=wc_shop_order_finish(item_options);if resolved_finish is null then raise exception 'The order finish is unclear. Choose RAW or Painted in Shop Floor before CNC';end if;
 perform wc_shop_validate_parts(template.parts,template.estimates);insert into wc_shop_units(unit_id,template_id,parts,estimates,finish) values(p_unit,template.id,template.parts,template.estimates,resolved_finish);
end $$;

-- Cart option costs are catalogue data. Allow an operator to create either
-- supported option profile before that option has appeared in an order.
create or replace function public.wc_save_catalog_cost_profile(p_main uuid,p_item uuid,p_key text,p_lines jsonb,p_work jsonb,p_pans numeric,p_confirmed boolean,p_expected timestamptz) returns void language plpgsql security definer set search_path=public as $$
declare part record; i wc_order_items; pid uuid; prior timestamptz; r record; stored wc_material_profiles; top_excluded boolean; profile_options jsonb; key_parts jsonb; option_name text;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 perform pg_advisory_xact_lock(20260907,8);
 select * into part from wc_catalog_parts(p_main) where item_id=p_item and variant_key=p_key;
 if found then
  select * into i from wc_order_items where id=p_item;
  top_excluded=part.kind='main' and exists(select 1 from wc_material_tabletop(i.order_id));
  profile_options=case when part.kind like 'option:%' then jsonb_build_object(substring(part.kind from 8),'Yes') else i.wix_options end;
 else
  -- A Cart size and either of its options are editable catalogue data even
  -- when the current source order used another size or did not select it.
  begin key_parts=p_key::jsonb;exception when others then key_parts=null;end;
  select * into i from wc_order_items where id=p_item and id=p_main and wc_cost_main(id)=id;
  if i.id is not null then pid=wc_catalog_register(p_item);end if;
  if i.id is not null and jsonb_typeof(key_parts)='array' and key_parts->>1=pid::text
   and coalesce(key_parts->>2,'')<>'' and exists(select 1 from wc_shipping_products where id=pid and product_type='Cart')
   and exists(select 1 from wc_delivery_packaging_profiles pr where pr.shipping_product_id=pid and wc_cart_size_key(pr.template_item->'wix_options')=key_parts->>2 union all select 1 from wc_order_items source where wc_shop_item_product(source.id)=pid and wc_cart_size_key(source.wix_options)=key_parts->>2) then
    if jsonb_array_length(key_parts)=4 and key_parts->>0='catalog-v4-cart-base' and key_parts->>3 in('complete','standard-top-excluded') then
     part.kind='main';part.multiplier=1;top_excluded=key_parts->>3='standard-top-excluded';profile_options=jsonb_build_object('Size',key_parts->>2);
    elsif jsonb_array_length(key_parts)=5 and key_parts->>0='catalog-v4-cart-option' and key_parts->>4='yes' and key_parts->>3 in('internal shelf','side shelves') then
     option_name=case key_parts->>3 when 'internal shelf' then 'Internal Shelf' else 'Side shelves' end;
     part.kind='option:'||option_name;part.multiplier=1;top_excluded=false;profile_options=jsonb_build_object('Size',key_parts->>2,option_name,'Yes');
    else raise exception 'Product composition changed; refresh';end if;
  else
   -- A catalogue profile outlives its example order. Its saved identity remains immutable.
   select * into stored from wc_material_profiles where variant_key=p_key and costing_version=2 and template_item->>'source_item_id'=p_item::text;
   if stored.variant_key is null or exists(select 1 from wc_order_items where id=p_item) or stored.template_item->'source_item' is null then raise exception 'Product composition changed; refresh';end if;
   select * into i from jsonb_populate_record(null::wc_order_items,stored.template_item->'source_item');
   part.kind=stored.template_item->>'kind';part.multiplier=(stored.template_item->>'multiplier')::numeric;top_excluded=(stored.template_item->>'standard_top_excluded')::boolean;profile_options=stored.options;
  end if;
 end if;
 select updated_at into prior from wc_material_profiles where variant_key=p_key;
 if prior is distinct from p_expected then raise exception 'Profile changed; refresh';end if;
 if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines)>100 then raise exception 'Invalid materials';end if;
 if exists(select 1 from jsonb_array_elements(p_lines) l where (l->>'quantity')::numeric is null or (l->>'quantity')::numeric<=0 or (l->>'quantity')::numeric>100000 or not exists(select 1 from wc_materials where id=(l->>'material_id')::uuid and active)) then raise exception 'Invalid material quantity';end if;
 if (select count(*) from jsonb_array_elements(p_lines))<>(select count(distinct l->>'material_id') from jsonb_array_elements(p_lines) l) then raise exception 'Duplicate materials';end if;
 if jsonb_typeof(p_work) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_work))<>4 or exists(select 1 from unnest(array['cnc','assembly','sanding','painting']) category where not (p_work ? category) or (p_work->>category)::numeric<0 or (p_work->>category)::numeric>1000000 or (p_work->>category)::numeric='NaN'::numeric) then raise exception 'Enter every work cost; use zero for no work';end if;
 if p_pans<0 or p_pans>1000000 or p_pans='NaN'::numeric then raise exception 'Invalid Pans cost';end if;
 pid=coalesce(pid,wc_catalog_register(p_item),stored.shipping_product_id);
 insert into wc_material_profiles(variant_key,product_name,options,lines,updated_by,shipping_product_id,template_item,work_costs,pans_cost_gst,materials_confirmed,costing_version)
 values(p_key,i.product_name,profile_options,p_lines,auth.uid(),pid,jsonb_build_object('source_item_id',i.id,'kind',part.kind,'main_item_id',p_main,'multiplier',part.multiplier,'options',profile_options,'has_pans',part.kind='main' and wc_catalog_pans(i),'source_item',jsonb_build_object('id',i.id,'product_name',i.product_name,'quantity',1,'wix_options',i.wix_options,'catalog_reference',i.catalog_reference,'custom_text_fields',i.custom_text_fields,'description_lines',i.description_lines),'standard_top_excluded',top_excluded),p_work,case when part.kind='main' and wc_catalog_pans(i) then p_pans else 0 end,coalesce(p_confirmed,false),2)
 on conflict(variant_key) do update set options=excluded.options,lines=excluded.lines,work_costs=excluded.work_costs,pans_cost_gst=excluded.pans_cost_gst,shipping_product_id=excluded.shipping_product_id,template_item=excluded.template_item,materials_confirmed=excluded.materials_confirmed,costing_version=2,updated_by=auth.uid(),updated_at=clock_timestamp();
 for r in select id from wc_order_items where wc_cost_main(id)=id loop perform wc_calculate_material_item(r.id);end loop;
end $$;

revoke all on function public.wc_save_catalog_cost_profile(uuid,uuid,text,jsonb,jsonb,numeric,boolean,timestamptz) from public,anon;
grant execute on function public.wc_save_catalog_cost_profile(uuid,uuid,text,jsonb,jsonb,numeric,boolean,timestamptz) to authenticated;
revoke all on function public.wc_cart_size_key(jsonb),public.wc_shop_save_sized_product_template(uuid,uuid,text,jsonb,jsonb,integer,text),public.wc_shop_resolved_variant_size(jsonb,text),public.wc_shop_check_template_variant(),public.wc_shop_auto_snapshot(uuid) from public,anon;
grant execute on function public.wc_shop_save_sized_product_template(uuid,uuid,text,jsonb,jsonb,integer,text) to authenticated;
