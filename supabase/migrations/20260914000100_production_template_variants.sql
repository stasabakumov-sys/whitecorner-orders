-- Explicit structural scope; existing estimates remain unassigned, never guessed.
alter table public.wc_shop_templates add column size_key text,add column folding text,
 add constraint wc_shop_template_scope check((size_key is null and folding is null) or
 (size_key is not null and folding is not null and folding in ('foldable','nonfoldable') and size_key ~ '^[1-9][0-9]{0,4}x[1-9][0-9]{0,4}$'));
create unique index wc_shop_template_variant_unique on public.wc_shop_templates(product_id,size_key,folding) where size_key is not null;

create function public.wc_shop_save_variant_template(p_id uuid,p_product uuid,p_name text,p_parts jsonb,p_estimates jsonb,p_version integer,p_size text,p_folding text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; saved wc_shop_templates;
begin
 if auth.uid() is null then raise exception 'Sign in required';end if;
 if p_size is null or p_size !~ '^[1-9][0-9]{0,4}x[1-9][0-9]{0,4}$' or p_folding is null or p_folding not in ('foldable','nonfoldable') then raise exception 'Choose size and folding option';end if;
 if split_part(p_size,'x',1)::int<split_part(p_size,'x',2)::int or split_part(p_size,'x',1)::int>10000 then raise exception 'Invalid product size';end if;
 perform pg_advisory_xact_lock(hashtextextended('shop-template:'||p_product::text||':'||p_size||':'||p_folding,0));
 if exists(select 1 from wc_shop_templates where product_id=p_product and size_key=p_size and folding=p_folding and id is distinct from p_id) then raise exception 'Estimated time already exists for this size and folding option. Open its template before editing.';end if;
 result=wc_shop_save_product_template(p_id,p_product,p_name,p_parts,p_estimates,p_version);
 update wc_shop_templates set size_key=p_size,folding=p_folding where id=(result->>'id')::uuid returning * into saved;
 return to_jsonb(saved);
end $$;
revoke all on function public.wc_shop_save_variant_template(uuid,uuid,text,jsonb,jsonb,integer,text,text) from public,anon;
grant execute on function public.wc_shop_save_variant_template(uuid,uuid,text,jsonb,jsonb,integer,text,text) to authenticated;

create function public.wc_shop_option_text(value jsonb) returns text language sql immutable set search_path=public as $$
 select case jsonb_typeof(value) when 'object' then coalesce(value->>'original',value->>'value','') else value#>>'{}' end
$$;
create function public.wc_shop_variant_folding(options jsonb) returns text language sql immutable set search_path=public as $$
 with normalized as(select case regexp_replace(lower(btrim(wc_shop_option_text(value))),'[\s_-]','','g')
 when 'yes' then 'foldable' when 'true' then 'foldable' when 'foldable' then 'foldable'
 when 'no' then 'nonfoldable' when 'false' then 'nonfoldable' when 'nonfoldable' then 'nonfoldable' when 'unfoldable' then 'nonfoldable' else '' end value
 from jsonb_each(coalesce(options,'{}')) where lower(btrim(key))='foldable')
 select case when count(distinct value)=1 and min(value)<>'' then min(value) end from normalized
$$;
create function public.wc_shop_metric_size(value text) returns text language plpgsql immutable set search_path=public as $$
declare m text[]; a numeric;b numeric;
begin
 m=regexp_match(lower(btrim(value)),'^(\d+(?:\.\d+)?)\s*(mm|cm|m)?\s*[x×]\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)$');
 if m is null then return null;end if;
 a=m[1]::numeric*(case coalesce(m[2],m[4]) when 'm' then 1000 when 'cm' then 10 else 1 end);
 b=m[3]::numeric*(case m[4] when 'm' then 1000 when 'cm' then 10 else 1 end);
 if a<=0 or b<=0 or a>10000 or b>10000 or trunc(a)<>a or trunc(b)<>b then return null;end if;
 return greatest(a,b)::int::text||'x'||least(a,b)::int::text;
end $$;
create function public.wc_shop_variant_size(options jsonb) returns text language sql immutable set search_path=public as $$
 with sizes as(select wc_shop_metric_size(wc_shop_option_text(value)) value from jsonb_each(coalesce(options,'{}')) where btrim(key) ~* '^size|dimensions?$')
 select case when count(*)=count(value) and count(distinct value)=1 then min(value) end from sizes
$$;
create function public.wc_shop_check_template_variant() returns trigger language plpgsql security definer set search_path=public as $$
declare template wc_shop_templates; item wc_order_items; product_name text;
begin
 select * into template from wc_shop_templates where id=new.template_id;
 select p.product_name into product_name from wc_shipping_products p where p.id=template.product_id;
 if template.size_key is null then
  if coalesce(product_name,'') ~* 'backdrop' then raise exception 'Assign a size and folding option to this product template in Estimated min first';end if;
  return new;
 end if;
 select i.* into item from wc_production_units u join wc_order_items i on i.id=coalesce(wc_cost_main(u.order_item_id),u.order_item_id) where u.id=new.unit_id;
 if template.size_key is distinct from wc_shop_variant_size(item.wix_options) or template.folding is distinct from wc_shop_variant_folding(item.wix_options) then
  raise exception 'Estimated time template does not match the product size and folding option';
 end if;
 return new;
end $$;
create trigger wc_shop_check_template_variant before insert or update of template_id on public.wc_shop_units for each row execute function public.wc_shop_check_template_variant();
revoke all on function public.wc_shop_option_text(jsonb),public.wc_shop_variant_folding(jsonb),public.wc_shop_metric_size(text),public.wc_shop_variant_size(jsonb),public.wc_shop_check_template_variant() from public,anon,authenticated;
