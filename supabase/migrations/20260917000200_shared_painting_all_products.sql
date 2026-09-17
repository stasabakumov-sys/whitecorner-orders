-- Every product stores structural work separately from one optional Painting profile.
-- Existing unambiguous painting estimates are preserved in that shared profile.
do $$
begin
 if exists(
  select 1 from public.wc_shop_templates t cross join lateral jsonb_each(t.estimates) e
  where t.product_id is not null and e.key like 'Painting:%' group by t.product_id,e.key having count(distinct e.value::text)>1
 ) then raise exception 'Conflicting Painting estimates exist for one product; resolve them before migration';end if;
end $$;

with legacy as(
 select t.product_id,jsonb_object_agg(e.key,e.value) estimates
 from public.wc_shop_templates t cross join lateral jsonb_each(t.estimates) e
 where t.product_id is not null and e.key like 'Painting:%' group by t.product_id
)
update public.wc_shipping_products p set backdrop_paint_profile=jsonb_set(
 jsonb_set(p.backdrop_paint_profile,'{estimates}',legacy.estimates||coalesce(p.backdrop_paint_profile->'estimates','{}'::jsonb)),
 '{version}',to_jsonb(coalesce((p.backdrop_paint_profile->>'version')::integer,0)+1)
),updated_at=clock_timestamp() from legacy where legacy.product_id=p.id;

update public.wc_shop_templates t set estimates=coalesce((select jsonb_object_agg(e.key,e.value) from jsonb_each(t.estimates) e where e.key not like 'Painting:%'),'{}'::jsonb)
where exists(select 1 from jsonb_each(t.estimates) e where e.key like 'Painting:%');

