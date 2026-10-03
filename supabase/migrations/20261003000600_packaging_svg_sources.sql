-- Permit SVG and CDR source drawings while preserving Cart access and revision checks.
create or replace function public.wc_save_cart_base_box_drawing(
 p_package uuid,p_box jsonb,p_path text,p_filename text,p_bytes integer,p_expected uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare current_box jsonb; previous uuid; result public.wc_cart_base_box_drawings;
begin
 if not public.wc_is_hub_manager() then raise exception 'Manager access required'; end if;
 select jsonb_build_object('package_name',p.package_name,'length_mm',p.length_mm,'width_mm',p.width_mm,'height_mm',p.height_mm)
 into current_box from public.wc_shipping_packages p join public.wc_shipping_products product on product.id=p.shipping_product_id
 where p.id=p_package and p.active and (p.source_type='Base' or p.shipping_rule_id is not null) and product.product_type='Cart' for update of p;
 if not found or p_box is distinct from current_box then raise exception 'Packaging box changed. Reload the product before uploading.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('cart-base-drawing:'||p_package::text,0));
 select revision into previous from public.wc_cart_base_box_drawings where cart_base_package_id=p_package;
 if previous is distinct from p_expected then raise exception 'Drawing changed. Reload before replacing it.'; end if;
 if p_filename is null or length(p_filename) not between 5 and 255 or lower(p_filename) !~ '\.(cdr|svg)$'
 or p_bytes is null or p_bytes not between 1 and 20971520
 or p_path is null or split_part(p_path,'/',1)<>auth.uid()::text
 or not exists(select 1 from storage.objects where bucket_id='box-drawings' and name=p_path and (metadata->>'size')::bigint=p_bytes)
 then raise exception 'Choose a valid SVG or CDR drawing of at most 20 MB and retry.'; end if;
 insert into public.wc_cart_base_box_drawings(cart_base_package_id,box_snapshot,object_path,filename,size_bytes)
 values(p_package,p_box,p_path,p_filename,p_bytes)
 on conflict(cart_base_package_id) do update set box_snapshot=excluded.box_snapshot,object_path=excluded.object_path,
 filename=excluded.filename,size_bytes=excluded.size_bytes,revision=gen_random_uuid(),updated_at=now() returning * into result;
 return to_jsonb(result);
end $$;
revoke all on function public.wc_save_cart_base_box_drawing(uuid,jsonb,text,text,integer,uuid) from public,anon;
grant execute on function public.wc_save_cart_base_box_drawing(uuid,jsonb,text,text,integer,uuid) to authenticated;
