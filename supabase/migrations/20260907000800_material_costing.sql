-- AUD, GST inclusive. New costing records only; no production status changes.
create table public.wc_materials (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 150),
 unit text not null check(unit in ('sheet','m2','m','piece','kg','litre')),
 price_gst numeric(14,4) check(price_gst>=0 and price_gst<>'NaN'::numeric), active boolean not null default true,
 updated_at timestamptz not null default now()
);
create table public.wc_material_prices (
 id uuid primary key default gen_random_uuid(), material_id uuid not null references public.wc_materials,
 price_gst numeric(14,4), actor uuid not null, created_at timestamptz not null default now()
);
create table public.wc_material_profiles (
 variant_key text primary key, product_name text not null, options jsonb not null,
 lines jsonb not null check(jsonb_typeof(lines)='array' and jsonb_array_length(lines)>0),
 updated_by uuid not null, updated_at timestamptz not null default now()
);
-- No cascading FK: historical snapshots survive Wix removing a line/unit.
create table public.wc_product_costs (
 unit_id uuid primary key, item_id uuid not null, order_id uuid not null, order_number text,
 product_name text not null, unit_index integer not null, order_quantity integer not null,
 variant_key text not null, options jsonb not null,
 state text not null check(state in ('materials_required','price_required','calculated')),
 snapshot jsonb, total_gst numeric(24,2), calculated_at timestamptz,
 check((state='calculated')=(snapshot is not null and total_gst is not null and calculated_at is not null))
);
create index wc_product_costs_item_idx on public.wc_product_costs(item_id);
create index wc_product_costs_order_idx on public.wc_product_costs(order_id);
create function public.wc_material_variant(i public.wc_order_items) returns text
language sql immutable set search_path=public as $$
 select jsonb_build_array(coalesce(nullif(i.catalog_reference->>'catalogItemId',''),nullif(i.catalog_reference->>'productId',''),lower(trim(i.product_name))),
 i.wix_options,i.catalog_reference->'options',i.custom_text_fields,i.description_lines)::text
$$;

create function public.wc_calculate_material_item(p_item uuid) returns void
language plpgsql security definer set search_path=public as $$
declare i wc_order_items; o wc_orders; u wc_production_units; p wc_material_profiles; m wc_materials;
 k text; line jsonb; cost_lines jsonb; total numeric; missing boolean;
begin
 perform pg_advisory_xact_lock(20260907,8);
 select * into i from wc_order_items where id=p_item; if not found then return; end if;
 select * into o from wc_orders where id=i.order_id;
 if o.is_hidden or o.archived or o.order_number='10242' or upper(coalesce(o.fulfillment_status,''))='FULFILLED'
 or upper(coalesce(o.wix_status,'')) in ('CANCELED','CANCELLED') then return; end if;
 if coalesce(o.currency,'AUD')<>'AUD' then return; end if;
 k=wc_material_variant(i);select * into p from wc_material_profiles where variant_key=k;
 for u in select * from wc_production_units where order_item_id=i.id and unit_index<=i.quantity and production_status<>'Ready' loop
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
  values(u.id,i.id,o.id,o.order_number,coalesce(i.product_name,'Product'),u.unit_index,i.quantity,k,i.wix_options,
   case when p.variant_key is null then 'materials_required' when missing then 'price_required' else 'calculated' end,
   case when p.variant_key is not null and not missing then jsonb_build_object('currency','AUD','gst_inclusive',true,'profile_updated_at',p.updated_at,'lines',cost_lines) end,
   case when p.variant_key is not null and not missing then total end,
   case when p.variant_key is not null and not missing then now() end)
  on conflict(unit_id) do update set variant_key=excluded.variant_key,options=excluded.options,product_name=excluded.product_name,
   order_quantity=excluded.order_quantity,state=excluded.state,snapshot=excluded.snapshot,total_gst=excluded.total_gst,calculated_at=excluded.calculated_at
  where wc_product_costs.state<>'calculated';
 end loop;
end $$;

create function public.wc_material_cost_trigger() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_table_name='wc_production_units' then perform wc_calculate_material_item(new.order_item_id);
 else perform wc_calculate_material_item(new.id);end if;
 return new;
end $$;
create trigger material_cost_unit after insert or update of production_status on public.wc_production_units
 for each row execute function public.wc_material_cost_trigger();
create trigger material_cost_item after update of quantity,wix_options,catalog_reference,custom_text_fields,description_lines,product_name on public.wc_order_items
 for each row execute function public.wc_material_cost_trigger();

