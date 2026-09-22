-- Existing CNC sheets remain available; choose their material on the next save.
alter table public.wc_product_cnc_sheets
 add column material_id uuid references public.wc_materials(id) on delete restrict;
create index wc_product_cnc_sheets_material on public.wc_product_cnc_sheets(material_id);

create function public.wc_save_product_cnc_sheet(p_id uuid,p_product uuid,p_number integer,p_name text,p_parts jsonb,p_comment text,p_material uuid,p_expected uuid)
returns public.wc_product_cnc_sheets language plpgsql security definer set search_path=public as $$
declare result public.wc_product_cnc_sheets;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not exists(select 1 from public.wc_shipping_products where id=p_product) then raise exception 'Product not found'; end if;
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
  insert into public.wc_product_cnc_sheets(product_id,sheet_number,name,material_id,parts,comment)
  values(p_product,p_number,btrim(coalesce(p_name,'')),p_material,p_parts,coalesce(p_comment,'')) returning * into result;
 else
  update public.wc_product_cnc_sheets set sheet_number=p_number,name=btrim(coalesce(p_name,'')),material_id=p_material,parts=p_parts,
   comment=coalesce(p_comment,''),revision=gen_random_uuid(),updated_at=now()
  where id=p_id and product_id=p_product and revision=p_expected returning * into result;
  if not found then raise exception 'CNC sheet changed. Reload before saving.'; end if;
 end if;
 return result;
end $$;
revoke all on function public.wc_save_product_cnc_sheet(uuid,uuid,integer,text,jsonb,text,uuid,uuid) from public,anon;
grant execute on function public.wc_save_product_cnc_sheet(uuid,uuid,integer,text,jsonb,text,uuid,uuid) to authenticated;
drop function public.wc_save_product_cnc_sheet(uuid,uuid,integer,text,jsonb,text,uuid);
