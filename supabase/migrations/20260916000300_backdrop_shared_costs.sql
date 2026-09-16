-- Backdrop production inputs are product-owned, not size-owned.
-- Structure stays separate for Foldable and Non-foldable; painting is one
-- product-wide add-on. Existing size-specific rows remain intact as fallback.

alter table public.wc_shop_templates drop constraint if exists wc_shop_template_scope;
alter table public.wc_shop_templates add constraint wc_shop_template_scope check(
 (size_key is null and folding is null) or
 (size_key is null and folding in ('foldable','nonfoldable')) or
 (folding in ('foldable','nonfoldable') and size_key ~ '^[1-9][0-9]{0,4}x[1-9][0-9]{0,4}$') or
 (folding is null and length(btrim(size_key)) between 1 and 300));
create unique index if not exists wc_shop_template_backdrop_shared_unique
 on public.wc_shop_templates(product_id,folding) where size_key is null and folding is not null;

alter table public.wc_shipping_products add column if not exists backdrop_paint_profile jsonb not null
 default '{"lines":[],"estimates":{},"materials_confirmed":false,"version":0}'::jsonb;
alter table public.wc_shipping_products add constraint wc_shipping_products_backdrop_paint_profile_check check(
 jsonb_typeof(backdrop_paint_profile)='object' and
 jsonb_typeof(backdrop_paint_profile->'lines')='array' and
 jsonb_typeof(backdrop_paint_profile->'estimates')='object' and
 jsonb_typeof(backdrop_paint_profile->'materials_confirmed')='boolean' and
 jsonb_typeof(backdrop_paint_profile->'version')='number');

create function public.wc_shop_save_backdrop_template(p_id uuid,p_product uuid,p_name text,p_parts jsonb,p_estimates jsonb,p_version integer,p_folding text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;saved wc_shop_templates;structural jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in required';end if;
 if p_folding not in ('foldable','nonfoldable') then raise exception 'Choose Foldable or Non-foldable';end if;
 if not exists(select 1 from wc_shipping_products where id=p_product and active and (product_type='Backdrop' or product_name~*'backdrop')) then raise exception 'Backdrop product not found';end if;
 select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into structural from jsonb_each(coalesce(p_estimates,'{}'::jsonb)) where key!~'^Painting:';
 perform pg_advisory_xact_lock(hashtextextended('backdrop-template:'||p_product::text||':'||p_folding,0));
 if exists(select 1 from wc_shop_templates where product_id=p_product and size_key is null and folding=p_folding and id is distinct from p_id) then raise exception 'Estimated time already exists for this folding option. Open its template before editing.';end if;
 result=wc_shop_save_product_template(p_id,p_product,p_name,p_parts,structural,p_version);
 update wc_shop_templates set size_key=null,folding=p_folding where id=(result->>'id')::uuid returning * into saved;
 return to_jsonb(saved);
end $$;

create function public.wc_save_shared_backdrop_material_profile(p_product uuid,p_folding text,p_lines jsonb,p_confirmed boolean,p_expected timestamptz)
returns void language plpgsql security definer set search_path=public as $$
declare profile_key text;prior timestamptz;v_product_name text;options jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 if p_folding not in ('foldable','nonfoldable') then raise exception 'Choose Foldable or Non-foldable';end if;
 select product_name into v_product_name from wc_shipping_products where id=p_product and active and (product_type='Backdrop' or product_name~*'backdrop');
 if v_product_name is null then raise exception 'Backdrop product not found';end if;
 if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines)>100 then raise exception 'Invalid materials';end if;
 if exists(select 1 from jsonb_array_elements(p_lines) l where (l->>'quantity')::numeric is null or (l->>'quantity')::numeric<=0 or (l->>'quantity')::numeric>100000 or not exists(select 1 from wc_materials where id=(l->>'material_id')::uuid and active)) then raise exception 'Invalid material quantity';end if;
 if (select count(*) from jsonb_array_elements(p_lines))<>(select count(distinct l->>'material_id') from jsonb_array_elements(p_lines) l) then raise exception 'Duplicate materials';end if;
 profile_key=jsonb_build_array('backdrop-structure-v2',p_product,p_folding)::text;
 perform pg_advisory_xact_lock(hashtextextended(profile_key,0));
 select updated_at into prior from wc_material_profiles where variant_key=profile_key;
 if prior is distinct from p_expected then raise exception 'Profile changed; refresh';end if;
 options=jsonb_build_object('Foldable',case when p_folding='foldable' then 'YES' else 'NO' end);
 insert into wc_material_profiles(variant_key,product_name,options,lines,updated_by,shipping_product_id,template_item,work_costs,pans_cost_gst,materials_confirmed,costing_version)
 values(profile_key,v_product_name,options,p_lines,auth.uid(),p_product,jsonb_build_object('profile_scope','backdrop-structure-v2','kind','main','multiplier',1,'folding',p_folding,'options',options,'standard_top_excluded',false),'{}',0,coalesce(p_confirmed,false),2)
 on conflict(variant_key) do update set lines=excluded.lines,materials_confirmed=excluded.materials_confirmed,updated_by=auth.uid(),updated_at=clock_timestamp();
