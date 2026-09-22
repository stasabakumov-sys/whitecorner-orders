-- The owner will re-enter the single existing Backdrop CNC sheet for its correct folding option.
do $$
declare existing_count integer;
begin
 select count(*) into existing_count from public.wc_product_cnc_sheets s
 join public.wc_shipping_products p on p.id=s.product_id
 where lower(btrim(coalesce(p.product_type,'')))='backdrop' or p.product_name ~* 'backdrop';
 if existing_count>1 then raise exception 'Expected at most one existing Backdrop CNC sheet; found %',existing_count; end if;
 delete from public.wc_product_cnc_sheets s using public.wc_shipping_products p
 where p.id=s.product_id and (lower(btrim(coalesce(p.product_type,'')))='backdrop' or p.product_name ~* 'backdrop');
end $$;
alter table public.wc_product_cnc_sheets
 add column folding text check(folding is null or folding in ('foldable','nonfoldable'));
alter table public.wc_product_cnc_sheets
 drop constraint wc_product_cnc_sheets_product_id_sheet_number_key;
create unique index wc_product_cnc_sheets_variant_number
 on public.wc_product_cnc_sheets(product_id,coalesce(folding,''),sheet_number);

create function public.wc_save_product_cnc_sheet(p_id uuid,p_product uuid,p_number integer,p_name text,p_parts jsonb,p_comment text,p_material uuid,p_folding text,p_expected uuid)
returns public.wc_product_cnc_sheets language plpgsql security definer set search_path=public as $$
declare result public.wc_product_cnc_sheets; backdrop boolean;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select lower(btrim(coalesce(product_type,'')))='backdrop' or product_name ~* 'backdrop'
  into backdrop from public.wc_shipping_products where id=p_product;
 if not found then raise exception 'Product not found'; end if;
 if (backdrop and coalesce(p_folding,'') not in ('foldable','nonfoldable'))
    or (not backdrop and p_folding is not null) then
  raise exception 'Choose the correct CNC folding option for this product';
 end if;
 if p_material is null or not exists(select 1 from public.wc_materials m where m.id=p_material
    and (m.active or exists(select 1 from public.wc_product_cnc_sheets s where s.id=p_id and s.product_id=p_product and s.material_id=p_material))) then
  raise exception 'Choose an active material from the list';
 end if;
 if p_number is null or p_number<1 or length(btrim(coalesce(p_name,'')))>150 or length(coalesce(p_comment,''))>4000
    or jsonb_typeof(p_parts) is distinct from 'array'
    or exists(select 1 from jsonb_array_elements(p_parts) x where coalesce(length(x->>'id'),0)=0 or coalesce(length(btrim(x->>'name')),0)=0)
    or (select count(*) from jsonb_array_elements(p_parts))<>(select count(distinct x->>'id') from jsonb_array_elements(p_parts) x)
 then raise exception 'Invalid CNC sheet details'; end if;
 if p_id is null then
  insert into public.wc_product_cnc_sheets(product_id,sheet_number,name,material_id,parts,comment,folding)
  values(p_product,p_number,btrim(coalesce(p_name,'')),p_material,p_parts,coalesce(p_comment,''),p_folding) returning * into result;
 else
  update public.wc_product_cnc_sheets set sheet_number=p_number,name=btrim(coalesce(p_name,'')),material_id=p_material,parts=p_parts,
   comment=coalesce(p_comment,''),revision=gen_random_uuid(),updated_at=now()
  where id=p_id and product_id=p_product and revision=p_expected and folding is not distinct from p_folding returning * into result;
  if not found then raise exception 'CNC sheet changed or belongs to another folding option. Reload before saving.'; end if;
 end if;
 return result;
end $$;
revoke all on function public.wc_save_product_cnc_sheet(uuid,uuid,integer,text,jsonb,text,uuid,text,uuid) from public,anon;
grant execute on function public.wc_save_product_cnc_sheet(uuid,uuid,integer,text,jsonb,text,uuid,text,uuid) to authenticated;
drop function public.wc_save_product_cnc_sheet(uuid,uuid,integer,text,jsonb,text,uuid,uuid);
