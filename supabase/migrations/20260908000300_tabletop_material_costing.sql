-- Cost a cart and its one-for-one tabletop replacement as one physical product.
-- Existing calculated snapshots and production units are never rewritten.
create function public.wc_material_tabletop(p_order uuid)
returns table(main_id uuid,upgrade_id uuid) language sql stable security definer set search_path=public as $$
 with rows as (
  select * from wc_order_items where order_id=p_order
  and btrim(coalesce(product_name,'')) !~* '^(delivery|shipping)(\s+(fee|charge))?$'
 ), mains as (
  select * from rows where coalesce(product_name,'') !~* '(additional tabletop|custom cutout|side shelves|integrated ice storage shelf|umbrella hole|support panel|customisation|customization|back panel with|benchtop upgrade)'
 )
 select m.id,a.id from mains m join rows a on a.id<>m.id
 where (select count(*) from rows)=2 and (select count(*) from mains)=1
 and m.product_name ~* '(\mcart\M|\mmobile bar\M)' and a.product_name ~* 'benchtop upgrade'
 and m.quantity>0 and a.quantity=m.quantity
$$;

create function public.wc_material_main(p_item uuid) returns uuid
language sql stable security definer set search_path=public as $$
 select coalesce((select t.main_id from wc_order_items i
 cross join lateral wc_material_tabletop(i.order_id) t
 where i.id=p_item and i.id in(t.main_id,t.upgrade_id)),p_item)
$$;

create function public.wc_material_unit_source(p_item uuid) returns uuid
language sql stable security definer set search_path=public as $$
 -- Legacy adapter shared with Board: the four working units of #10812 live on
 -- the Oak line. Keep their IDs/status history; only pending costing identities move.
 select coalesce((select t.upgrade_id from wc_order_items i join wc_orders o on o.id=i.order_id
 cross join lateral wc_material_tabletop(o.id) t join wc_order_items a on a.id=t.upgrade_id
 where i.id=p_item and t.main_id=i.id and o.order_number='10812' and i.quantity=4
 and a.product_name ~* 'tasmanian oak timber benchtop upgrade'
 and (select count(*) from wc_production_units u where u.order_item_id=a.id and u.unit_index between 1 and 4)=4),p_item)
$$;

create function public.wc_material_line_variant(i public.wc_order_items) returns text
language sql immutable set search_path=public as $$
 select jsonb_build_array(coalesce(nullif(i.catalog_reference->>'catalogItemId',''),nullif(i.catalog_reference->>'productId',''),lower(trim(i.product_name))),
 i.wix_options,i.catalog_reference->'options',i.custom_text_fields,i.description_lines)::text
$$;

create or replace function public.wc_material_variant(i public.wc_order_items) returns text
language sql stable security definer set search_path=public as $$
 select coalesce((select jsonb_build_array('tabletop-replacement-v1',wc_material_line_variant(i),wc_material_line_variant(a),1)::text
 from wc_material_tabletop(i.order_id) t join wc_order_items a on a.id=t.upgrade_id where t.main_id=i.id),wc_material_line_variant(i))
$$;

create function public.wc_material_options(i public.wc_order_items) returns jsonb
language sql stable security definer set search_path=public as $$
 select coalesce(i.wix_options,'{}'::jsonb)||coalesce((select jsonb_build_object('Tabletop replacement',a.product_name)
 from wc_material_tabletop(i.order_id) t join wc_order_items a on a.id=t.upgrade_id where t.main_id=i.id),'{}'::jsonb)
$$;

create or replace function public.wc_calculate_material_item(p_item uuid) returns void
language plpgsql security definer set search_path=public as $$
declare i wc_order_items; o wc_orders; u wc_production_units; p wc_material_profiles; m wc_materials;
 k text; line jsonb; cost_lines jsonb; total numeric; missing boolean;