end $$;

create function public.wc_save_backdrop_paint_profile(p_product uuid,p_lines jsonb,p_estimates jsonb,p_confirmed boolean,p_expected integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare current jsonb;next_profile jsonb;next_version integer;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 select backdrop_paint_profile into current from wc_shipping_products where id=p_product and active and (product_type='Backdrop' or product_name~*'backdrop') for update;
 if current is null then raise exception 'Backdrop product not found';end if;
 if coalesce((current->>'version')::integer,0) is distinct from coalesce(p_expected,0) then raise exception 'Painting profile changed; refresh';end if;
 if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines)>100 then raise exception 'Invalid paint materials';end if;
 if exists(select 1 from jsonb_array_elements(p_lines) l where (l->>'quantity')::numeric is null or (l->>'quantity')::numeric<=0 or (l->>'quantity')::numeric>100000 or not exists(select 1 from wc_materials where id=(l->>'material_id')::uuid and active)) then raise exception 'Invalid paint material quantity';end if;
 if (select count(*) from jsonb_array_elements(p_lines))<>(select count(distinct l->>'material_id') from jsonb_array_elements(p_lines) l) then raise exception 'Duplicate paint materials';end if;
 if jsonb_typeof(p_estimates) is distinct from 'object' or exists(select 1 from jsonb_each_text(p_estimates) where key not in ('Painting:First primer','Painting:First sanding','Painting:Second primer','Painting:Second sanding','Painting:Finish coat') or value::numeric<0 or value::numeric>100000 or value::numeric='NaN'::numeric) then raise exception 'Invalid painting minutes';end if;
 next_version=coalesce((current->>'version')::integer,0)+1;
 next_profile=jsonb_build_object('lines',p_lines,'estimates',p_estimates,'materials_confirmed',coalesce(p_confirmed,false),'version',next_version,'updated_at',clock_timestamp(),'updated_by',auth.uid());
 update wc_shipping_products set backdrop_paint_profile=next_profile,updated_at=clock_timestamp() where id=p_product;
 return next_profile;
end $$;

revoke all on function public.wc_shop_save_backdrop_template(uuid,uuid,text,jsonb,jsonb,integer,text),public.wc_save_shared_backdrop_material_profile(uuid,text,jsonb,boolean,timestamptz),public.wc_save_backdrop_paint_profile(uuid,jsonb,jsonb,boolean,integer) from public,anon;
grant execute on function public.wc_shop_save_backdrop_template(uuid,uuid,text,jsonb,jsonb,integer,text),public.wc_save_shared_backdrop_material_profile(uuid,text,jsonb,boolean,timestamptz),public.wc_save_backdrop_paint_profile(uuid,jsonb,jsonb,boolean,integer) to authenticated;