create or replace function public.wc_shop_save_product_template(p_id uuid,p_product uuid,p_name text,p_parts jsonb,p_estimates jsonb,p_version integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid();saved wc_shop_templates;clean_estimates jsonb;
begin
 if actor is null then raise exception 'Sign in required';end if;
 if not exists(select 1 from wc_shipping_products where id=p_product and active) then raise exception 'Product not found';end if;
 select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into clean_estimates from jsonb_each(coalesce(p_estimates,'{}'::jsonb)) where key not like 'Painting:%';
 perform wc_shop_validate_parts(p_parts,clean_estimates);
 if jsonb_array_length(p_parts)>100 then raise exception 'Use no more than 100 parts';end if;
 if exists(select 1 from jsonb_array_elements(p_parts) part where coalesce(part->>'component_product_id','')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or not exists(select 1 from wc_shop_product_components(p_product) c where c.id=(part->>'component_product_id')::uuid)) then raise exception 'Choose the product or one of its add-ons for every part';end if;
 if p_id is null then insert into wc_shop_templates(product_id,name,parts,estimates) values(p_product,btrim(p_name),p_parts,clean_estimates) returning * into saved;
 else update wc_shop_templates set name=btrim(p_name),parts=p_parts,estimates=clean_estimates,version=version+1 where id=p_id and product_id=p_product and version=p_version returning * into saved;if not found then raise exception 'Template changed. Reload before editing';end if;end if;
 return to_jsonb(saved);
end $$;

create or replace function public.wc_save_product_paint_profile(p_product uuid,p_lines jsonb,p_estimates jsonb,p_confirmed boolean,p_expected integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare current jsonb;next_profile jsonb;next_version integer;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 select backdrop_paint_profile into current from wc_shipping_products where id=p_product and active for update;
 if current is null then raise exception 'Product not found';end if;
 if coalesce((current->>'version')::integer,0) is distinct from coalesce(p_expected,0) then raise exception 'Painting profile changed; refresh';end if;
 if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines)>100 then raise exception 'Invalid paint materials';end if;
 if exists(select 1 from jsonb_array_elements(p_lines) l where (l->>'quantity')::numeric is null or (l->>'quantity')::numeric<=0 or (l->>'quantity')::numeric>100000 or not exists(select 1 from wc_materials where id=(l->>'material_id')::uuid and active)) then raise exception 'Invalid paint material quantity';end if;
 if (select count(*) from jsonb_array_elements(p_lines))<>(select count(distinct l->>'material_id') from jsonb_array_elements(p_lines) l) then raise exception 'Duplicate paint materials';end if;
 if jsonb_typeof(p_estimates) is distinct from 'object' or exists(select 1 from jsonb_each_text(p_estimates) where key not in ('Painting:First primer','Painting:First sanding','Painting:Second primer','Painting:Second sanding','Painting:Finish coat') or value::numeric<0 or value::numeric>100000 or value::numeric='NaN'::numeric) then raise exception 'Invalid painting minutes';end if;
 next_version=coalesce((current->>'version')::integer,0)+1;next_profile=jsonb_build_object('lines',p_lines,'estimates',p_estimates,'materials_confirmed',coalesce(p_confirmed,false),'version',next_version,'updated_at',clock_timestamp(),'updated_by',auth.uid());
 update wc_shipping_products set backdrop_paint_profile=next_profile,updated_at=clock_timestamp() where id=p_product;return next_profile;
end $$;

create or replace function public.wc_save_backdrop_paint_profile(p_product uuid,p_lines jsonb,p_estimates jsonb,p_confirmed boolean,p_expected integer)
returns jsonb language sql security definer set search_path=public as $$select public.wc_save_product_paint_profile(p_product,p_lines,p_estimates,p_confirmed,p_expected)$$;

create or replace function public.wc_shop_auto_snapshot(p_unit uuid) returns void language plpgsql security definer set search_path=public as $$
declare source_item uuid;main_item uuid;item_options jsonb;resolved_product_id uuid;product_name text;product_type text;manual_sizes text;resolved_size text;resolved_folding text;resolved_finish text;candidate_count integer;template_id uuid;template wc_shop_templates;paint_profile jsonb;combined_estimates jsonb;
begin
 if exists(select 1 from wc_shop_units where unit_id=p_unit) then return;end if;
 select order_item_id into source_item from wc_production_units where id=p_unit;if source_item is null then raise exception 'Production unit does not have an order item';end if;
 main_item=coalesce(wc_cost_main(source_item),source_item);resolved_product_id=wc_shop_item_product(main_item);if resolved_product_id is null then raise exception 'No Product card matches this order item. Link it in Products before CNC';end if;
 select i.wix_options,p.product_name,p.product_type,p.manual_sizes,p.backdrop_paint_profile into item_options,product_name,product_type,manual_sizes,paint_profile from wc_order_items i cross join wc_shipping_products p where i.id=main_item and p.id=resolved_product_id;
 resolved_size=wc_shop_resolved_variant_size(item_options,manual_sizes);if resolved_size is null and product_name~*'(cart|mobile bar|serving table|event bar)' then resolved_size=nullif(wc_cart_size_key(item_options),'');end if;resolved_folding=wc_shop_variant_folding(item_options);
 if product_type='Backdrop' or product_name~*'backdrop' then select count(*),(array_agg(t.id order by t.id))[1] into candidate_count,template_id from wc_shop_templates t where t.product_id=resolved_product_id and t.size_key is null and t.folding=resolved_folding;if candidate_count=0 then select count(*),(array_agg(t.id order by t.id))[1] into candidate_count,template_id from wc_shop_templates t where t.product_id=resolved_product_id and t.size_key=resolved_size and t.folding=resolved_folding;end if;
 else select count(*),(array_agg(t.id order by t.id))[1] into candidate_count,template_id from wc_shop_templates t where t.product_id=resolved_product_id and ((t.size_key is null and resolved_size is null) or (t.size_key=resolved_size and t.folding is not distinct from resolved_folding));end if;
 if candidate_count=0 then raise exception 'No Estimated min template matches this product. Configure it in Products before CNC';end if;if candidate_count>1 then raise exception 'Multiple Estimated min templates match this product';end if;
 select * into template from wc_shop_templates where id=template_id;resolved_finish=wc_shop_order_finish(item_options,'raw');
 if resolved_finish is null then raise exception 'The order finish is unclear. Choose RAW or Painted in Shop Floor before CNC';end if;
 combined_estimates=template.estimates||case when resolved_finish='painted' then coalesce(paint_profile->'estimates','{}'::jsonb) else '{}'::jsonb end;
 perform wc_shop_validate_parts(template.parts,combined_estimates);insert into wc_shop_units(unit_id,template_id,parts,estimates,finish) values(p_unit,template.id,template.parts,combined_estimates,resolved_finish);
end $$;

revoke all on function public.wc_save_product_paint_profile(uuid,jsonb,jsonb,boolean,integer) from public,anon;
grant execute on function public.wc_save_product_paint_profile(uuid,jsonb,jsonb,boolean,integer) to authenticated;
revoke all on function public.wc_shop_save_product_template(uuid,uuid,text,jsonb,jsonb,integer),public.wc_save_backdrop_paint_profile(uuid,jsonb,jsonb,boolean,integer),public.wc_shop_auto_snapshot(uuid) from public,anon;
grant execute on function public.wc_shop_save_product_template(uuid,uuid,text,jsonb,jsonb,integer),public.wc_save_backdrop_paint_profile(uuid,jsonb,jsonb,boolean,integer) to authenticated;
