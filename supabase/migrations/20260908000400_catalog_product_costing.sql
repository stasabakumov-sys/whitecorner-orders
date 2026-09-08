-- One product registry: wc_shipping_products, shared by packaging and costing.
-- Profiles are per variant/component; calculated order snapshots remain immutable.
drop index if exists public.wc_shipping_products_name_ci_uq;
create unique index wc_shipping_products_unlinked_name_uq on public.wc_shipping_products(lower(product_name)) where wix_product_id is null;
alter table public.wc_material_profiles add column shipping_product_id uuid references public.wc_shipping_products(id),
 add column template_item jsonb, add column work_costs jsonb, add column pans_cost_gst numeric(14,4),
 add column materials_confirmed boolean not null default false, add column costing_version integer not null default 1;
alter table public.wc_material_profiles add constraint profile_pans_price check(pans_cost_gst>=0 and pans_cost_gst<>'NaN'::numeric);
-- Empty materials are valid for processing-only components, with explicit confirmation.
alter table public.wc_material_profiles drop constraint wc_material_profiles_lines_check;
alter table public.wc_material_profiles add constraint profile_material_array check(jsonb_typeof(lines)='array');
alter table public.wc_product_costs add column materials_gst numeric(24,2),add column work_gst numeric(24,2),add column pans_gst numeric(24,2);

