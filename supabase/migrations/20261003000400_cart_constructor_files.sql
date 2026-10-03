-- Generated Cart SVG references remain separate from existing CDR sources.
update storage.buckets set allowed_mime_types=array_append(allowed_mime_types,'image/svg+xml')
 where id='box-drawings' and allowed_mime_types is not null and not ('image/svg+xml'=any(allowed_mime_types));
create table public.wc_cart_box_svg_drawings (
 cart_base_package_id uuid primary key references public.wc_shipping_packages(id) on delete restrict,
 box_snapshot jsonb not null check(jsonb_typeof(box_snapshot)='object'),
 constructor_data jsonb not null check(jsonb_typeof(constructor_data)='object'),
 object_path text not null unique,
 filename text not null check(length(filename) between 5 and 255 and lower(filename) like '%.svg'),
 size_bytes integer not null check(size_bytes between 1 and 20971520),
 revision uuid not null default gen_random_uuid(),
 updated_at timestamptz not null default now()
);
alter table public.wc_cart_box_svg_drawings enable row level security;
revoke all on public.wc_cart_box_svg_drawings from public,anon,authenticated;
grant select on public.wc_cart_box_svg_drawings to authenticated;
create policy cart_svg_read on public.wc_cart_box_svg_drawings for select to authenticated
 using(public.wc_is_active_hub_member());
create policy cart_svg_cleanup_guard on storage.objects as restrictive for delete to authenticated
 using(bucket_id<>'box-drawings' or not exists(select 1 from public.wc_cart_box_svg_drawings d where d.object_path=name));

-- Same request can recover a committed save after a lost network response.
create table public.wc_cart_constructor_saves (
 request_id uuid primary key,
 cart_base_package_id uuid not null references public.wc_shipping_packages(id) on delete restrict,
 payload jsonb not null,
 result jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.wc_cart_constructor_saves enable row level security;
revoke all on public.wc_cart_constructor_saves from public,anon,authenticated;

create function public.wc_save_cart_constructor_files(
 p_request uuid,p_package uuid,p_box jsonb,p_constructor jsonb,p_svg jsonb,p_rd_files jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare current_box jsonb; previous public.wc_cart_box_svg_drawings; drawing public.wc_cart_box_svg_drawings;
 receipt public.wc_cart_constructor_saves; payload jsonb; entry jsonb; saved public.wc_box_rd_files;
 rd_result jsonb:='[]'; rd_ids jsonb:='[]'; existing_ids uuid[]; requested_ids uuid[]; result jsonb;
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
 if jsonb_typeof(p_constructor) is distinct from 'object' or jsonb_typeof(p_constructor->'bottom') is distinct from 'object'
  or jsonb_typeof(p_constructor->'lid') is distinct from 'object' then raise exception 'Constructor dimensions are missing'; end if;
 -- Match SVG's six decimal places without JavaScript subtraction noise.
 if (p_constructor->'bottom') is distinct from jsonb_build_object('length',round((current_box->>'length_mm')::numeric-15,6),'width',round((current_box->>'width_mm')::numeric-15,6),'depth',(current_box->>'height_mm')::numeric)
  or (p_constructor->'lid') is distinct from jsonb_build_object('length',round((current_box->>'length_mm')::numeric-5,6),'width',round((current_box->>'width_mm')::numeric-5,6),'depth',(current_box->>'height_mm')::numeric)
  or current_box->>'length_mm' is null or current_box->>'width_mm' is null or current_box->>'height_mm' is null
  or (current_box->>'length_mm')::numeric<=15 or (current_box->>'width_mm')::numeric<=15 or (current_box->>'height_mm')::numeric<=0
 then raise exception 'Use Cart dimensions: bottom L/W minus 15 mm, lid L/W minus 5 mm, unchanged height.'; end if;
 if jsonb_typeof(p_rd_files) is distinct from 'array' or jsonb_array_length(p_rd_files)<>2 then raise exception 'Prepare exactly two RD files'; end if;
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
 if existing_ids is distinct from requested_ids then raise exception 'RD set changed. Reopen Constructor and select the existing bottom and lid files to replace.'; end if;
 if (p_rd_files->0->>'filename') is not distinct from (p_rd_files->1->>'filename')
  or (p_rd_files->0->>'path') is not distinct from (p_rd_files->1->>'path') then raise exception 'Bottom and lid must be separate RD files'; end if;
 for entry in select value from jsonb_array_elements(p_rd_files) loop
  saved:=wc_save_cart_base_rd_file_for_package((entry->>'id')::uuid,p_package,entry->>'path',entry->>'filename',
    (entry->>'bytes')::integer,2,(entry->>'expected')::uuid);
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
