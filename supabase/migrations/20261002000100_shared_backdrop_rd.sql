-- Backdrop cutting files belong to the physical box size and folding option,
-- just like the shared Backdrop CDR drawing and package dimensions.
alter table public.wc_box_rd_files
  alter column profile_signature drop not null,
  alter column box_index drop not null,
  add column backdrop_size_key text;
alter table public.wc_box_rd_files add constraint wc_box_rd_files_owner_check
  check ((profile_signature is not null and box_index is not null and backdrop_size_key is null)
      or (profile_signature is null and box_index is null and backdrop_size_key ~ '^[1-9][0-9]*x[1-9][0-9]*:(foldable|nonfoldable)$'));
create index wc_box_rd_files_backdrop_size on public.wc_box_rd_files(backdrop_size_key,created_at);

-- Only an exact metric size and explicit folding choice may share cutting files.
create function public.wc_backdrop_rd_key(p_signature text)
returns text language plpgsql stable set search_path=public,pg_temp as $$
declare profile public.wc_delivery_packaging_profiles; kind text; label text;
 options jsonb; content jsonb; item_key jsonb; option_text text;
 size_text text:=''; fold_text text:=''; parts text[]; width_mm numeric; height_mm numeric; fold text; stored_key text;
begin
 select p.* into profile
 from public.wc_delivery_packaging_profiles p
 where p.signature=p_signature;
 if not found then return null; end if;
 select s.product_type,s.product_name into kind,label from public.wc_shipping_products s
 where s.id=profile.shipping_product_id;
 if not found or jsonb_array_length(profile.packages)<>1
    or (lower(coalesce(kind,''))<>'backdrop' and coalesce(label,'') !~* 'backdrop') then return null; end if;
 stored_key:=profile.packages->0->>'backdrop_size_key';
 if stored_key ~ '^[1-9][0-9]*x[1-9][0-9]*:(foldable|nonfoldable)$' then return stored_key; end if;
 options:=coalesce(profile.template_item->'wix_options','{}'::jsonb);
 select entry.value into size_text from jsonb_each_text(options) entry where lower(entry.key) in ('size','dimension','dimensions') limit 1;
 select entry.value into fold_text from jsonb_each_text(options) entry where lower(entry.key)='foldable' limit 1;
 if coalesce(size_text,'')='' or coalesce(fold_text,'')='' then
  for content in select value from jsonb_array_elements(coalesce(profile.packages->0->'contents','[]'::jsonb)) loop
   begin
    item_key:=regexp_replace(content->>'profile_item_key',':[0-9]+$','')::jsonb;
    for option_text in select value from jsonb_array_elements_text(item_key->1) loop
     if coalesce(size_text,'')='' and option_text ~* '^size ' then size_text:=substring(option_text from 6); end if;
     if coalesce(fold_text,'')='' and option_text ~* '^foldable ' then fold_text:=substring(option_text from 10); end if;
    end loop;
   exception when others then null;
   end;
  end loop;
 end if;
 parts:=regexp_match(lower(btrim(coalesce(size_text,''))),
  '^(\d+(?:\.\d+)?)\s*(mm|cm|m)?\s*[x×]\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)$');
 if parts is null then return null; end if;
 width_mm:=parts[1]::numeric * case coalesce(parts[2],parts[4]) when 'm' then 1000 when 'cm' then 10 else 1 end;
 height_mm:=parts[3]::numeric * case parts[4] when 'm' then 1000 when 'cm' then 10 else 1 end;
 if width_mm<>trunc(width_mm) or height_mm<>trunc(height_mm)
    or width_mm<=0 or height_mm<=0 or width_mm>10000 or height_mm>10000 then return null; end if;
 fold:=regexp_replace(lower(coalesce(fold_text,'')),'[\s_-]','','g');
 if fold in ('yes','true','foldable') then fold:='foldable';
 elsif fold in ('no','false','nonfoldable','unfoldable') then fold:='nonfoldable';
 else return null; end if;
 return greatest(width_mm,height_mm)::integer||'x'||least(width_mm,height_mm)::integer||':'||fold;
