-- All Backdrops: exact metric size + folding; Painted/Raw share files. Model weights stay separate.
-- Editing shared geometry must not silently reuse cutting files for the old box.
create or replace function public.wc_save_backdrop_packaging_dimensions(
 p_size text,p_package_name text,p_length numeric,p_width numeric,p_height numeric,p_expected uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare previous wc_backdrop_packaging_dimensions; result wc_backdrop_packaging_dimensions;
begin
 if not public.wc_is_hub_manager() then raise exception 'Manager access required';end if;
 if p_size is null or p_size !~ '^[1-9][0-9]{0,4}x[1-9][0-9]{0,4}:(foldable|nonfoldable)$' then raise exception 'Exact Backdrop size and folding option are required';end if;
 if nullif(trim(p_package_name),'') is null or length(trim(p_package_name))>150 or p_length is null or p_width is null or p_height is null or p_length<=0 or p_width<=0 or p_height<=0 then raise exception 'Complete the package name and positive dimensions';end if;
 perform pg_advisory_xact_lock(hashtext(p_size));
 perform pg_advisory_xact_lock(hashtextextended('backdrop-packaging-dimensions:'||p_size,0));
 select * into previous from wc_backdrop_packaging_dimensions where size_key=p_size for update;
 if previous.size_key is not null and previous.package_name=trim(p_package_name) and previous.length_mm=p_length and previous.width_mm=p_width and previous.height_mm=p_height then return to_jsonb(previous);end if;
 if previous.revision is distinct from p_expected then raise exception 'Backdrop dimensions changed. Reload before saving.';end if;
 if previous.size_key is not null and exists(select 1 from wc_box_rd_files where backdrop_size_key=p_size) then
  raise exception 'Remove the existing RD files in the RD editor before changing the box name or dimensions. Active cutting work must be completed or cancelled first. Drawings are kept.';
 end if;
 insert into wc_backdrop_packaging_dimensions(size_key,package_name,length_mm,width_mm,height_mm,created_by)
 values(p_size,trim(p_package_name),p_length,p_width,p_height,auth.uid())
 on conflict(size_key) do update set package_name=excluded.package_name,length_mm=excluded.length_mm,width_mm=excluded.width_mm,height_mm=excluded.height_mm,revision=gen_random_uuid(),updated_at=now()
 returning * into result;
 return to_jsonb(result);
end $$;

create table public.wc_backdrop_box_svg_drawings (
 size_key text primary key references public.wc_backdrop_packaging_dimensions(size_key) on delete restrict,
 box_snapshot jsonb not null check(jsonb_typeof(box_snapshot)='object'),
 constructor_data jsonb not null check(jsonb_typeof(constructor_data)='object'),
 object_path text not null unique,
 filename text not null check(length(filename) between 5 and 255 and lower(filename) like '%.svg'),
 size_bytes integer not null check(size_bytes between 1 and 20971520),
 revision uuid not null default gen_random_uuid(),
 updated_at timestamptz not null default now()
);
alter table public.wc_backdrop_box_svg_drawings enable row level security;
revoke all on public.wc_backdrop_box_svg_drawings from public,anon,authenticated;
grant select on public.wc_backdrop_box_svg_drawings to authenticated;
create policy backdrop_svg_read on public.wc_backdrop_box_svg_drawings for select to authenticated
 using(public.wc_is_active_hub_member());
create policy backdrop_svg_cleanup_guard on storage.objects as restrictive for delete to authenticated
 using(bucket_id<>'box-drawings' or not exists(select 1 from public.wc_backdrop_box_svg_drawings d where d.object_path=name));

-- Same request can recover a committed save after a lost network response.
create table public.wc_backdrop_constructor_saves (
 request_id uuid primary key,
 size_key text not null references public.wc_backdrop_packaging_dimensions(size_key) on delete restrict,
 payload jsonb not null,
 result jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.wc_backdrop_constructor_saves enable row level security;
revoke all on public.wc_backdrop_constructor_saves from public,anon,authenticated;

create function public.wc_save_backdrop_constructor_files(
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
