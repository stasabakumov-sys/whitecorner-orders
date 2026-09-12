-- Product-owned production templates with optional add-on-specific parts.
alter table public.wc_shipping_products add column product_source text not null default 'catalog'
 check(product_source in ('catalog','hub_test'));
update public.wc_shipping_products set product_source='hub_test'
where wix_product_id is null and product_name in ('TEST Backdrop','TEST Cart');

alter table public.wc_shop_templates add column product_id uuid references public.wc_shipping_products(id);
create index wc_shop_templates_product_idx on public.wc_shop_templates(product_id,name);

create function public.wc_shop_item_product(p_item uuid) returns uuid language sql stable security definer set search_path=public as $$
 select s.id from wc_order_items i join wc_shipping_products s on
  ((s.wix_product_id is not null and s.wix_product_id=coalesce(nullif(i.catalog_reference->>'catalogItemId',''),nullif(i.catalog_reference->>'productId','')))
   or (s.wix_product_id is null and lower(btrim(s.product_name))=lower(btrim(i.product_name))))
 where i.id=p_item order by (s.wix_product_id is not null) desc limit 1
$$;

create function public.wc_shop_product_components(p_product uuid)
returns table(id uuid,product_name text,component_role text) language sql stable security definer set search_path=public as $$
 select p.id,p.product_name,'Product'::text from wc_shipping_products p where p.id=p_product and p.active
 union
 select distinct component.id,component.product_name,'Add-on'::text
 from wc_order_items main join wc_orders o on o.id=main.order_id
 join wc_order_items addon on addon.order_id=main.order_id and addon.id<>main.id and wc_cost_main(addon.id)=main.id
 join wc_shipping_products component on component.id=wc_shop_item_product(addon.id) and component.active
 where wc_cost_main(main.id)=main.id and wc_shop_item_product(main.id)=p_product and not o.is_hidden
$$;

create function public.wc_shop_save_product_template(p_id uuid,p_product uuid,p_name text,p_parts jsonb,p_estimates jsonb,p_version integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); saved wc_shop_templates; clean_estimates jsonb:=coalesce(p_estimates,'{}')-'Painting:Repaint';
begin
 if actor is null then raise exception 'Sign in required';end if;
 if not exists(select 1 from wc_shipping_products where id=p_product and active) then raise exception 'Product not found';end if;
 perform wc_shop_validate_parts(p_parts,clean_estimates);
 if jsonb_array_length(p_parts)>100 then raise exception 'Use no more than 100 parts';end if;
 if exists(select 1 from jsonb_array_elements(p_parts) part
  where coalesce(part->>'component_product_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  or not exists(select 1 from wc_shop_product_components(p_product) c where c.id=(part->>'component_product_id')::uuid))
 then raise exception 'Choose the product or one of its add-ons for every part';end if;
 if p_id is null then
  insert into wc_shop_templates(product_id,name,parts,estimates) values(p_product,btrim(p_name),p_parts,clean_estimates) returning * into saved;
 else
  update wc_shop_templates set name=btrim(p_name),parts=p_parts,estimates=clean_estimates,version=version+1
  where id=p_id and product_id=p_product and version=p_version returning * into saved;
  if not found then raise exception 'Template changed. Reload before editing';end if;
 end if;
 return to_jsonb(saved);
end $$;

create function public.wc_shop_unit_product_parts() returns trigger language plpgsql security definer set search_path=public as $$
declare template wc_shop_templates; source_item uuid; main_item uuid; applicable jsonb;
begin
 select * into template from wc_shop_templates where id=new.template_id;
 if template.product_id is null then return new;end if; -- Preserve already-created pilot templates.
 select order_item_id into source_item from wc_production_units where id=new.unit_id;
 main_item=coalesce(wc_cost_main(source_item),source_item);
 if wc_shop_item_product(main_item) is distinct from template.product_id then
  raise exception 'Choose a parts template saved in this product card';
 end if;
 select jsonb_agg(part.value order by part.ordinality) into applicable
 from jsonb_array_elements(template.parts) with ordinality part
 where (part.value->>'component_product_id')::uuid in (
  select distinct wc_shop_item_product(i.id) from wc_order_items i
  where i.id=main_item or (i.order_id=(select order_id from wc_order_items where id=main_item) and wc_cost_main(i.id)=main_item)
 );
 if applicable is null or jsonb_array_length(applicable)=0 then raise exception 'No saved parts apply to this product composition';end if;
 new.parts=applicable;
 return new;
end $$;
create trigger wc_shop_unit_product_parts before insert or update of template_id,parts on public.wc_shop_units
for each row execute function public.wc_shop_unit_product_parts();

create or replace function public.wc_shop_status_guard() returns trigger language plpgsql security definer set search_path=public as $$
declare u wc_shop_units; previous text;
begin
 if new.production_status is not distinct from old.production_status then return new;end if;
 select * into u from wc_shop_units where unit_id=new.id;
 if (new.production_status='CNC' or old.production_status='New') and not found then raise exception 'Configure and assign product parts in the Product card before CNC';end if;
 if u.unit_id is null then return new;end if;
 previous=old.production_status;
 if new.production_status='Painting' and u.finish='raw' then raise exception 'RAW skips Painting';end if;
 if array_position(array['New','CNC','Assembly','Sanding','Painting','Packing','Ready'],new.production_status) > array_position(array['New','CNC','Assembly','Sanding','Painting','Packing','Ready'],previous) then
  if new.production_status is distinct from (case previous when 'New' then 'CNC' when 'CNC' then 'Assembly' when 'Assembly' then 'Sanding' when 'Sanding' then case u.finish when 'raw' then 'Packing' else 'Painting' end when 'Painting' then 'Packing' when 'Packing' then 'Ready' end) then raise exception 'Complete the next production stage in order';end if;
  if previous in ('CNC','Assembly','Sanding','Painting') and not (previous||':finished'=any(u.completed)) then raise exception 'Finish the current stage in Shop Floor first';end if;
 end if;
 return new;
end $$;

revoke all on function public.wc_shop_item_product(uuid),public.wc_shop_product_components(uuid),
 public.wc_shop_save_product_template(uuid,uuid,text,jsonb,jsonb,integer),public.wc_shop_unit_product_parts() from public,anon,authenticated;
grant execute on function public.wc_shop_product_components(uuid),public.wc_shop_save_product_template(uuid,uuid,text,jsonb,jsonb,integer) to authenticated;
