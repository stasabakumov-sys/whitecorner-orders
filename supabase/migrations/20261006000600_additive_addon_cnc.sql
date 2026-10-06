-- New CNC+scope values are additive Add-on minutes. Existing CNC@scope totals
-- remain as a fallback until each Add-on in a configuration has its own value.
create or replace function public.wc_shop_cnc_composition_key(p_parts jsonb,p_estimates jsonb,p_product uuid,p_options jsonb,p_components uuid[])
returns text language sql immutable set search_path=public as $$
 select coalesce('CNC@'||string_agg(scope,'|' order by scope),'CNC') from (
  select distinct scope from (
   select case when nullif(btrim(part->>'option_name'),'') is not null then
     'option:'||lower(btrim(part->>'option_name'))||'='||lower(btrim(part->>'option_value'))
    when nullif(part->>'component_product_id','') is not null and part->>'component_product_id'<>p_product::text then
     'component:'||(part->>'component_product_id') else null end scope
   from jsonb_array_elements(p_parts) part
   union all
   select regexp_split_to_table(substring(key from 5),'[|]')
   from jsonb_object_keys(p_estimates) key where key like 'CNC@%'
   union all
   select substring(key from 5)
   from jsonb_object_keys(p_estimates) key where key like 'CNC+%'
  ) known where scope is not null and wc_shop_cnc_scope_matches(scope,p_options,p_components)
 ) selected
$$;

create or replace function public.wc_shop_unit_product_parts() returns trigger
language plpgsql security definer set search_path=public as $$
declare template wc_shop_templates;source_item uuid;main_item uuid;main_options jsonb;applicable jsonb;
 components uuid[];cnc_key text;legacy_cnc numeric;legacy_count integer;main_legacy numeric;
 scope_count integer;additive_count integer;additive_cnc numeric;resolved_cnc numeric;
begin
 select * into template from wc_shop_templates where id=new.template_id;
 if template.product_id is null then return new;end if;
 select order_item_id into source_item from wc_production_units where id=new.unit_id;
 main_item=coalesce(wc_cost_main(source_item),source_item);
 if wc_shop_item_product(main_item) is distinct from template.product_id then
  raise exception 'Choose a parts template saved in this product card';
 end if;
 select wix_options into main_options from wc_order_items where id=main_item;
 select array_agg(distinct wc_shop_item_product(i.id)) into components from wc_order_items i
 where i.id=main_item or (i.order_id=(select order_id from wc_order_items where id=main_item) and wc_cost_main(i.id)=main_item);
 select jsonb_agg(part.value order by part.ordinality) into applicable
 from jsonb_array_elements(template.parts) with ordinality part
 where (part.value->>'component_product_id')::uuid=any(components)
  and wc_shop_part_matches_options(part.value,main_options);
 if applicable is null or jsonb_array_length(applicable)=0 then raise exception 'No saved parts apply to this product composition';end if;
 new.parts=applicable;
 cnc_key=wc_shop_cnc_composition_key(template.parts,template.estimates,template.product_id,main_options,components);
 select count(*),coalesce(sum((template.estimates->>('CNC:'||(part.value->>'id')))::numeric),0),
  coalesce(sum(case when nullif(btrim(part.value->>'option_name'),'') is null
   and part.value->>'component_product_id'=template.product_id::text
   then (template.estimates->>('CNC:'||(part.value->>'id')))::numeric else 0 end),0)
 into legacy_count,legacy_cnc,main_legacy from jsonb_array_elements(applicable) part
 where template.estimates ? ('CNC:'||(part.value->>'id'));
 scope_count=0;additive_count=0;additive_cnc=0;
 if cnc_key<>'CNC' then
  select count(*),count(*) filter(where template.estimates ? ('CNC+'||scope)),
   coalesce(sum((template.estimates->>('CNC+'||scope))::numeric),0)
  into scope_count,additive_count,additive_cnc
  from regexp_split_to_table(substring(cnc_key from 5),'[|]') scope;
 end if;
 resolved_cnc=null;
 if template.estimates ? 'CNC' then
  if scope_count=0 then resolved_cnc=(template.estimates->>'CNC')::numeric+legacy_cnc;
  elsif additive_count=scope_count then resolved_cnc=(template.estimates->>'CNC')::numeric+main_legacy+additive_cnc;
  elsif template.estimates ? cnc_key then resolved_cnc=(template.estimates->>cnc_key)::numeric;
  elsif additive_count=0 and legacy_count>0 then resolved_cnc=(template.estimates->>'CNC')::numeric+legacy_cnc;
  end if;
 end if;
 -- Unit snapshots hold only the resolved CNC total. Saved template values remain intact.
 new.estimates=(select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) from jsonb_each(new.estimates) entry
  where key not like 'CNC@%' and key not like 'CNC+%' and key not like 'CNC:%');
 if resolved_cnc is null then new.estimates=new.estimates-'CNC';
 else new.estimates=jsonb_set(new.estimates,'{CNC}',to_jsonb(resolved_cnc),true);end if;
 return new;
end $$;