create function public.wc_catalog_register(p_item uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare i wc_order_items; pid uuid; wix text;
begin
 select * into i from wc_order_items where id=p_item;if not found then return null;end if;
 wix=coalesce(nullif(i.catalog_reference->>'catalogItemId',''),nullif(i.catalog_reference->>'productId',''));
 if wix is not null then select id into pid from wc_shipping_products where wix_product_id=wix;end if;
 if pid is null then
  select id into pid from wc_shipping_products where wix_product_id is null and lower(product_name)=lower(i.product_name);
  if pid is not null and wix is not null then update wc_shipping_products set wix_product_id=wix where id=pid;end if;
 end if;
 if pid is null then insert into wc_shipping_products(wix_product_id,product_name,product_type) values(wix,coalesce(i.product_name,'Unnamed product'),'Other') returning id into pid;end if;
 return pid;
end $$;

create function public.wc_cost_addon(i public.wc_order_items) returns boolean language sql immutable set search_path=public as $$
 select coalesce(i.product_name,'') ~* '(additional tabletop|custom cutout|side shelves|integrated ice storage shelf|umbrella hole|support panel|customisation|customization|back panel with|benchtop upgrade)'
$$;
create function public.wc_cost_main(p_item uuid) returns uuid language sql stable security definer set search_path=public as $$
 select case when not wc_cost_addon(i) then i.id when i.product_name ~* 'benchtop upgrade' then (select main_id from wc_material_tabletop(i.order_id)) else
 (select m.id from wc_order_items m where m.order_id=i.order_id and not wc_cost_addon(m)
 and btrim(coalesce(m.product_name,'')) !~* '^(delivery|shipping)(\s+(fee|charge))?$'
 and m.quantity>0 and i.quantity>0 and i.quantity%m.quantity=0
 and (select count(*) from wc_order_items z where z.order_id=i.order_id and not wc_cost_addon(z) and btrim(coalesce(z.product_name,'')) !~* '^(delivery|shipping)(\s+(fee|charge))?$')=1) end
 from wc_order_items i where i.id=p_item
$$;
create function public.wc_catalog_parts(p_main uuid) returns table(item_id uuid,multiplier numeric,variant_key text,kind text)
language sql stable security definer set search_path=public as $$
 select i.id,i.quantity::numeric/m.quantity,
 jsonb_build_array('catalog-v2',wc_material_line_variant(i),case when i.id=m.id and exists(select 1 from wc_material_tabletop(m.order_id) t where t.main_id=m.id) then 'standard-top-excluded' else 'complete' end)::text,
 case when i.id=m.id then 'main' when i.product_name ~* 'custom cutout' then 'processing' when i.product_name ~* 'benchtop upgrade' then 'replacement' else 'addon' end
 from wc_order_items m join wc_order_items i on i.order_id=m.order_id
 where m.id=p_main and m.quantity>0 and wc_cost_main(i.id)=m.id
 and btrim(coalesce(i.product_name,'')) !~* '^(delivery|shipping)(\s+(fee|charge))?$'
$$;
create function public.wc_catalog_composition_key(p_main uuid) returns text language sql stable security definer set search_path=public as $$
 select jsonb_agg(jsonb_build_array(variant_key,multiplier) order by variant_key,item_id)::text from wc_catalog_parts(p_main)
$$;
create function public.wc_catalog_text(v jsonb) returns text language plpgsql immutable set search_path=public as $$
declare k text; result text;
begin
 if jsonb_typeof(v) in('string','number','boolean') then return btrim(v#>>'{}');end if;
 if jsonb_typeof(v)='object' then foreach k in array array['original','translated','value','name','description','text','plainText','plainTextValue','label','title'] loop result=wc_catalog_text(v->k);if nullif(result,'') is not null then return result;end if;end loop;end if;
 return '';
end $$;
create function public.wc_catalog_pans(i public.wc_order_items) returns boolean language sql immutable set search_path=public as $$
 with objects as (
 select value obj from jsonb_array_elements(jsonb_build_array(i.wix_options,i.custom_text_fields,i.catalog_reference->'options',i.catalog_reference#>'{options,options}',i.raw_item->'options',i.raw_item->'selectedOptions',i.raw_item->'customTextFields'))
 ), choices as (
 select wc_catalog_text(value) v from objects cross join lateral jsonb_each(case when jsonb_typeof(obj)='object' then obj else '{}' end) where lower(btrim(key))='pans'
 union all select wc_catalog_text(coalesce(value->'value',value->'description',value->'text',value->'plainText',value->'plainTextValue')) from jsonb_array_elements(coalesce(i.description_lines,'[]')) where lower(wc_catalog_text(coalesce(value->'name',value->'label',value->'title')))='pans'
 ) select exists(select 1 from choices where nullif(btrim(v),'') is not null and btrim(v) !~* '^(no|none|false|0|not required|not selected)$' and v !~* '(\mwithout\M.*\mpans?\M|\mno\s+(steel\s+|metal\s+|stainless\s+steel\s+)?pans?\M)')
$$;

create table public.wc_order_pans_costs(order_id uuid primary key references public.wc_orders(id),total_gst numeric(24,2) not null,snapshot jsonb not null,created_at timestamptz not null default now());
alter table public.wc_order_pans_costs enable row level security;
create policy order_pans_cost_read on public.wc_order_pans_costs for select to authenticated using(exists(select 1 from wc_orders o where o.id=order_id and not o.is_hidden and o.order_number<>'10242'));
revoke all on public.wc_order_pans_costs from public,anon,authenticated;grant select on public.wc_order_pans_costs to authenticated;
create function public.wc_record_order_pans(p_order uuid) returns void language plpgsql security definer set search_path=public as $$
declare r record; price numeric; total numeric:=0; details jsonb:='[]';
begin
 select snapshot into details from wc_order_pans_costs where order_id=p_order;details=coalesce(details,'[]');select coalesce(sum((x->>'price_gst')::numeric*(x->>'quantity')::numeric),0) into total from jsonb_array_elements(details)x;
 if not exists(select 1 from wc_orders where id=p_order and not is_hidden and not archived and order_number<>'10242' and coalesce(currency,'AUD')='AUD' and upper(coalesce(fulfillment_status,''))<>'FULFILLED' and upper(coalesce(wix_status,'')) not in('CANCELED','CANCELLED')) then return;end if;
 -- Do not freeze a zero during an incomplete import or for a Ready-only order.
 if not exists(select 1 from wc_order_items i join wc_production_units u on u.order_item_id=wc_material_unit_source(i.id) where i.order_id=p_order and wc_cost_main(i.id)=i.id and u.production_status<>'Ready') then return;end if;
 for r in select i.*,cp.variant_key from wc_order_items i left join lateral wc_catalog_parts(wc_cost_main(i.id)) cp on cp.item_id=i.id where i.order_id=p_order and wc_catalog_pans(i) loop
  if exists(select 1 from jsonb_array_elements(details)x where x->>'item_id'=r.id::text) then continue;end if;
  if r.variant_key is null then return;end if;
  select pans_cost_gst into price from wc_material_profiles where variant_key=r.variant_key and costing_version=2;
  if price is null then return;end if;
  total=total+round(price*r.quantity,2);details=details||jsonb_build_array(jsonb_build_object('item_id',r.id,'quantity',r.quantity,'price_gst',price,'variant_key',r.variant_key));
 end loop;
 -- No-Pans orders show zero dynamically; a later imported Pans line must not be hidden by an early zero snapshot.
 if jsonb_array_length(details)>0 then insert into wc_order_pans_costs(order_id,total_gst,snapshot) values(p_order,total,details) on conflict(order_id) do update set total_gst=excluded.total_gst,snapshot=excluded.snapshot where wc_order_pans_costs.snapshot is distinct from excluded.snapshot;end if;
end $$;
revoke all on function public.wc_record_order_pans(uuid) from public,anon,authenticated;

create or replace function public.wc_calculate_material_item(p_item uuid) returns void language plpgsql security definer set search_path=public as $$
declare main_id uuid; i wc_order_items; o wc_orders; u wc_production_units; part record; p wc_material_profiles; mat wc_materials; l jsonb;
 components jsonb; material_lines jsonb; materials numeric; works numeric; pans numeric; part_materials numeric; part_work numeric; part_pans numeric; missing boolean; k text;
begin
 perform pg_advisory_xact_lock(20260907,8);
 select * into i from wc_order_items where id=p_item;
 if i.id is not null and btrim(coalesce(i.product_name,'')) !~* '^(delivery|shipping)(\s+(fee|charge))?$' then perform wc_catalog_register(p_item);end if;
 main_id=wc_cost_main(p_item);if main_id is null then return;end if;
 select * into i from wc_order_items where id=main_id;select * into o from wc_orders where id=i.order_id;
 if btrim(coalesce(i.product_name,'')) ~* '^(delivery|shipping)(\s+(fee|charge))?$' then return;end if;
 for part in select item_id from wc_catalog_parts(main_id) loop perform wc_catalog_register(part.item_id);end loop;
 perform wc_record_order_pans(o.id);
 if o.is_hidden or o.archived or o.order_number='10242' or coalesce(o.currency,'AUD')<>'AUD' or upper(coalesce(o.fulfillment_status,''))='FULFILLED' or upper(coalesce(o.wix_status,'')) in('CANCELED','CANCELLED') then return;end if;
 if exists(select 1 from wc_order_items unresolved where unresolved.order_id=o.id and wc_cost_addon(unresolved) and wc_cost_main(unresolved.id) is null) then return;end if;
 -- Never convert a locked legacy component or combined calculation implicitly.
 if exists(select 1 from wc_product_costs c where c.order_id=o.id and c.state='calculated' and c.item_id in(select item_id from wc_catalog_parts(main_id)) and (c.item_id<>main_id or not exists(select 1 from wc_production_units x where x.id=c.unit_id and x.order_item_id=wc_material_unit_source(main_id)))) then return;end if;
 delete from wc_product_costs c where c.order_id=o.id and c.state<>'calculated' and c.item_id in(select item_id from wc_catalog_parts(main_id)) and not exists(select 1 from wc_production_units x where x.id=c.unit_id and x.order_item_id=wc_material_unit_source(main_id) and x.unit_index<=i.quantity);
 k=wc_catalog_composition_key(main_id);
 for u in select * from wc_production_units where order_item_id=wc_material_unit_source(main_id) and unit_index<=i.quantity and production_status<>'Ready' loop
  if exists(select 1 from wc_product_costs c where c.unit_id=u.id and c.state='calculated') then continue;end if;
  components='[]';materials=0;works=0;pans=0;missing=false;
  for part in select cp.*,wi as item from wc_catalog_parts(main_id) cp join wc_order_items wi on wi.id=cp.item_id loop
   select * into p from wc_material_profiles where variant_key=part.variant_key and costing_version=2;
   if not found then missing=true;exit;end if;
   if not p.materials_confirmed then missing=true;end if;
   material_lines='[]';part_materials=0;part_work=0;part_pans=0;
   for l in select value from jsonb_array_elements(p.lines) loop
    select * into mat from wc_materials where id=(l->>'material_id')::uuid;
    if not found or not mat.active or mat.price_gst is null then missing=true;exit;end if;
    material_lines=material_lines||jsonb_build_array(jsonb_build_object('name',mat.name,'unit',mat.unit,'material_id',mat.id,'quantity',(l->>'quantity')::numeric,'price_gst',mat.price_gst,'total_gst',round(mat.price_gst*(l->>'quantity')::numeric,2)));
    part_materials=part_materials+round(mat.price_gst*(l->>'quantity')::numeric,2);
   end loop;
   if p.work_costs is null or exists(select 1 from unnest(array['cnc','assembly','sanding','painting']) category where p.work_costs->>category is null) then missing=true;else
    select sum((value#>>'{}')::numeric) into part_work from jsonb_each(p.work_costs);
   end if;
   if wc_catalog_pans(part.item) then
    select (entry->>'price_gst')::numeric into part_pans from wc_order_pans_costs saved cross join lateral jsonb_array_elements(saved.snapshot) entry where saved.order_id=o.id and entry->>'item_id'=part.item_id::text and entry->>'variant_key'=part.variant_key and (entry->>'quantity')::numeric=(part.item).quantity;
    if part_pans is null then missing=true;part_pans=0;end if;
   end if;
   materials=materials+round(part_materials*part.multiplier,2);works=works+round(part_work*part.multiplier,2);pans=pans+round(part_pans*part.multiplier,2);
   components=components||jsonb_build_array(jsonb_build_object('item_id',part.item_id,'product_name',(part.item).product_name,'kind',part.kind,'multiplier',part.multiplier,'variant_key',part.variant_key,'profile_updated_at',p.updated_at,'lines',material_lines,'work_costs',p.work_costs,'materials_gst',part_materials,'work_gst',part_work,'pans_gst',part_pans));
  end loop;
  insert into wc_product_costs(unit_id,item_id,order_id,order_number,product_name,unit_index,order_quantity,variant_key,options,state,snapshot,total_gst,calculated_at,materials_gst,work_gst,pans_gst)
  values(u.id,main_id,o.id,o.order_number,i.product_name,u.unit_index,i.quantity,k,i.wix_options,case when missing then 'materials_required' else 'calculated' end,
   case when not missing then jsonb_build_object('version',2,'gst_inclusive',true,'currency','AUD','components',components) end,
   case when not missing then materials+works end,case when not missing then now() end,case when not missing then materials end,case when not missing then works end,case when not missing then pans end)
  on conflict(unit_id) do update set item_id=excluded.item_id,variant_key=excluded.variant_key,options=excluded.options,order_quantity=excluded.order_quantity,state=excluded.state,snapshot=excluded.snapshot,total_gst=excluded.total_gst,calculated_at=excluded.calculated_at,materials_gst=excluded.materials_gst,work_gst=excluded.work_gst,pans_gst=excluded.pans_gst where wc_product_costs.state<>'calculated';
 end loop;
end $$;

create function public.wc_save_catalog_cost_profile(p_main uuid,p_item uuid,p_key text,p_lines jsonb,p_work jsonb,p_pans numeric,p_confirmed boolean,p_expected timestamptz) returns void language plpgsql security definer set search_path=public as $$
declare part record; i wc_order_items; pid uuid; prior timestamptz; r record; stored wc_material_profiles; top_excluded boolean;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 perform pg_advisory_xact_lock(20260907,8);
 select * into part from wc_catalog_parts(p_main) where item_id=p_item and variant_key=p_key;
 if not found then
  -- A catalogue profile outlives its example order. Its saved identity remains immutable.
  select * into stored from wc_material_profiles where variant_key=p_key and costing_version=2 and template_item->>'source_item_id'=p_item::text;
  if stored.variant_key is null or exists(select 1 from wc_order_items where id=p_item) or stored.template_item->'source_item' is null then raise exception 'Product composition changed; refresh';end if;
  select * into i from jsonb_populate_record(null::wc_order_items,stored.template_item->'source_item');
  part.kind=stored.template_item->>'kind';part.multiplier=(stored.template_item->>'multiplier')::numeric;top_excluded=(stored.template_item->>'standard_top_excluded')::boolean;
 else
  select * into i from wc_order_items where id=p_item;
  top_excluded=part.kind='main' and exists(select 1 from wc_material_tabletop(i.order_id));
 end if;
 select updated_at into prior from wc_material_profiles where variant_key=p_key;
 if prior is distinct from p_expected then raise exception 'Profile changed; refresh';end if;
 if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines)>100 then raise exception 'Invalid materials';end if;
 if exists(select 1 from jsonb_array_elements(p_lines) l where (l->>'quantity')::numeric is null or (l->>'quantity')::numeric<=0 or (l->>'quantity')::numeric>100000 or not exists(select 1 from wc_materials where id=(l->>'material_id')::uuid and active)) then raise exception 'Invalid material quantity';end if;
 if (select count(*) from jsonb_array_elements(p_lines))<>(select count(distinct l->>'material_id') from jsonb_array_elements(p_lines) l) then raise exception 'Duplicate materials';end if;
 if jsonb_typeof(p_work) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_work))<>4 or exists(select 1 from unnest(array['cnc','assembly','sanding','painting']) category where not (p_work ? category) or (p_work->>category)::numeric<0 or (p_work->>category)::numeric>1000000 or (p_work->>category)::numeric='NaN'::numeric) then raise exception 'Enter every work cost; use zero for no work';end if;
 if p_pans<0 or p_pans>1000000 or p_pans='NaN'::numeric then raise exception 'Invalid Pans cost';end if;
 
 pid=coalesce(wc_catalog_register(p_item),stored.shipping_product_id);
 insert into wc_material_profiles(variant_key,product_name,options,lines,updated_by,shipping_product_id,template_item,work_costs,pans_cost_gst,materials_confirmed,costing_version)
 values(p_key,i.product_name,i.wix_options,p_lines,auth.uid(),pid,jsonb_build_object('source_item_id',i.id,'kind',part.kind,'main_item_id',p_main,'multiplier',part.multiplier,'options',i.wix_options,'has_pans',wc_catalog_pans(i),'source_item',jsonb_build_object('id',i.id,'product_name',i.product_name,'quantity',1,'wix_options',i.wix_options,'catalog_reference',i.catalog_reference,'custom_text_fields',i.custom_text_fields,'description_lines',i.description_lines),'standard_top_excluded',top_excluded),p_work,case when wc_catalog_pans(i) then p_pans else 0 end,coalesce(p_confirmed,false),2)
 on conflict(variant_key) do update set lines=excluded.lines,work_costs=excluded.work_costs,pans_cost_gst=excluded.pans_cost_gst,shipping_product_id=excluded.shipping_product_id,template_item=excluded.template_item,materials_confirmed=excluded.materials_confirmed,costing_version=2,updated_by=auth.uid(),updated_at=clock_timestamp();
 for r in select id from wc_order_items where wc_cost_main(id)=id loop perform wc_calculate_material_item(r.id);end loop;
end $$;

create function public.wc_catalog_cost_parts() returns setof jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('order_id',m.order_id,'main_item_id',m.id,'item_id',i.id,'kind',cp.kind,'multiplier',cp.multiplier,'variant_key',cp.variant_key,'product_name',i.product_name,'options',i.wix_options,'has_pans',wc_catalog_pans(i),'standard_top_excluded',cp.kind='main' and exists(select 1 from wc_material_tabletop(m.order_id)),
 'shipping_product_id',coalesce(p.shipping_product_id,(select s.id from wc_shipping_products s where (s.wix_product_id is not null and s.wix_product_id=coalesce(nullif(i.catalog_reference->>'catalogItemId',''),i.catalog_reference->>'productId')) or (s.wix_product_id is null and lower(s.product_name)=lower(i.product_name)) limit 1)),
 'profile',to_jsonb(p),'legacy_lines',case when not exists(select 1 from wc_material_tabletop(m.order_id)) then legacy.lines end)
 from wc_order_items m join wc_orders o on o.id=m.order_id cross join lateral wc_catalog_parts(m.id) cp join wc_order_items i on i.id=cp.item_id
 left join wc_material_profiles p on p.variant_key=cp.variant_key left join wc_material_profiles legacy on legacy.variant_key=wc_material_line_variant(i)
 where auth.uid() is not null and wc_cost_main(m.id)=m.id and not o.is_hidden and o.order_number<>'10242' order by m.id,i.id
$$;
create function public.wc_catalog_cost_report() returns setof jsonb language sql stable security definer set search_path=public as $$
 select to_jsonb(c)||jsonb_build_object('current_status',u.production_status,'changed',i.id is null or u.id is null or c.order_quantity is distinct from i.quantity or c.variant_key is distinct from case when coalesce((c.snapshot->>'version')::int,0)=2 or c.state<>'calculated' then wc_catalog_composition_key(i.id) else wc_material_variant(i) end)
 from wc_product_costs c left join wc_order_items i on i.id=c.item_id left join wc_production_units u on u.id=c.unit_id join wc_orders o on o.id=c.order_id
 where auth.uid() is not null and not o.is_hidden and o.order_number<>'10242' and (c.state='calculated' or (wc_cost_main(i.id)=i.id and u.order_item_id=wc_material_unit_source(i.id) and u.production_status<>'Ready' and u.unit_index<=i.quantity and not o.archived)) order by c.order_id,c.unit_id
$$;
revoke all on function public.wc_catalog_register(uuid),public.wc_cost_addon(public.wc_order_items),public.wc_cost_main(uuid),public.wc_catalog_parts(uuid),public.wc_catalog_composition_key(uuid),public.wc_catalog_pans(public.wc_order_items),public.wc_catalog_text(jsonb) from public,anon,authenticated;
revoke all on function public.wc_save_catalog_cost_profile(uuid,uuid,text,jsonb,jsonb,numeric,boolean,timestamptz),public.wc_catalog_cost_parts(),public.wc_catalog_cost_report() from public,anon;
grant execute on function public.wc_save_catalog_cost_profile(uuid,uuid,text,jsonb,jsonb,numeric,boolean,timestamptz),public.wc_catalog_cost_parts(),public.wc_catalog_cost_report() to authenticated;
do $$declare r record;begin perform pg_advisory_xact_lock(20260907,8);for r in select id from wc_order_items where btrim(coalesce(product_name,'')) !~* '^(delivery|shipping)(\s+(fee|charge))?$' loop perform wc_catalog_register(r.id);end loop;for r in select id from wc_order_items where wc_cost_main(id)=id loop perform wc_calculate_material_item(r.id);end loop;end $$;