create function public.wc_save_material(p_id uuid,p_name text,p_unit text,p_price numeric,p_active boolean,p_expected timestamptz)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); m wc_materials; old_price numeric; r record;
begin
 if actor is null then raise exception 'Authentication required';end if;
 perform pg_advisory_xact_lock(20260907,8);
 if p_id is not null then
  select * into m from wc_materials where id=p_id for update;
  if not found or m.updated_at is distinct from p_expected then raise exception 'Material changed; refresh';end if;
  if m.unit<>p_unit then raise exception 'Unit cannot change; create a new material';end if;
  old_price=m.price_gst;
  update wc_materials set name=trim(p_name),price_gst=p_price,active=p_active,updated_at=clock_timestamp() where id=p_id returning * into m;
 else
  insert into wc_materials(name,unit,price_gst,active) values(trim(p_name),p_unit,p_price,p_active) returning * into m;
 end if;
 if p_id is null or old_price is distinct from m.price_gst then
  insert into wc_material_prices(material_id,price_gst,actor) values(m.id,m.price_gst,actor);
 end if;
 for r in select distinct item_id from wc_product_costs where state<>'calculated' loop perform wc_calculate_material_item(r.item_id);end loop;
 return to_jsonb(m);
end $$;

create function public.wc_save_material_profile(p_item uuid,p_expected_key text,p_lines jsonb,p_expected timestamptz)
returns void language plpgsql security definer set search_path=public as $$
declare i wc_order_items; k text; r record; current_version timestamptz;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 perform pg_advisory_xact_lock(20260907,8);
 select * into i from wc_order_items where id=p_item; k=wc_material_variant(i);
 if i.id is null or k is distinct from p_expected_key then raise exception 'Product options changed; refresh';end if;
 select updated_at into current_version from wc_material_profiles where variant_key=k;
 if current_version is distinct from p_expected then raise exception 'Profile changed; refresh';end if;
 if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 100 then raise exception 'Add materials';end if;
 if exists(select 1 from jsonb_array_elements(p_lines) x where (x->>'quantity')::numeric is null or (x->>'quantity')::numeric<=0 or (x->>'quantity')::numeric>100000
 or not exists(select 1 from wc_materials where id=(x->>'material_id')::uuid and active)) then raise exception 'Invalid material or quantity';end if;
 if (select count(*) from jsonb_array_elements(p_lines))<>(select count(distinct x->>'material_id') from jsonb_array_elements(p_lines) x) then raise exception 'Duplicate materials';end if;
 insert into wc_material_profiles(variant_key,product_name,options,lines,updated_by) values(k,coalesce(i.product_name,'Product'),i.wix_options,p_lines,auth.uid())
 on conflict(variant_key) do update set lines=excluded.lines,updated_by=excluded.updated_by,updated_at=clock_timestamp();
 for r in select * from wc_order_items where wc_material_variant(wc_order_items)=k loop perform wc_calculate_material_item(r.id);end loop;
end $$;

-- Read current state alongside immutable historical calculations. Ready units without a calculation are omitted.
create function public.wc_costing_report() returns setof jsonb language sql stable security definer set search_path=public as $$
 select to_jsonb(c)||jsonb_build_object('current_status',u.production_status,'changed',
 i.id is null or u.id is null or c.variant_key is distinct from wc_material_variant(i) or c.order_quantity is distinct from i.quantity)
 from wc_product_costs c left join wc_order_items i on i.id=c.item_id left join wc_production_units u on u.id=c.unit_id
 left join wc_orders o on o.id=c.order_id
 where auth.uid() is not null and o.id is not null and not o.is_hidden and o.order_number<>'10242'
 and (c.state='calculated' or (u.production_status<>'Ready' and u.unit_index<=i.quantity and not o.archived
 and upper(coalesce(o.fulfillment_status,''))<>'FULFILLED' and upper(coalesce(o.wix_status,'')) not in ('CANCELED','CANCELLED')))
 order by o.wix_created_at desc,c.product_name,c.unit_index,c.unit_id
$$;

alter table public.wc_materials enable row level security;
alter table public.wc_material_prices enable row level security;
alter table public.wc_material_profiles enable row level security;
alter table public.wc_product_costs enable row level security;
create policy material_read on public.wc_materials for select to authenticated using(true);
create policy material_prices_read on public.wc_material_prices for select to authenticated using(true);
create policy material_profiles_read on public.wc_material_profiles for select to authenticated using(true);
create policy product_costs_read on public.wc_product_costs for select to authenticated using(true);
revoke all on public.wc_materials,public.wc_material_prices,public.wc_material_profiles,public.wc_product_costs from public,anon,authenticated;
grant select on public.wc_materials,public.wc_material_prices,public.wc_material_profiles,public.wc_product_costs to authenticated;
revoke all on function public.wc_calculate_material_item(uuid),public.wc_material_cost_trigger(),public.wc_material_variant(public.wc_order_items) from public,anon,authenticated;
revoke all on function public.wc_save_material(uuid,text,text,numeric,boolean,timestamptz),public.wc_save_material_profile(uuid,text,jsonb,timestamptz),public.wc_costing_report() from public,anon;
grant execute on function public.wc_save_material(uuid,text,text,numeric,boolean,timestamptz),public.wc_save_material_profile(uuid,text,jsonb,timestamptz),public.wc_costing_report() to authenticated;
-- Initial eligible inventory only. Profiles are empty, so no costs are guessed.
do $$declare r record;begin for r in select distinct order_item_id from wc_production_units where production_status<>'Ready' loop
 perform wc_calculate_material_item(r.order_item_id);end loop;end $$;