create or replace function public.wc_shop_check_template_variant() returns trigger language plpgsql security definer set search_path=public as $$
declare template wc_shop_templates;item wc_order_items;product_name text;product_type text;manual_sizes text;resolved_size text;resolved_folding text;
begin
 select * into template from wc_shop_templates where id=new.template_id;
 select p.product_name,p.product_type,p.manual_sizes into product_name,product_type,manual_sizes from wc_shipping_products p where p.id=template.product_id;
 select i.* into item from wc_production_units u join wc_order_items i on i.id=coalesce(wc_cost_main(u.order_item_id),u.order_item_id) where u.id=new.unit_id;
 resolved_folding=wc_shop_variant_folding(item.wix_options);
 if product_type='Backdrop' or coalesce(product_name,'')~*'backdrop' then
  if template.folding is distinct from resolved_folding then raise exception 'Estimated time template does not match the folding option';end if;return new;
 end if;
 if template.size_key is null then return new;end if;
 resolved_size=wc_shop_resolved_variant_size(item.wix_options,manual_sizes);if resolved_size is null and product_name~*'(cart|mobile bar|serving table|event bar)' then resolved_size=nullif(wc_cart_size_key(item.wix_options),'');end if;
 if template.size_key is distinct from resolved_size or template.folding is distinct from resolved_folding then raise exception 'Estimated time template does not match the product size and folding option';end if;return new;
end $$;

create or replace function public.wc_shop_auto_snapshot(p_unit uuid) returns void language plpgsql security definer set search_path=public as $$
declare source_item uuid;main_item uuid;item_options jsonb;resolved_product_id uuid;product_name text;product_type text;manual_sizes text;resolved_size text;resolved_folding text;resolved_finish text;candidate_count integer;template_id uuid;template wc_shop_templates;paint_profile jsonb;combined_estimates jsonb;
begin
 if exists(select 1 from wc_shop_units where unit_id=p_unit) then return;end if;
 select order_item_id into source_item from wc_production_units where id=p_unit;if source_item is null then raise exception 'Production unit does not have an order item';end if;
 main_item=coalesce(wc_cost_main(source_item),source_item);resolved_product_id=wc_shop_item_product(main_item);if resolved_product_id is null then raise exception 'No Product card matches this order item. Link it in Products before CNC';end if;
 select i.wix_options,p.product_name,p.product_type,p.manual_sizes,p.backdrop_paint_profile into item_options,product_name,product_type,manual_sizes,paint_profile from wc_order_items i cross join wc_shipping_products p where i.id=main_item and p.id=resolved_product_id;
 resolved_size=wc_shop_resolved_variant_size(item_options,manual_sizes);if resolved_size is null and product_name~*'(cart|mobile bar|serving table|event bar)' then resolved_size=nullif(wc_cart_size_key(item_options),'');end if;resolved_folding=wc_shop_variant_folding(item_options);
 if product_type='Backdrop' or product_name~*'backdrop' then
  select count(*),(array_agg(t.id order by t.id))[1] into candidate_count,template_id from wc_shop_templates t where t.product_id=resolved_product_id and t.size_key is null and t.folding=resolved_folding;
  if candidate_count=0 then select count(*),(array_agg(t.id order by t.id))[1] into candidate_count,template_id from wc_shop_templates t where t.product_id=resolved_product_id and t.size_key=resolved_size and t.folding=resolved_folding;end if;
 else
  select count(*),(array_agg(t.id order by t.id))[1] into candidate_count,template_id from wc_shop_templates t where t.product_id=resolved_product_id and ((t.size_key is null and resolved_size is null) or (t.size_key=resolved_size and t.folding is not distinct from resolved_folding));
 end if;
 if candidate_count=0 then raise exception 'No Estimated min template matches this product. Configure it in Products before CNC';end if;if candidate_count>1 then raise exception 'Multiple Estimated min templates match this product';end if;
 select * into template from wc_shop_templates where id=template_id;resolved_finish=wc_shop_order_finish(item_options,case when product_type='Backdrop' or product_name~*'backdrop' then 'raw' end);
 if resolved_finish is null then raise exception 'The order finish is unclear. Choose RAW or Painted in Shop Floor before CNC';end if;
 combined_estimates=template.estimates||case when resolved_finish='painted' then coalesce(paint_profile->'estimates','{}'::jsonb) else '{}'::jsonb end;
 perform wc_shop_validate_parts(template.parts,combined_estimates);insert into wc_shop_units(unit_id,template_id,parts,estimates,finish) values(p_unit,template.id,template.parts,combined_estimates,resolved_finish);
end $$;

revoke all on function public.wc_shop_check_template_variant(),public.wc_shop_auto_snapshot(uuid) from public,anon,authenticated;
