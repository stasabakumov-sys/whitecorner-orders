-- Preserve complete Backdrop bottom and lid when they fit one sheet and laser field.
-- Reduce the border before using the original unequal main/short split.
create or replace function public.wc_backdrop_constructor_geometry(p_box jsonb)
returns jsonb language plpgsql immutable set search_path=public,pg_temp as $$
declare l numeric:=(p_box->>'length_mm')::numeric-15;
 w numeric:=(p_box->>'width_mm')::numeric-15; d numeric:=(p_box->>'height_mm')::numeric;
 normal_rim numeric; rotated_rim numeric; rim numeric; max_panel numeric; main_panel numeric;
begin
 if l is null or w is null or d is null or l<=0 or w<=0 or d<=0
  or l::text in ('NaN','Infinity','-Infinity') or w::text in ('NaN','Infinity','-Infinity') or d::text in ('NaN','Infinity','-Infinity')
 then raise exception 'Use positive Backdrop box dimensions, with L/W greater than 15 mm';end if;
 normal_rim:=least(d,(1170-(w+10))/2,(990-(l+10))/2);
 rotated_rim:=least(d,(1170-(l+10))/2,(990-(w+10))/2);
 if greatest(normal_rim,rotated_rim)>0 then
  rim:=greatest(normal_rim,rotated_rim);
  main_panel:=l;
 else
  rim:=least(d,(1170-(w+10))/2);
  if rim<=0 then raise exception 'Backdrop box leaves no border on the 1170 x 1170 mm cardboard sheet';end if;
  max_panel:=990-rim;
  if l+10>2*max_panel then raise exception 'Backdrop box cannot fit the 1300 x 990 mm laser field in two parts';end if;
  main_panel:=least(max_panel,greatest(greatest(l/2,l-129),l+10-max_panel));
  if main_panel>=l then raise exception 'Backdrop box cannot fit the laser field; reduce height';end if;
 end if;
 return jsonb_build_object('bottom',jsonb_build_object('length',round(l,6),'width',round(w,6),'depth',d),
  'lid',jsonb_build_object('length',round(l+10,6),'width',round(w+10,6),'depth',d),
  'rim',round(rim,6),'main_panel',round(main_panel,6));
end $$;
revoke all on function public.wc_backdrop_constructor_geometry(jsonb) from public,anon,authenticated;

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
 if box_type not in ('card','small','backdrop') then raise exception 'Choose Card box, Small box or Backdrop box'; end if;
 file_count:=case when box_type='backdrop' then
  case when (public.wc_backdrop_constructor_geometry(current_box)->>'main_panel')::numeric=(current_box->>'length_mm')::numeric-15 then 2 else 4 end
  when box_type='small' then 1 else 2 end;
 copy_count:=case when box_type='card' then 2 else 1 end;
 if jsonb_typeof(p_constructor) is distinct from 'object' then raise exception 'Constructor dimensions are missing'; end if;
 if box_type='backdrop' then
  if jsonb_build_object('bottom',p_constructor->'bottom','lid',p_constructor->'lid','rim',p_constructor->'rim','main_panel',p_constructor->'main_panel')
   is distinct from public.wc_backdrop_constructor_geometry(current_box)
  then raise exception 'Use canonical Backdrop box dimensions, border and split for the saved package';end if;
 elsif box_type='small' then
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
 if cardinality(existing_ids) not in (0,1,2,4) then raise exception 'Review the existing RD set first; Constructor supports one, two or four saved files'; end if;
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
 if (select count(distinct file->>'filename') from jsonb_array_elements(p_rd_files) file)<>file_count
  or (select count(distinct file->>'path') from jsonb_array_elements(p_rd_files) file)<>file_count
 then raise exception 'Each part must have a separate RD filename and storage path';end if;
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

