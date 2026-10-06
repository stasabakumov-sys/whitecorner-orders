-- A product template stores its base parts once. Optional parts apply only when
-- the main order item contains the matching option, without cloning templates.
create or replace function public.wc_shop_part_matches_options(p_part jsonb,p_options jsonb)
returns boolean language sql immutable set search_path=public as $$
 select nullif(btrim(p_part->>'option_name'),'') is null or exists(
  select 1 from jsonb_each(coalesce(p_options,'{}'::jsonb)) choice
  where lower(btrim(choice.key))=lower(btrim(p_part->>'option_name'))
   and lower(btrim(wc_shop_option_text(choice.value)))=lower(btrim(p_part->>'option_value'))
 )
$$;

create or replace function public.wc_shop_validate_part_options() returns trigger
language plpgsql set search_path=public as $$
begin
 if exists(select 1 from jsonb_array_elements(new.parts) part
  where (nullif(btrim(part->>'option_name'),'') is null) <> (nullif(btrim(part->>'option_value'),'') is null)
   or length(coalesce(part->>'option_name',''))>150 or length(coalesce(part->>'option_value',''))>300)
 then raise exception 'Enter both option name and value for an optional part';end if;
 return new;
end $$;
create trigger wc_shop_validate_part_options before insert or update of parts on public.wc_shop_templates
for each row execute function public.wc_shop_validate_part_options();

create or replace function public.wc_shop_unit_product_parts() returns trigger
language plpgsql security definer set search_path=public as $$
declare template wc_shop_templates;source_item uuid;main_item uuid;main_options jsonb;applicable jsonb;extra_cnc numeric;
begin
 select * into template from wc_shop_templates where id=new.template_id;
 if template.product_id is null then return new;end if;
 select order_item_id into source_item from wc_production_units where id=new.unit_id;
 main_item=coalesce(wc_cost_main(source_item),source_item);
 if wc_shop_item_product(main_item) is distinct from template.product_id then
  raise exception 'Choose a parts template saved in this product card';
 end if;
 select wix_options into main_options from wc_order_items where id=main_item;
 select jsonb_agg(part.value order by part.ordinality) into applicable
 from jsonb_array_elements(template.parts) with ordinality part
 where (part.value->>'component_product_id')::uuid in (
  select distinct wc_shop_item_product(i.id) from wc_order_items i
  where i.id=main_item or (i.order_id=(select order_id from wc_order_items where id=main_item) and wc_cost_main(i.id)=main_item)
 ) and wc_shop_part_matches_options(part.value,main_options);
 if applicable is null or jsonb_array_length(applicable)=0 then raise exception 'No saved parts apply to this product composition';end if;
 new.parts=applicable;
 select coalesce(sum((template.estimates->>('CNC:'||(part.value->>'id')))::numeric),0) into extra_cnc
 from jsonb_array_elements(applicable) part
 where template.estimates ? ('CNC:'||(part.value->>'id'));
 if template.estimates ? 'CNC' then
  new.estimates=jsonb_set(new.estimates,'{CNC}',to_jsonb((template.estimates->>'CNC')::numeric+extra_cnc),true);
 end if;
 return new;
end $$;
revoke all on function public.wc_shop_part_matches_options(jsonb,jsonb),public.wc_shop_validate_part_options() from public,anon,authenticated;
