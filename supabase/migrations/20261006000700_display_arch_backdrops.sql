-- Hub owns the operational product type. Wix remains the source of the name.
-- Keep this classification when a linked catalogue card is refreshed or imported.
create function public.wc_classify_display_arch_backdrop() returns trigger
language plpgsql set search_path=public as $$
begin
 if new.product_name ~* 'display[[:space:]]+arch[[:space:]]+with[[:space:]]+shelves' then
  new.product_type='Backdrop';
 end if;
 return new;
end $$;
revoke all on function public.wc_classify_display_arch_backdrop() from public,anon,authenticated;
create trigger wc_classify_display_arch_backdrop
before insert or update of product_name,product_type on public.wc_shipping_products
for each row execute function public.wc_classify_display_arch_backdrop();

update public.wc_shipping_products
set product_type='Backdrop',updated_at=clock_timestamp()
where product_name ~* 'display[[:space:]]+arch[[:space:]]+with[[:space:]]+shelves'
 and product_type is distinct from 'Backdrop';

-- New production snapshots use the same three-step painting route as Backdrops.
create or replace function public.wc_shop_product_paint_operations(p_unit uuid,p_template uuid)
returns text[] language sql stable security definer set search_path=public as $$
 select case when lower(btrim(coalesce(product.product_type,'')))='backdrop'
   or coalesce(product.product_name,item.product_name,'') ~* 'backdrop|display[[:space:]]+arch[[:space:]]+with[[:space:]]+shelves'
 then array['First primer','First sanding','Finish coat']
 else array['First primer','First sanding','Second primer','Second sanding','Finish coat'] end
 from wc_production_units unit
 left join wc_order_items item on item.id=unit.order_item_id
 left join wc_shop_templates template on template.id=p_template
 left join wc_shipping_products product on product.id=template.product_id
 where unit.id=p_unit
$$;

-- Only unstarted work may have its route brought in line with the new type.
update public.wc_shop_units unit
set paint_operations=public.wc_shop_product_paint_operations(unit.unit_id,unit.template_id)
from public.wc_shop_templates template
join public.wc_shipping_products product on product.id=template.product_id
where unit.template_id=template.id
 and product.product_name ~* 'display[[:space:]]+arch[[:space:]]+with[[:space:]]+shelves'
 and not exists(select 1 from public.wc_shop_intervals work where work.unit_id=unit.unit_id and work.stage='Painting')
 and not exists(select 1 from unnest(unit.completed) completed where completed like 'Painting:%');

-- Individual box drawings must use the same shared Backdrop library boundary.
create or replace function public.wc_require_shared_backdrop_drawing()
returns trigger language plpgsql security definer set search_path=public as $$
declare profile public.wc_delivery_packaging_profiles; kind text; label text;
begin
 select * into profile from public.wc_delivery_packaging_profiles where signature=new.profile_signature;
 select p.product_type,p.product_name into kind,label from public.wc_shipping_products p where p.id=profile.shipping_product_id;
 if lower(btrim(coalesce(kind,'')))='backdrop' or coalesce(label,'') ~* 'backdrop'
    or coalesce(profile.template_item->>'product_name','') ~* 'backdrop|display[[:space:]]+arch[[:space:]]+with[[:space:]]+shelves' then
  raise exception 'Backdrops use one shared packaging drawing per size and folding option. Open Backdrop box drawings; an individual drawing cannot be added.';
 end if;
 return new;
end $$;