end $$;
revoke all on function public.wc_backdrop_rd_key(text) from public,anon,authenticated;

-- Promote existing profile files only when one source profile owns the key.
-- Ambiguous old sets remain profile-local for review, without discarding files.
alter table public.wc_box_rd_files disable trigger wc_box_rd_manager_guard;
alter table public.wc_box_rd_files disable trigger wc_box_rd_active_guard;
with sources as (
 select f.id,f.profile_signature,f.filename,public.wc_backdrop_rd_key(f.profile_signature) size_key
 from public.wc_box_rd_files f where f.profile_signature is not null
), unambiguous as (
 select size_key from sources where size_key is not null group by size_key
 having count(distinct profile_signature)=1
    and count(*)=count(distinct lower(filename))
)
update public.wc_box_rd_files f
set backdrop_size_key=s.size_key,profile_signature=null,box_index=null
from sources s join unambiguous u on u.size_key=s.size_key where f.id=s.id;
alter table public.wc_box_rd_files enable trigger wc_box_rd_active_guard;
alter table public.wc_box_rd_files enable trigger wc_box_rd_manager_guard;

create function public.wc_save_backdrop_rd_file(
 p_id uuid,p_size text,p_path text,p_filename text,p_bytes integer,p_copies integer,p_expected uuid
) returns public.wc_box_rd_files language plpgsql security definer set search_path=public,pg_temp as $$
declare previous public.wc_box_rd_files; result public.wc_box_rd_files;
begin
 if not public.wc_is_hub_manager() then raise exception 'Manager access required'; end if;
 if p_size is null or p_size !~ '^[1-9][0-9]*x[1-9][0-9]*:(foldable|nonfoldable)$' then
  raise exception 'Choose an exact Backdrop size and folding option.';
 end if;
 perform pg_advisory_xact_lock(hashtext(p_size));
 if p_copies is null or p_copies<1 or p_copies>1000 then raise exception 'Enter a copy count from 1 to 1000.'; end if;
 if p_id is not null then
  select * into previous from public.wc_box_rd_files where id=p_id for update;
  if not found or previous.backdrop_size_key is distinct from p_size or previous.revision is distinct from p_expected then
   raise exception 'RD file changed. Reload before saving.';
  end if;
 end if;
 if p_path is null then
  if p_id is null then raise exception 'Choose an RD file before saving.'; end if;
  update public.wc_box_rd_files set copies=p_copies,revision=gen_random_uuid(),updated_at=now()
  where id=p_id returning * into result;
 else
  if p_filename is null or length(p_filename) not between 4 and 255 or lower(p_filename) not like '%.rd'
   or p_bytes is null or p_bytes not between 1 and 20971520
   or split_part(p_path,'/',1)<>auth.uid()::text
   or not exists(select 1 from storage.objects where bucket_id='box-rd-files' and name=p_path
      and (metadata->>'size')::bigint=p_bytes) then
   raise exception 'RD upload is missing or invalid. Choose the file again.';
  end if;
  if exists(select 1 from public.wc_box_rd_files where backdrop_size_key=p_size
    and lower(filename)=lower(p_filename) and id is distinct from p_id) then
   raise exception 'An RD file with this name already exists for this Backdrop size. Replace that file instead.';
  end if;
  if p_id is null then
   insert into public.wc_box_rd_files(backdrop_size_key,object_path,filename,size_bytes,copies)
   values(p_size,p_path,p_filename,p_bytes,p_copies) returning * into result;
  else
   update public.wc_box_rd_files set object_path=p_path,filename=p_filename,size_bytes=p_bytes,
    copies=p_copies,revision=gen_random_uuid(),updated_at=now()
   where id=p_id returning * into result;
  end if;
 end if;
 return result;
end $$;
revoke all on function public.wc_save_backdrop_rd_file(uuid,text,text,text,integer,integer,uuid) from public,anon;
grant execute on function public.wc_save_backdrop_rd_file(uuid,text,text,text,integer,integer,uuid) to authenticated;

