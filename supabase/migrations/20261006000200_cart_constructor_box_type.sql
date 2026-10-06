-- Add Small box to the existing atomic Cart Constructor contract.
create or replace function public.wc_save_cart_constructor_files(
 p_request uuid,p_package uuid,p_box jsonb,p_constructor jsonb,p_svg jsonb,p_rd_files jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare current_box jsonb; previous public.wc_cart_box_svg_drawings; drawing public.wc_cart_box_svg_drawings;
 receipt public.wc_cart_constructor_saves; payload jsonb; entry jsonb; saved public.wc_box_rd_files;
 rd_result jsonb:='[]'; rd_ids jsonb:='[]'; existing_ids uuid[]; requested_ids uuid[]; result jsonb; box_type text; file_count integer; copy_count integer; removal_ids uuid[];
begin
 if not public.wc_is_hub_manager() then raise exception 'Manager access required'; end if;
 if p_request is null or p_package is null then raise exception 'Choose a saved Cart packaging box'; end if;
 payload:=jsonb_build_object('package',p_package,'box',p_box,'constructor',p_constructor,'svg',p_svg,'rd',p_rd_files);
 perform pg_advisory_xact_lock(hashtextextended('cart-constructor-request:'||p_request::text,0));
 select * into receipt from wc_cart_constructor_saves where request_id=p_request;
 if found then
  if receipt.payload is distinct from payload then raise exception 'Save request changed. Reload before retrying.'; end if;
  return receipt.result;
 end if;
 select jsonb_build_object('package_name',p.package_name,'length_mm',p.length_mm,'width_mm',p.width_mm,'height_mm',p.height_mm)
 into current_box from wc_shipping_packages p join wc_shipping_products product on product.id=p.shipping_product_id
 where p.id=p_package and p.active and (p.source_type='Base' or p.shipping_rule_id is not null) and product.product_type='Cart'
 for update of p;
 if not found or p_box is distinct from current_box then raise exception 'Cart packaging changed. Save its dimensions and reopen Constructor.'; end if;
 -- Use the same locks as manual Cart RD and CDR saves.
 perform pg_advisory_xact_lock(hashtextextended('cart-base-rd:'||p_package::text,0));
 perform pg_advisory_xact_lock(hashtextextended('cart-constructor-svg:'||p_package::text,0));
 box_type:=coalesce(p_constructor->>'box_type','card');
 if box_type not in ('card','small') then raise exception 'Choose Card box or Small box'; end if;
 file_count:=case when box_type='small' then 1 else 2 end;
 copy_count:=file_count;
 if jsonb_typeof(p_constructor) is distinct from 'object' then raise exception 'Constructor dimensions are missing'; end if;
 if box_type='small' then
  if jsonb_typeof(p_constructor->'box') is distinct from 'object'
   or jsonb_typeof(p_constructor->'tuck') is distinct from 'number'
   or (p_constructor->'box') is distinct from jsonb_build_object('length',round((current_box->>'length_mm')::numeric-5,6),'width',round((current_box->>'width_mm')::numeric-5,6),'depth',(current_box->>'height_mm')::numeric)
   or current_box->>'length_mm' is null or current_box->>'width_mm' is null or current_box->>'height_mm' is null
   or (current_box->>'length_mm')::numeric<=5 or (current_box->>'width_mm')::numeric<=5 or (current_box->>'height_mm')::numeric<=0
   or (p_constructor->>'tuck')::numeric<=0.5 or (p_constructor->>'tuck')::numeric>(current_box->>'height_mm')::numeric
   or (p_constructor->>'tuck')::numeric>=((current_box->>'length_mm')::numeric-5)/2
  then raise exception 'Use Small box dimensions: L/W minus 5 mm, unchanged height and a valid tuck flap.'; end if;
 else
  if jsonb_typeof(p_constructor->'bottom') is distinct from 'object' or jsonb_typeof(p_constructor->'lid') is distinct from 'object' then raise exception 'Constructor dimensions are missing'; end if;
 -- Match SVG's six decimal places without JavaScript subtraction noise.
 if (p_constructor->'bottom') is distinct from jsonb_build_object('length',round((current_box->>'length_mm')::numeric-15,6),'width',round((current_box->>'width_mm')::numeric-15,6),'depth',(current_box->>'height_mm')::numeric)
  or (p_constructor->'lid') is distinct from jsonb_build_object('length',round((current_box->>'length_mm')::numeric-5,6),'width',round((current_box->>'width_mm')::numeric-5,6),'depth',(current_box->>'height_mm')::numeric)
  or current_box->>'length_mm' is null or current_box->>'width_mm' is null or current_box->>'height_mm' is null
  or (current_box->>'length_mm')::numeric<=15 or (current_box->>'width_mm')::numeric<=15 or (current_box->>'height_mm')::numeric<=0
 then raise exception 'Use Cart dimensions: bottom L/W minus 15 mm, lid L/W minus 5 mm, unchanged height.'; end if;
 end if;
 if jsonb_typeof(p_rd_files) is distinct from 'array' or jsonb_array_length(p_rd_files)<>file_count then raise exception 'Prepare % RD files for this box type',file_count; end if;
 if p_svg->>'filename' is null or length(p_svg->>'filename') not between 5 and 255 or lower(p_svg->>'filename') not like '%.svg'
  or p_svg->>'bytes' is null or (p_svg->>'bytes')::integer not between 1 and 20971520 or p_svg->>'path' is null
  or split_part(p_svg->>'path','/',1) is distinct from auth.uid()::text
  or not exists(select 1 from storage.objects where bucket_id='box-drawings' and name=p_svg->>'path'
     and (metadata->>'size')::bigint=(p_svg->>'bytes')::integer)
 then raise exception 'SVG upload is missing or invalid. Retry upload.'; end if;
 select * into previous from wc_cart_box_svg_drawings where cart_base_package_id=p_package for update;
 if previous.revision is distinct from (p_svg->>'expected')::uuid then raise exception 'SVG drawing changed. Reopen Constructor.'; end if;
 select coalesce(array_agg(id order by id),'{}'::uuid[]) into existing_ids from wc_box_rd_files where cart_base_package_id=p_package;
 select coalesce(array_agg((file->>'id')::uuid order by (file->>'id')::uuid) filter(where file->>'id' is not null),'{}'::uuid[])
 into requested_ids from jsonb_array_elements(p_rd_files) file;
 if cardinality(existing_ids)>2 then raise exception 'Review the existing RD set first; Constructor supports one or two saved files'; end if;
 if cardinality(existing_ids)>0 and cardinality(existing_ids)<>file_count then
  if cardinality(requested_ids)<>0 or jsonb_typeof(p_constructor->'replace_files') is distinct from 'array' then raise exception 'Confirm the existing RD set before changing box type'; end if;
  select coalesce(array_agg((item->>'id')::uuid order by (item->>'id')::uuid),'{}'::uuid[]) into removal_ids from jsonb_array_elements(p_constructor->'replace_files') item;
  if removal_ids is distinct from existing_ids then raise exception 'RD set changed. Reopen Constructor.'; end if;
  -- Existing deletion guards reject active cutting tasks. Historical snapshots and
  -- storage objects remain intact; the entire conversion rolls back on any error.
  for entry in select value from jsonb_array_elements(p_constructor->'replace_files') loop
   perform wc_delete_box_rd_file((entry->>'id')::uuid,(entry->>'expected')::uuid);
  end loop;
 elsif existing_ids is distinct from requested_ids then
  raise exception 'RD set changed. Reopen Constructor and select the existing RD files to replace.';
 end if;
 if file_count=2 and ((p_rd_files->0->>'filename') is not distinct from (p_rd_files->1->>'filename')
  or (p_rd_files->0->>'path') is not distinct from (p_rd_files->1->>'path')) then raise exception 'Bottom and lid must be separate RD files'; end if;
 for entry in select value from jsonb_array_elements(p_rd_files) loop
  saved:=wc_save_cart_base_rd_file_for_package((entry->>'id')::uuid,p_package,entry->>'path',entry->>'filename',
    (entry->>'bytes')::integer,copy_count,(entry->>'expected')::uuid);
  rd_result:=rd_result||jsonb_build_array(to_jsonb(saved)); rd_ids:=rd_ids||jsonb_build_array(saved.id);
 end loop;
 insert into wc_cart_box_svg_drawings(cart_base_package_id,box_snapshot,constructor_data,object_path,filename,size_bytes)
 values(p_package,p_box,p_constructor||jsonb_build_object('rd_ids',rd_ids),p_svg->>'path',p_svg->>'filename',(p_svg->>'bytes')::integer)
 on conflict(cart_base_package_id) do update set box_snapshot=excluded.box_snapshot,constructor_data=excluded.constructor_data,
 object_path=excluded.object_path,filename=excluded.filename,size_bytes=excluded.size_bytes,
 revision=gen_random_uuid(),updated_at=now() returning * into drawing;
 result:=jsonb_build_object('drawing',to_jsonb(drawing),'rd_files',rd_result);
 insert into wc_cart_constructor_saves(request_id,cart_base_package_id,payload,result) values(p_request,p_package,payload,result);
 return result;
end $$;
revoke all on function public.wc_save_cart_constructor_files(uuid,uuid,jsonb,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.wc_save_cart_constructor_files(uuid,uuid,jsonb,jsonb,jsonb,jsonb) to authenticated;