create or replace function public.wc_save_backdrop_constructor_files(
 p_request uuid,p_size text,p_box jsonb,p_constructor jsonb,p_svg jsonb,p_rd_files jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare current_box jsonb; previous public.wc_backdrop_box_svg_drawings; drawing public.wc_backdrop_box_svg_drawings;
 receipt public.wc_backdrop_constructor_saves; payload jsonb; entry jsonb; saved public.wc_box_rd_files;
 rd_result jsonb:='[]'; rd_ids jsonb:='[]'; existing_ids uuid[]; requested_ids uuid[]; result jsonb; box_type text; file_count integer; copy_count integer; removal_ids uuid[];
begin
 if not public.wc_is_hub_manager() then raise exception 'Manager access required'; end if;
 if p_request is null or p_size is null or p_size !~ '^[1-9][0-9]{0,4}x[1-9][0-9]{0,4}:(foldable|nonfoldable)$' then raise exception 'Choose a saved Backdrop size and folding option'; end if;
 payload:=jsonb_build_object('size',p_size,'box',p_box,'constructor',p_constructor,'svg',p_svg,'rd',p_rd_files);
 perform pg_advisory_xact_lock(hashtextextended('backdrop-constructor-request:'||p_request::text,0));
 select * into receipt from wc_backdrop_constructor_saves where request_id=p_request;
 if found then
  if receipt.payload is distinct from payload then raise exception 'Save request changed. Reload before retrying.'; end if;
  return receipt.result;
 end if;
 -- Lock the same shared size + folding source as manual RD editing and dispatch.
 perform pg_advisory_xact_lock(hashtext(p_size));
 perform pg_advisory_xact_lock(hashtextextended('backdrop-packaging-dimensions:'||p_size,0));
 select jsonb_build_object('package_name',d.package_name,'length_mm',d.length_mm,'width_mm',d.width_mm,'height_mm',d.height_mm)
 into current_box from wc_backdrop_packaging_dimensions d where d.size_key=p_size for update;
 if not found or p_box is distinct from current_box then raise exception 'Backdrop packaging changed. Save its dimensions and reopen Constructor.'; end if;
 box_type:=coalesce(p_constructor->>'box_type','card');
 if box_type not in ('card','small','backdrop') then raise exception 'Choose Card box, Small box or Backdrop box'; end if;
 file_count:=case when box_type='backdrop' then
  case when (public.wc_backdrop_constructor_geometry(current_box)->>'main_panel')::numeric=(current_box->>'length_mm')::numeric-15 then 2 else 4 end
  when box_type='small' then 1 else 2 end;
 copy_count:=case when box_type='card' then 2 else 1 end;
 if jsonb_typeof(p_constructor) is distinct from 'object' then raise exception 'Constructor dimensions are missing'; end if;
 if box_type='backdrop' then
  if jsonb_build_object('bottom',p_constructor->'bottom','lid',p_constructor->'lid','rim',p_constructor->'rim','main_panel',p_constructor->'main_panel')
   is distinct from public.wc_backdrop_constructor_geometry(current_box)
  then raise exception 'Use canonical Backdrop box dimensions, border and split for the saved package';end if;
 elsif box_type='small' then
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
 then raise exception 'Use Card box dimensions: bottom L/W minus 15 mm, lid L/W minus 5 mm, unchanged height.'; end if;
 end if;
 if jsonb_typeof(p_rd_files) is distinct from 'array' or jsonb_array_length(p_rd_files)<>file_count then raise exception 'Prepare % RD files for this box type',file_count; end if;
 if p_svg->>'filename' is null or length(p_svg->>'filename') not between 5 and 255 or lower(p_svg->>'filename') not like '%.svg'
  or p_svg->>'bytes' is null or (p_svg->>'bytes')::integer not between 1 and 20971520 or p_svg->>'path' is null
  or split_part(p_svg->>'path','/',1) is distinct from auth.uid()::text
  or not exists(select 1 from storage.objects where bucket_id='box-drawings' and name=p_svg->>'path'
     and (metadata->>'size')::bigint=(p_svg->>'bytes')::integer)
 then raise exception 'SVG upload is missing or invalid. Retry upload.'; end if;
 select * into previous from wc_backdrop_box_svg_drawings where size_key=p_size for update;
 if previous.revision is distinct from (p_svg->>'expected')::uuid then raise exception 'SVG drawing changed. Reopen Constructor.'; end if;
 select coalesce(array_agg(id order by id),'{}'::uuid[]) into existing_ids from wc_box_rd_files where backdrop_size_key=p_size;
 select coalesce(array_agg((file->>'id')::uuid order by (file->>'id')::uuid) filter(where file->>'id' is not null),'{}'::uuid[])
 into requested_ids from jsonb_array_elements(p_rd_files) file;
 if cardinality(existing_ids) not in (0,1,2,4) then raise exception 'Review the existing RD set first; Constructor supports one, two or four saved files'; end if;
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
 if (select count(distinct file->>'filename') from jsonb_array_elements(p_rd_files) file)<>file_count
  or (select count(distinct file->>'path') from jsonb_array_elements(p_rd_files) file)<>file_count
 then raise exception 'Each part must have a separate RD filename and storage path';end if;
 for entry in select value from jsonb_array_elements(p_rd_files) loop
  saved:=wc_save_backdrop_rd_file((entry->>'id')::uuid,p_size,entry->>'path',entry->>'filename',
    (entry->>'bytes')::integer,copy_count,(entry->>'expected')::uuid);
  rd_result:=rd_result||jsonb_build_array(to_jsonb(saved)); rd_ids:=rd_ids||jsonb_build_array(saved.id);
 end loop;
 insert into wc_backdrop_box_svg_drawings(size_key,box_snapshot,constructor_data,object_path,filename,size_bytes)
 values(p_size,p_box,p_constructor||jsonb_build_object('rd_ids',rd_ids),p_svg->>'path',p_svg->>'filename',(p_svg->>'bytes')::integer)
 on conflict(size_key) do update set box_snapshot=excluded.box_snapshot,constructor_data=excluded.constructor_data,
 object_path=excluded.object_path,filename=excluded.filename,size_bytes=excluded.size_bytes,
 revision=gen_random_uuid(),updated_at=now() returning * into drawing;
 result:=jsonb_build_object('drawing',to_jsonb(drawing),'rd_files',rd_result);
 insert into wc_backdrop_constructor_saves(request_id,size_key,payload,result) values(p_request,p_size,payload,result);
 return result;
end $$;
revoke all on function public.wc_save_backdrop_constructor_files(uuid,text,jsonb,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.wc_save_backdrop_constructor_files(uuid,text,jsonb,jsonb,jsonb,jsonb) to authenticated;

-- New cutting tasks use the saved constructor order; old snapshots remain intact.
create or replace function public.wc_send_packing_task(p_unit uuid,p_profile text)
returns public.wc_packing_tasks language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); product_id uuid; product_label text; order_label text;
 box_count integer; box_number integer; snapshot jsonb; package_snapshot jsonb; result public.wc_packing_tasks;
 shared_key text; use_backdrop boolean; base_id uuid; use_cart boolean;
begin
 if not public.wc_is_hub_manager() then raise exception 'Manager access required'; end if;
 select public.wc_shop_item_product(main.id),main.product_name,o.order_number::text
 into product_id,product_label,order_label
 from public.wc_production_units u join public.wc_order_items i on i.id=u.order_item_id
 join public.wc_order_items main on main.id=coalesce(public.wc_cost_main(i.id),i.id)
 join public.wc_orders o on o.id=i.order_id
 where u.id=p_unit and u.production_status in ('New','CNC','Assembly','Sanding','Painting','Packing')
  and btrim(coalesce(i.product_name,'')) !~* '^(delivery|shipping)(\s+(fee|charge))?$'
  and btrim(coalesce(main.product_name,'')) !~* '^(delivery|shipping)(\s+(fee|charge))?$'
  and not coalesce(o.is_hidden,false) and not coalesce(o.archived,false)
  and coalesce(o.fulfillment_status,'')<>'FULFILLED' and coalesce(o.wix_status,'') !~* 'cancel'
 for update of u;
 if product_id is null then raise exception 'Product is unavailable for Packing. Check its link and order status.'; end if;
 select packages,jsonb_array_length(packages) into package_snapshot,box_count from public.wc_delivery_packaging_profiles
 where signature=p_profile and shipping_product_id=product_id for update;
 if box_count is null or box_count=0 then raise exception 'Choose a saved Packing profile for this product'; end if;
 shared_key:=public.wc_backdrop_rd_key(p_profile);
 if shared_key is not null then perform pg_advisory_xact_lock(hashtext(shared_key)); end if;
 use_backdrop:=shared_key is not null and exists(select 1 from public.wc_box_rd_files where backdrop_size_key=shared_key);
 for box_number in 0..box_count-1 loop
  base_id:=public.wc_cart_base_package(p_profile,box_number);
  if base_id is not null then perform pg_advisory_xact_lock(hashtextextended('cart-base-rd:'||base_id::text,0)); end if;
  use_cart:=base_id is not null and exists(select 1 from public.wc_box_rd_files where cart_base_package_id=base_id);
  if not exists(select 1 from public.wc_box_rd_files f where
    (use_backdrop and f.backdrop_size_key=shared_key and box_number=0)
    or (not use_backdrop and use_cart and f.cart_base_package_id=base_id)
    or (not use_backdrop and not use_cart and f.profile_signature=p_profile and f.box_index=box_number)) then
   raise exception 'Box % has no RD files. Add them in the Product Packing tab before sending work',box_number+1;
  end if;
 end loop;
 select jsonb_agg(jsonb_build_object('file_id',f.id,'box_index',p.n-1,
  'box_name',p.box->>'package_name','object_path',f.object_path,'filename',f.filename,
  'size_bytes',f.size_bytes,'copies',f.copies) order by p.n,
   (case when use_backdrop then (select ids.ordinality from jsonb_array_elements_text(
      coalesce((select d.constructor_data->'rd_ids' from public.wc_backdrop_box_svg_drawings d where d.size_key=shared_key),'[]'::jsonb))
      with ordinality ids(value,ordinality) where ids.value=f.id::text) end) nulls last,
   f.created_at,f.id)
 into snapshot
 from public.wc_delivery_packaging_profiles profile
 cross join lateral jsonb_array_elements(profile.packages) with ordinality p(box,n)
 cross join lateral (select public.wc_cart_base_package(profile.signature,(p.n-1)::integer) id) base
 join public.wc_box_rd_files f on
  (use_backdrop and f.backdrop_size_key=shared_key and p.n=1)
  or (not use_backdrop and base.id is not null
      and exists(select 1 from public.wc_box_rd_files shared where shared.cart_base_package_id=base.id)
      and f.cart_base_package_id=base.id)
  or (not use_backdrop and not exists(select 1 from public.wc_box_rd_files shared where shared.cart_base_package_id=base.id)
      and f.profile_signature=profile.signature and f.box_index=p.n-1)
 where profile.signature=p_profile;
 if snapshot is null then raise exception 'Add RD files to every box before sending work'; end if;
 if exists(select 1 from public.wc_packing_tasks where unit_id=p_unit and state<>'cancelled') then
  raise exception 'Packing work was already sent for this product unit';
 end if;
 insert into public.wc_packing_tasks(unit_id,order_number,product_name,profile_signature,assigned_to,assigned_by,files,packages)
 values(p_unit,order_label,product_label,p_profile,null,actor,snapshot,package_snapshot) returning * into result;
 return result;
end $$;