-- When several old profiles have files for one key, a manager chooses the
-- source set explicitly. Existing task snapshots keep their file IDs.
create function public.wc_promote_backdrop_rd(p_signature text)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare shared_key text; files_count integer;
begin
 if not public.wc_is_hub_manager() then raise exception 'Manager access required'; end if;
 perform 1 from public.wc_delivery_packaging_profiles where signature=p_signature for update;
 if not found then raise exception 'Packing profile was not found. Reload and retry.'; end if;
 shared_key:=public.wc_backdrop_rd_key(p_signature);
 if shared_key is null then raise exception 'This profile has no exact Backdrop size and folding option.'; end if;
 perform pg_advisory_xact_lock(hashtext(shared_key));
 if exists(select 1 from public.wc_box_rd_files where backdrop_size_key=shared_key) then
  raise exception 'Shared RD files already exist for this Backdrop size. Review them before changing the source.';
 end if;
 select count(*) into files_count from public.wc_box_rd_files
 where profile_signature=p_signature and box_index=0;
 if files_count=0 then raise exception 'This profile has no RD files to share.'; end if;
 if files_count<>(select count(distinct lower(filename)) from public.wc_box_rd_files
  where profile_signature=p_signature and box_index=0) then
  raise exception 'Two RD files have the same name. Rename one before sharing this set.';
 end if;
 update public.wc_box_rd_files set profile_signature=null,box_index=null,
  backdrop_size_key=shared_key,revision=gen_random_uuid(),updated_at=now()
 where profile_signature=p_signature and box_index=0;
 return shared_key;
end $$;
revoke all on function public.wc_promote_backdrop_rd(text) from public,anon;
grant execute on function public.wc_promote_backdrop_rd(text) to authenticated;

create or replace function public.wc_send_packing_task(p_unit uuid,p_profile text)
returns public.wc_packing_tasks language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); product_id uuid; product_label text; order_label text;
 box_count integer; box_number integer; snapshot jsonb; package_snapshot jsonb; result public.wc_packing_tasks;
 shared_key text; use_shared boolean;
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
 use_shared:=shared_key is not null and exists(select 1 from public.wc_box_rd_files where backdrop_size_key=shared_key);
 for box_number in 0..box_count-1 loop
  if not exists(select 1 from public.wc_box_rd_files f where
    (use_shared and f.backdrop_size_key=shared_key and box_number=0)
    or (not use_shared and f.profile_signature=p_profile and f.box_index=box_number)) then
   raise exception 'Box % has no RD files. Add them in the Product Packing tab before sending work',box_number+1;
  end if;
 end loop;
 select jsonb_agg(jsonb_build_object('file_id',f.id,'box_index',p.n-1,
  'box_name',p.box->>'package_name','object_path',f.object_path,'filename',f.filename,
  'size_bytes',f.size_bytes,'copies',f.copies) order by p.n,f.created_at,f.id)
 into snapshot
 from public.wc_delivery_packaging_profiles profile
 cross join lateral jsonb_array_elements(profile.packages) with ordinality p(box,n)
 join public.wc_box_rd_files f on
  (use_shared and f.backdrop_size_key=shared_key and p.n=1)
  or (not use_shared and f.profile_signature=profile.signature and f.box_index=p.n-1)
 where profile.signature=p_profile;
 if snapshot is null then raise exception 'Add RD files to every box before sending work'; end if;
 if exists(select 1 from public.wc_packing_tasks where unit_id=p_unit and state<>'cancelled') then
  raise exception 'Packing work was already sent for this product unit';
 end if;
 insert into public.wc_packing_tasks(unit_id,order_number,product_name,profile_signature,assigned_to,assigned_by,files,packages)
 values(p_unit,order_label,product_label,p_profile,null,actor,snapshot,package_snapshot) returning * into result;
 return result;
end $$;
revoke all on function public.wc_send_packing_task(uuid,text) from public,anon;
grant execute on function public.wc_send_packing_task(uuid,text) to authenticated;
