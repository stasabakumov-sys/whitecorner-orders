-- All Cart products share one base cost profile per structural base and add
-- selected option costs independently. Existing calculated snapshots stay locked.
update public.wc_shipping_products
set product_type='Cart'
where product_type is distinct from 'Cart'
  and product_name ~* '(cart|mobile bar|serving table)';

create or replace function public.wc_catalog_register(p_item uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare i wc_order_items; pid uuid; wix text; kind text;
begin
 select * into i from wc_order_items where id=p_item;if not found then return null;end if;
 wix=coalesce(nullif(i.catalog_reference->>'catalogItemId',''),nullif(i.catalog_reference->>'productId',''));
 kind=case when coalesce(i.product_name,'')~*'(cart|mobile bar|serving table)' then 'Cart' when coalesce(i.product_name,'')~*'(backdrop|arch|panel|wall|plinth)' then 'Backdrop' else 'Other' end;
 if wix is not null then select id into pid from wc_shipping_products where wix_product_id=wix;end if;
 if pid is null then
  select id into pid from wc_shipping_products where wix_product_id is null and lower(product_name)=lower(i.product_name);
  if pid is not null and wix is not null then update wc_shipping_products set wix_product_id=wix,product_type=kind where id=pid;end if;
 end if;
 if pid is null then insert into wc_shipping_products(wix_product_id,product_name,product_type) values(wix,coalesce(i.product_name,'Unnamed product'),kind) returning id into pid;end if;
 return pid;
end $$;

create or replace function public.wc_catalog_parts(p_main uuid) returns table(item_id uuid,multiplier numeric,variant_key text,kind text)
language sql stable security definer set search_path=public as $$
 with m as (
  select i.*,s.id shipping_id,s.product_type,
   exists(select 1 from wc_material_tabletop(i.order_id) t where t.main_id=i.id) top_replaced
  from wc_order_items i left join wc_shipping_products s on
   (s.wix_product_id is not null and s.wix_product_id=coalesce(nullif(i.catalog_reference->>'catalogItemId',''),i.catalog_reference->>'productId'))
   or (s.wix_product_id is null and lower(s.product_name)=lower(i.product_name))
  where i.id=p_main
 ), main_part as (
  select m.id item_id,1::numeric multiplier,
   case when m.product_type='Cart' then jsonb_build_array('catalog-v3-cart-base',m.shipping_id,
    coalesce((select jsonb_object_agg(key,value order by key) from jsonb_each(coalesce(m.wix_options,'{}')) where lower(trim(key)) not in('colour','color','internal shelf','side shelves')),'{}'::jsonb),
    case when m.top_replaced then 'standard-top-excluded' else 'complete' end)::text
   else jsonb_build_array('catalog-v2',(select wc_material_line_variant(i) from wc_order_items i where i.id=m.id),case when m.top_replaced then 'standard-top-excluded' else 'complete' end)::text end variant_key,
   'main'::text kind from m
 ), option_parts as (
  select m.id,1::numeric,jsonb_build_array('catalog-v3-cart-option',m.shipping_id,lower(trim(o.key)),lower(trim(o.value#>>'{}')))::text,
   'option:'||o.key
  from m cross join lateral jsonb_each(coalesce(m.wix_options,'{}')) o
  where m.product_type='Cart' and lower(trim(o.key)) in('internal shelf','side shelves')
   and lower(trim(o.value#>>'{}')) in('yes','true','included','selected')
 ), addon_parts as (
  select i.id,i.quantity::numeric/m.quantity,
   jsonb_build_array('catalog-v2',wc_material_line_variant(i),case when i.id=m.id and m.top_replaced then 'standard-top-excluded' else 'complete' end)::text,
   case when i.product_name~*'custom cutout' then 'processing' when i.product_name~*'benchtop upgrade' then 'replacement' else 'addon' end
  from m join wc_order_items i on i.order_id=m.order_id
  where i.id<>m.id and m.quantity>0 and wc_cost_main(i.id)=m.id
   and btrim(coalesce(i.product_name,''))!~*'^(delivery|shipping)(\s+(fee|charge))?$'
 )
 select * from main_part union all select * from option_parts union all select * from addon_parts
$$;

create or replace function public.wc_catalog_composition_key(p_main uuid) returns text language sql stable security definer set search_path=public as $$
 select jsonb_agg(jsonb_build_array(variant_key,multiplier) order by variant_key,item_id)::text from wc_catalog_parts(p_main)
$$;

create or replace function public.wc_record_order_pans(p_order uuid) returns void language plpgsql security definer set search_path=public as $$
declare r record; price numeric; total numeric:=0; details jsonb:='[]';
begin
 select snapshot into details from wc_order_pans_costs where order_id=p_order;details=coalesce(details,'[]');select coalesce(sum((x->>'price_gst')::numeric*(x->>'quantity')::numeric),0) into total from jsonb_array_elements(details)x;
 if not exists(select 1 from wc_orders where id=p_order and not is_hidden and not archived and order_number<>'10242' and coalesce(currency,'AUD')='AUD' and upper(coalesce(fulfillment_status,''))<>'FULFILLED' and upper(coalesce(wix_status,'')) not in('CANCELED','CANCELLED')) then return;end if;
 if not exists(select 1 from wc_order_items i join wc_production_units u on u.order_item_id=wc_material_unit_source(i.id) where i.order_id=p_order and wc_cost_main(i.id)=i.id and u.production_status<>'Ready') then return;end if;
 for r in select i.*,cp.variant_key from wc_order_items i left join lateral wc_catalog_parts(wc_cost_main(i.id)) cp on cp.item_id=i.id and cp.kind='main' where i.order_id=p_order and wc_catalog_pans(i) loop
  if exists(select 1 from jsonb_array_elements(details)x where x->>'item_id'=r.id::text) then continue;end if;
  if r.variant_key is null then return;end if;
  select pans_cost_gst into price from wc_material_profiles where variant_key=r.variant_key and costing_version=2;
  if price is null then return;end if;
  total=total+round(price*r.quantity,2);details=details||jsonb_build_array(jsonb_build_object('item_id',r.id,'quantity',r.quantity,'price_gst',price,'variant_key',r.variant_key));
 end loop;
 if jsonb_array_length(details)>0 then insert into wc_order_pans_costs(order_id,total_gst,snapshot) values(p_order,total,details) on conflict(order_id) do update set total_gst=excluded.total_gst,snapshot=excluded.snapshot where wc_order_pans_costs.snapshot is distinct from excluded.snapshot;end if;
end $$;

create or replace function public.wc_calculate_material_item(p_item uuid) returns void language plpgsql security definer set search_path=public as $$
declare main_id uuid; i wc_order_items; o wc_orders; u wc_production_units; part record; p wc_material_profiles; mat wc_materials; l jsonb;
 components jsonb; material_lines jsonb; materials numeric; works numeric; pans numeric; part_materials numeric; part_work numeric; part_pans numeric; missing boolean; k text;
begin
 perform pg_advisory_xact_lock(20260907,8);select * into i from wc_order_items where id=p_item;
 if i.id is not null and btrim(coalesce(i.product_name,''))!~*'^(delivery|shipping)(\s+(fee|charge))?$' then perform wc_catalog_register(p_item);end if;
 main_id=wc_cost_main(p_item);if main_id is null then return;end if;select * into i from wc_order_items where id=main_id;select * into o from wc_orders where id=i.order_id;
 if btrim(coalesce(i.product_name,''))~*'^(delivery|shipping)(\s+(fee|charge))?$' then return;end if;
 for part in select distinct item_id from wc_catalog_parts(main_id) loop perform wc_catalog_register(part.item_id);end loop;perform wc_record_order_pans(o.id);
 if o.is_hidden or o.archived or o.order_number='10242' or coalesce(o.currency,'AUD')<>'AUD' or upper(coalesce(o.fulfillment_status,''))='FULFILLED' or upper(coalesce(o.wix_status,'')) in('CANCELED','CANCELLED') then return;end if;
 if exists(select 1 from wc_order_items unresolved where unresolved.order_id=o.id and wc_cost_addon(unresolved) and wc_cost_main(unresolved.id) is null) then return;end if;
 if exists(select 1 from wc_product_costs c where c.order_id=o.id and c.state='calculated' and c.item_id in(select item_id from wc_catalog_parts(main_id)) and (c.item_id<>main_id or not exists(select 1 from wc_production_units x where x.id=c.unit_id and x.order_item_id=wc_material_unit_source(main_id)))) then return;end if;
 delete from wc_product_costs c where c.order_id=o.id and c.state<>'calculated' and c.item_id in(select item_id from wc_catalog_parts(main_id)) and not exists(select 1 from wc_production_units x where x.id=c.unit_id and x.order_item_id=wc_material_unit_source(main_id) and x.unit_index<=i.quantity);
 k=wc_catalog_composition_key(main_id);
 for u in select * from wc_production_units where order_item_id=wc_material_unit_source(main_id) and unit_index<=i.quantity and production_status<>'Ready' loop
  if exists(select 1 from wc_product_costs c where c.unit_id=u.id and c.state='calculated') then continue;end if;
  components='[]';materials=0;works=0;pans=0;missing=false;
  for part in select cp.*,wi as item from wc_catalog_parts(main_id) cp join wc_order_items wi on wi.id=cp.item_id loop
   select * into p from wc_material_profiles where variant_key=part.variant_key and costing_version=2;if not found then missing=true;exit;end if;if not p.materials_confirmed then missing=true;end if;
   material_lines='[]';part_materials=0;part_work=0;part_pans=0;
   for l in select value from jsonb_array_elements(p.lines) loop select * into mat from wc_materials where id=(l->>'material_id')::uuid;if not found or not mat.active or mat.price_gst is null then missing=true;exit;end if;material_lines=material_lines||jsonb_build_array(jsonb_build_object('name',mat.name,'unit',mat.unit,'material_id',mat.id,'quantity',(l->>'quantity')::numeric,'price_gst',mat.price_gst,'total_gst',round(mat.price_gst*(l->>'quantity')::numeric,2)));part_materials=part_materials+round(mat.price_gst*(l->>'quantity')::numeric,2);end loop;
   if p.work_costs is null or exists(select 1 from unnest(array['cnc','assembly','sanding','painting']) category where p.work_costs->>category is null) then missing=true;else select sum((value#>>'{}')::numeric) into part_work from jsonb_each(p.work_costs);end if;
   if part.kind='main' and wc_catalog_pans(part.item) then select (entry->>'price_gst')::numeric into part_pans from wc_order_pans_costs saved cross join lateral jsonb_array_elements(saved.snapshot) entry where saved.order_id=o.id and entry->>'item_id'=part.item_id::text and entry->>'variant_key'=part.variant_key and (entry->>'quantity')::numeric=(part.item).quantity;if part_pans is null then missing=true;part_pans=0;end if;end if;
   materials=materials+round(part_materials*part.multiplier,2);works=works+round(part_work*part.multiplier,2);pans=pans+round(part_pans*part.multiplier,2);
   components=components||jsonb_build_array(jsonb_build_object('item_id',part.item_id,'product_name',(part.item).product_name,'kind',part.kind,'multiplier',part.multiplier,'variant_key',part.variant_key,'profile_updated_at',p.updated_at,'lines',material_lines,'work_costs',p.work_costs,'materials_gst',part_materials,'work_gst',part_work,'pans_gst',part_pans));
  end loop;
  insert into wc_product_costs(unit_id,item_id,order_id,order_number,product_name,unit_index,order_quantity,variant_key,options,state,snapshot,total_gst,calculated_at,materials_gst,work_gst,pans_gst)
  values(u.id,main_id,o.id,o.order_number,i.product_name,u.unit_index,i.quantity,k,i.wix_options,case when missing then 'materials_required' else 'calculated' end,case when not missing then jsonb_build_object('version',3,'gst_inclusive',true,'currency','AUD','components',components) end,case when not missing then materials+works end,case when not missing then now() end,case when not missing then materials end,case when not missing then works end,case when not missing then pans end)
  on conflict(unit_id) do update set item_id=excluded.item_id,variant_key=excluded.variant_key,options=excluded.options,order_quantity=excluded.order_quantity,state=excluded.state,snapshot=excluded.snapshot,total_gst=excluded.total_gst,calculated_at=excluded.calculated_at,materials_gst=excluded.materials_gst,work_gst=excluded.work_gst,pans_gst=excluded.pans_gst where wc_product_costs.state<>'calculated';
 end loop;
end $$;

create or replace function public.wc_catalog_cost_parts() returns setof jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('order_id',m.order_id,'main_item_id',m.id,'item_id',i.id,'kind',cp.kind,'multiplier',cp.multiplier,'variant_key',cp.variant_key,'product_name',i.product_name,
 'options',case when cp.kind like 'option:%' then jsonb_build_object(substring(cp.kind from 8),coalesce((select value from jsonb_each(coalesce(i.wix_options,'{}')) where lower(trim(key))=lower(trim(substring(cp.kind from 8))) limit 1),'"Yes"'::jsonb)) else i.wix_options end,
 'has_pans',cp.kind='main' and wc_catalog_pans(i),'standard_top_excluded',cp.kind='main' and exists(select 1 from wc_material_tabletop(m.order_id)),
 'shipping_product_id',coalesce(p.shipping_product_id,(select s.id from wc_shipping_products s where (s.wix_product_id is not null and s.wix_product_id=coalesce(nullif(i.catalog_reference->>'catalogItemId',''),i.catalog_reference->>'productId')) or (s.wix_product_id is null and lower(s.product_name)=lower(i.product_name)) limit 1)),
 'profile',to_jsonb(p),'legacy_lines',case when p.variant_key is null and cp.kind='main' then coalesce(legacy.lines,(select old.lines from wc_material_profiles old where old.shipping_product_id=(select s.id from wc_shipping_products s where s.product_type='Cart' and ((s.wix_product_id is not null and s.wix_product_id=coalesce(nullif(i.catalog_reference->>'catalogItemId',''),i.catalog_reference->>'productId')) or (s.wix_product_id is null and lower(s.product_name)=lower(i.product_name))) limit 1) and old.costing_version=2 and old.template_item->>'kind'='main' order by old.updated_at desc limit 1)) end)
 from wc_order_items m join wc_orders o on o.id=m.order_id cross join lateral wc_catalog_parts(m.id) cp join wc_order_items i on i.id=cp.item_id
 left join wc_material_profiles p on p.variant_key=cp.variant_key left join wc_material_profiles legacy on legacy.variant_key=wc_material_line_variant(i)
 where auth.uid() is not null and wc_cost_main(m.id)=m.id and not o.is_hidden and o.order_number<>'10242' order by m.id,i.id,cp.variant_key
$$;

create or replace function public.wc_catalog_cost_report() returns setof jsonb language sql stable security definer set search_path=public as $$
 select to_jsonb(c)||jsonb_build_object('current_status',u.production_status,'changed',i.id is null or u.id is null or c.order_quantity is distinct from i.quantity or ((coalesce((c.snapshot->>'version')::int,0)>=3 or c.state<>'calculated') and c.variant_key is distinct from wc_catalog_composition_key(i.id)))
 from wc_product_costs c left join wc_order_items i on i.id=c.item_id left join wc_production_units u on u.id=c.unit_id join wc_orders o on o.id=c.order_id
 where auth.uid() is not null and not o.is_hidden and o.order_number<>'10242' and (c.state='calculated' or (wc_cost_main(i.id)=i.id and u.order_item_id=wc_material_unit_source(i.id) and u.production_status<>'Ready' and u.unit_index<=i.quantity and not o.archived)) order by c.order_id,c.unit_id
$$;

revoke all on function public.wc_catalog_register(uuid),public.wc_catalog_parts(uuid),public.wc_catalog_composition_key(uuid),public.wc_record_order_pans(uuid),public.wc_calculate_material_item(uuid) from public,anon,authenticated;
revoke all on function public.wc_catalog_cost_parts(),public.wc_catalog_cost_report() from public,anon;
grant execute on function public.wc_catalog_cost_parts(),public.wc_catalog_cost_report() to authenticated;

do $$declare r record;begin perform pg_advisory_xact_lock(20260907,8);for r in select id from wc_order_items where btrim(coalesce(product_name,''))!~*'^(delivery|shipping)(\s+(fee|charge))?$' loop perform wc_catalog_register(r.id);end loop;for r in select id from wc_order_items where wc_cost_main(id)=id loop perform wc_calculate_material_item(r.id);end loop;end $$;
