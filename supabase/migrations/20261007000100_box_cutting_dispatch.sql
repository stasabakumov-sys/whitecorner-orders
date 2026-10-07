-- A saved packaging box can be cut independently of an order or custom job.
-- Keep original RD IDs so replacement updates unfinished work as usual.
alter table public.wc_packing_tasks add column box_rd_source_key text;
alter table public.wc_packing_tasks drop constraint wc_packing_task_source;
alter table public.wc_packing_tasks add constraint wc_packing_task_source check (
 (unit_id is not null and custom_job_id is null and profile_signature is not null and box_rd_source_key is null)
 or (unit_id is null and custom_job_id is not null and profile_signature is null and box_rd_source_key is null)
 or (unit_id is null and custom_job_id is null and box_rd_source_key is not null)
);
create unique index wc_packing_active_box_rd on public.wc_packing_tasks(box_rd_source_key)
 where state not in ('cancelled','completed') and box_rd_source_key is not null;

create function public.wc_send_box_cutting_task(p_files jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare source public.wc_box_rd_files; profile public.wc_delivery_packaging_profiles;
 box jsonb; label text; source_key text; snapshot jsonb; expected jsonb; actual jsonb;
 result public.wc_packing_tasks;
begin
 if not public.wc_is_hub_manager() then raise exception 'Manager access required'; end if;
 if jsonb_typeof(p_files) is distinct from 'array' or jsonb_array_length(p_files)=0 then
  raise exception 'Add and save RD files before sending this box to Cutting work.';
 end if;
 select * into source from public.wc_box_rd_files where id=(p_files->0->>'id')::uuid;
 if not found then raise exception 'RD files changed. Reload this box and retry.'; end if;
 if source.cart_base_package_id is not null then
  select jsonb_build_object('package_name',p.package_name,'length_mm',p.length_mm,
   'width_mm',p.width_mm,'height_mm',p.height_mm,'cutting_cart_package_id',p.id),product.product_name
  into box,label from public.wc_shipping_packages p
  join public.wc_shipping_products product on product.id=p.shipping_product_id
  where p.id=source.cart_base_package_id and p.active and product.product_type='Cart'
   and (p.source_type='Base' or p.shipping_rule_id is not null) for update of p;
  if not found then raise exception 'This reusable Cart box is unavailable. Reload the product.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('cart-base-rd:'||source.cart_base_package_id::text,0));
  source_key:='cart:'||source.cart_base_package_id::text;
 elsif source.backdrop_size_key is not null then
  perform pg_advisory_xact_lock(hashtext(source.backdrop_size_key));
  select jsonb_build_object('package_name',d.package_name,'length_mm',d.length_mm,
   'width_mm',d.width_mm,'height_mm',d.height_mm,'cutting_size_key',source.backdrop_size_key)
  into box from public.wc_backdrop_packaging_dimensions d where size_key=source.backdrop_size_key for share;
  if not found then raise exception 'Save packaging dimensions for this Backdrop size before sending work.'; end if;
  label:='Backdrop · '||source.backdrop_size_key;
  source_key:='backdrop:'||source.backdrop_size_key;
 else
  select * into profile from public.wc_delivery_packaging_profiles where signature=source.profile_signature for update;
  if not found or source.box_index<0 or source.box_index>=jsonb_array_length(profile.packages) then
   raise exception 'Packaging box changed. Reload the product.';
  end if;
  box:=(profile.packages->source.box_index)||jsonb_build_object('cutting_source_index',source.box_index,
   'cutting_source_box',profile.packages->source.box_index);
  select product_name into label from public.wc_shipping_products where id=profile.shipping_product_id;
  source_key:='profile:'||source.profile_signature||':'||source.box_index::text;
 end if;
 -- Serialize retries even if the first successful response was lost.
 perform pg_advisory_xact_lock(hashtextextended('box-cutting:'||source_key,0));
 perform 1 from public.wc_box_rd_files f where
  (source.cart_base_package_id is not null and f.cart_base_package_id=source.cart_base_package_id)
  or (source.backdrop_size_key is not null and f.backdrop_size_key=source.backdrop_size_key)
  or (source.profile_signature is not null and f.profile_signature=source.profile_signature and f.box_index=source.box_index)
  order by f.id for update;
 select jsonb_agg(jsonb_build_object('id',f.id,'revision',f.revision,'copies',f.copies) order by f.id),
  jsonb_agg(jsonb_build_object('file_id',f.id,'box_index',0,'box_name',box->>'package_name',
   'object_path',f.object_path,'filename',f.filename,'size_bytes',f.size_bytes,'copies',f.copies) order by f.created_at,f.id)
 into actual,snapshot from public.wc_box_rd_files f where
  (source.cart_base_package_id is not null and f.cart_base_package_id=source.cart_base_package_id)
  or (source.backdrop_size_key is not null and f.backdrop_size_key=source.backdrop_size_key)
  or (source.profile_signature is not null and f.profile_signature=source.profile_signature and f.box_index=source.box_index);
 select jsonb_agg(jsonb_build_object('id',(entry->>'id')::uuid,'revision',(entry->>'revision')::uuid,
  'copies',(entry->>'copies')::integer) order by (entry->>'id')::uuid) into expected from jsonb_array_elements(p_files) entry;
 if actual is null or actual is distinct from expected then
  raise exception 'RD files or copies changed. Save copy changes, reload this box and review the files before sending.';
 end if;
 select * into result from public.wc_packing_tasks where box_rd_source_key=source_key
  and state not in ('cancelled','completed') for update;
 if found then return jsonb_build_object('task',result,'created',false); end if;
 if exists(select 1 from jsonb_array_elements(snapshot) f where not exists(
  select 1 from storage.objects o where o.bucket_id='box-rd-files' and o.name=f->>'object_path'
   and (o.metadata->>'size')::bigint=(f->>'size_bytes')::bigint)) then
  raise exception 'An RD file is unavailable. Reopen this box and replace the missing file before sending.';
 end if;
 insert into public.wc_packing_tasks(unit_id,custom_job_id,profile_signature,box_rd_source_key,
  order_number,product_name,assigned_to,assigned_by,files,packages)
 values(null,null,source.profile_signature,source_key,'',coalesce(nullif(label,''),'Packaging box'),
  null,auth.uid(),snapshot,jsonb_build_array(box)) returning * into result;
 return jsonb_build_object('task',result,'created',true);
end $$;
revoke all on function public.wc_send_box_cutting_task(jsonb) from public,anon;
grant execute on function public.wc_send_box_cutting_task(jsonb) to authenticated;