begin
 perform pg_advisory_xact_lock(20260907,8);
 select * into i from wc_order_items where id=wc_material_main(p_item); if not found then return; end if;
 select * into o from wc_orders where id=i.order_id;
 if o.is_hidden or o.archived or o.order_number='10242' or upper(coalesce(o.fulfillment_status,''))='FULFILLED'
 or upper(coalesce(o.wix_status,'')) in ('CANCELED','CANCELLED') then return; end if;
 if coalesce(o.currency,'AUD')<>'AUD' then return; end if;
 -- A changed legacy unit source must not create a second set of locked costs.
 if exists(select 1 from wc_product_costs c where c.order_id=o.id and c.item_id=i.id and c.state='calculated'
 and not exists(select 1 from wc_production_units source_unit where source_unit.id=c.unit_id and source_unit.order_item_id=wc_material_unit_source(i.id))) then return;end if;
 -- Drop obsolete pending placeholders only; locked history is retained for review.
 delete from wc_product_costs c where c.order_id=o.id and c.state<>'calculated'
 and c.item_id in (select main_id from wc_material_tabletop(o.id) union select upgrade_id from wc_material_tabletop(o.id))
 and not exists(select 1 from wc_production_units source_unit where source_unit.id=c.unit_id and source_unit.order_item_id=wc_material_unit_source(i.id) and source_unit.unit_index<=i.quantity);
 k=wc_material_variant(i);select * into p from wc_material_profiles where variant_key=k;
 for u in select * from wc_production_units where order_item_id=wc_material_unit_source(i.id) and unit_index<=i.quantity and production_status<>'Ready' loop
  if exists(select 1 from wc_product_costs where unit_id=u.id and state='calculated') then continue; end if;
  cost_lines='[]';total=0;missing=false;
  if p.variant_key is not null then
   for line in select value from jsonb_array_elements(p.lines) loop
    select * into m from wc_materials where id=(line->>'material_id')::uuid;
    if not found or not m.active or m.price_gst is null then missing=true;exit;end if;
    cost_lines=cost_lines||jsonb_build_array(jsonb_build_object('kind','material','material_id',m.id,'name',m.name,'unit',m.unit,
     'quantity',(line->>'quantity')::numeric,'price_gst',m.price_gst,'total_gst',round(m.price_gst*(line->>'quantity')::numeric,2)));
    total=total+round(m.price_gst*(line->>'quantity')::numeric,2);
   end loop;
  end if;
  insert into wc_product_costs(unit_id,item_id,order_id,order_number,product_name,unit_index,order_quantity,variant_key,options,state,snapshot,total_gst,calculated_at)
  values(u.id,i.id,o.id,o.order_number,coalesce(i.product_name,'Product'),u.unit_index,i.quantity,k,wc_material_options(i),
   case when p.variant_key is null then 'materials_required' when missing then 'price_required' else 'calculated' end,
   case when p.variant_key is not null and not missing then jsonb_build_object('currency','AUD','gst_inclusive',true,'profile_updated_at',p.updated_at,'lines',cost_lines) end,
   case when p.variant_key is not null and not missing then total end,
   case when p.variant_key is not null and not missing then now() end)
  on conflict(unit_id) do update set item_id=excluded.item_id,unit_index=excluded.unit_index,variant_key=excluded.variant_key,options=excluded.options,product_name=excluded.product_name,
   order_quantity=excluded.order_quantity,state=excluded.state,snapshot=excluded.snapshot,total_gst=excluded.total_gst,calculated_at=excluded.calculated_at
  where wc_product_costs.state<>'calculated';
 end loop;
end $$;


create or replace function public.wc_save_material_profile(p_item uuid,p_expected_key text,p_lines jsonb,p_expected timestamptz)
returns void language plpgsql security definer set search_path=public as $$
declare i wc_order_items; k text; r record; current_version timestamptz;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 perform pg_advisory_xact_lock(20260907,8);
 select * into i from wc_order_items where id=p_item; k=wc_material_variant(i);
 if wc_material_main(p_item) is distinct from p_item then raise exception 'Edit materials on the main cart, not the tabletop upgrade';end if;
 if i.id is null or k is distinct from p_expected_key then raise exception 'Product options changed; refresh';end if;
 select updated_at into current_version from wc_material_profiles where variant_key=k;
 if current_version is distinct from p_expected then raise exception 'Profile changed; refresh';end if;
 if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 100 then raise exception 'Add materials';end if;
 if exists(select 1 from jsonb_array_elements(p_lines) x where (x->>'quantity')::numeric is null or (x->>'quantity')::numeric<=0 or (x->>'quantity')::numeric>100000
 or not exists(select 1 from wc_materials where id=(x->>'material_id')::uuid and active)) then raise exception 'Invalid material or quantity';end if;
 if (select count(*) from jsonb_array_elements(p_lines))<>(select count(distinct x->>'material_id') from jsonb_array_elements(p_lines) x) then raise exception 'Duplicate materials';end if;
 insert into wc_material_profiles(variant_key,product_name,options,lines,updated_by) values(k,coalesce(i.product_name,'Product'),wc_material_options(i),p_lines,auth.uid())
 on conflict(variant_key) do update set lines=excluded.lines,updated_by=excluded.updated_by,updated_at=clock_timestamp();
 for r in select * from wc_order_items where wc_material_variant(wc_order_items)=k loop perform wc_calculate_material_item(r.id);end loop;
end $$;

-- Re-evaluate the whole composition when a source line appears, changes or is removed.
create or replace function public.wc_material_cost_trigger() returns trigger language plpgsql security definer set search_path=public as $$
declare r record; changed_order uuid;
begin
 if tg_table_name='wc_production_units' then perform wc_calculate_material_item(new.order_item_id); return new; end if;
 if tg_op='DELETE' then changed_order=old.order_id;else changed_order=new.order_id;end if;
 for r in select id from wc_order_items where order_id=changed_order loop perform wc_calculate_material_item(r.id);end loop;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
drop trigger material_cost_item on public.wc_order_items;
create trigger material_cost_item after insert or update of quantity,wix_options,catalog_reference,custom_text_fields,description_lines,product_name or delete on public.wc_order_items
 for each row execute function public.wc_material_cost_trigger();

revoke all on function public.wc_material_tabletop(uuid),public.wc_material_main(uuid),public.wc_material_unit_source(uuid),
 public.wc_material_line_variant(public.wc_order_items),public.wc_material_options(public.wc_order_items) from public,anon,authenticated;

-- Reconcile only recognized compositions. No calculated snapshots are changed.
do $$declare r record;begin
 for r in select t.main_id from wc_orders o cross join lateral wc_material_tabletop(o.id) t loop
  perform wc_calculate_material_item(r.main_id);
 end loop;
end $$;
