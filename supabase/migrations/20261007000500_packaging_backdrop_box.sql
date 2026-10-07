-- Extend saved packaging constructors to the four-piece Backdrop box.
-- Pure canonical geometry; called only by the existing manager-only save RPCs.
create function public.wc_backdrop_constructor_geometry(p_box jsonb)
returns jsonb language plpgsql immutable set search_path=public,pg_temp as $$
declare l numeric:=(p_box->>'length_mm')::numeric-15;
 w numeric:=(p_box->>'width_mm')::numeric-15; d numeric:=(p_box->>'height_mm')::numeric;
 rim numeric; max_panel numeric; main_panel numeric;
begin
 if l is null or w is null or d is null or l<=0 or w<=0 or d<=0
  or l::text in ('NaN','Infinity','-Infinity') or w::text in ('NaN','Infinity','-Infinity') or d::text in ('NaN','Infinity','-Infinity')
 then raise exception 'Use positive Backdrop box dimensions, with L/W greater than 15 mm';end if;
 rim:=least(d,(1170-(w+10))/2);
 if rim<=0 then raise exception 'Backdrop box leaves no border on the 1170 x 1170 mm cardboard sheet';end if;
 max_panel:=990-rim;
 if l+10>2*max_panel then raise exception 'Backdrop box cannot fit the 1300 x 990 mm laser field in two parts';end if;
 main_panel:=least(max_panel,greatest(greatest(l/2,l-129),l+10-max_panel));
 if main_panel>=l then raise exception 'Backdrop box cannot fit the laser field; reduce height';end if;
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
 file_count:=case when box_type='backdrop' then 4 when box_type='small' then 1 else 2 end;
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
 file_count:=case when box_type='backdrop' then 4 when box_type='small' then 1 else 2 end;
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
