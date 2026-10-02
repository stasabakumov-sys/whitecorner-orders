-- Cart Base cutting files belong to a reusable physical box of one product and size.
alter table public.wc_box_rd_files add column cart_base_package_id uuid
  references public.wc_shipping_packages(id) on delete restrict;
alter table public.wc_box_rd_files drop constraint wc_box_rd_files_owner_check;
alter table public.wc_box_rd_files add constraint wc_box_rd_files_owner_check check (
  (profile_signature is not null and box_index is not null and backdrop_size_key is null and cart_base_package_id is null)
  or (profile_signature is null and box_index is null and backdrop_size_key ~ '^[1-9][0-9]*x[1-9][0-9]*:(foldable|nonfoldable)$' and cart_base_package_id is null)
  or (profile_signature is null and box_index is null and backdrop_size_key is null and cart_base_package_id is not null)
);
create index wc_box_rd_files_cart_base on public.wc_box_rd_files(cart_base_package_id,created_at);

create function public.wc_cart_base_rd_package_guard()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if exists(select 1 from public.wc_box_rd_files where cart_base_package_id=old.id)
  and (old.shipping_product_id is distinct from new.shipping_product_id
   or old.size_key is distinct from new.size_key or old.source_type is distinct from new.source_type
   or old.package_name is distinct from new.package_name
   or old.length_mm is distinct from new.length_mm or old.width_mm is distinct from new.width_mm
   or old.height_mm is distinct from new.height_mm) then
  raise exception 'This Cart Base box has shared RD files. Remove them before changing its name, size or dimensions.';
 end if;
 return new;
end $$;
revoke all on function public.wc_cart_base_rd_package_guard() from public,anon,authenticated;
create trigger wc_cart_base_rd_package_guard before update on public.wc_shipping_packages
 for each row execute function public.wc_cart_base_rd_package_guard();

-- A saved profile box is a reusable Base box only when its product, size,
-- name, dimensions and main-product contents match exactly one Base template.
create function public.wc_cart_base_package(p_signature text,p_index integer)
returns uuid language plpgsql stable security definer set search_path=public,pg_temp as $$
declare profile public.wc_delivery_packaging_profiles; box jsonb; size text; result uuid;
begin
 select * into profile from public.wc_delivery_packaging_profiles where signature=p_signature;
 if not found or p_index is null or p_index<0 or p_index>=jsonb_array_length(profile.packages)
    or profile.template_item->>'profile_scope'='cart-main'
    or not exists(select 1 from public.wc_shipping_products p where p.id=profile.shipping_product_id and p.product_type='Cart') then return null; end if;
 box:=profile.packages->p_index;
 if jsonb_typeof(box->'contents')<>'array' or jsonb_array_length(box->'contents')=0
    or exists(select 1 from jsonb_array_elements(box->'contents') c where coalesce(c->>'component_key','main')<>'main') then return null; end if;
 size:=public.wc_cart_size_key(profile.template_item->'wix_options');
 if size='' then
  select case when count(distinct coalesce(size_key,''))=1 then min(coalesce(size_key,'')) end into size
  from public.wc_shipping_packages where shipping_product_id=profile.shipping_product_id and source_type='Base' and active;
 end if;
 if size is null then return null; end if;
 select case when count(*)=1 then (array_agg(id))[1] end into result
 from public.wc_shipping_packages p
 where p.shipping_product_id=profile.shipping_product_id and p.source_type='Base' and p.active
   and coalesce(p.size_key,'')=size
   and lower(btrim(p.package_name))=lower(btrim(box->>'package_name'))
   and p.length_mm=(box->>'length_mm')::numeric
   and p.width_mm=(box->>'width_mm')::numeric
   and p.height_mm=(box->>'height_mm')::numeric;
 return result;
exception when invalid_text_representation then return null;
end $$;
revoke all on function public.wc_cart_base_package(text,integer) from public,anon;
grant execute on function public.wc_cart_base_package(text,integer) to authenticated;

-- Keep conflicting old sets profile-local for manager review. Existing task
-- snapshots continue to reference the same file IDs after an unambiguous move.
alter table public.wc_box_rd_files disable trigger wc_box_rd_manager_guard;
alter table public.wc_box_rd_files disable trigger wc_box_rd_active_guard;
with sources as (
 select f.id,f.profile_signature,f.box_index,f.filename,
        public.wc_cart_base_package(f.profile_signature,f.box_index) package_id
 from public.wc_box_rd_files f where f.profile_signature is not null
), unambiguous as (
 select package_id from sources where package_id is not null group by package_id
 having count(distinct (profile_signature,box_index))=1
    and count(*)=count(distinct lower(filename))
)
update public.wc_box_rd_files f set cart_base_package_id=s.package_id,
 profile_signature=null,box_index=null
from sources s join unambiguous u on u.package_id=s.package_id where f.id=s.id;
alter table public.wc_box_rd_files enable trigger wc_box_rd_active_guard;
alter table public.wc_box_rd_files enable trigger wc_box_rd_manager_guard;

create function public.wc_save_cart_base_rd_file(
 p_id uuid,p_signature text,p_index integer,p_path text,p_filename text,
 p_bytes integer,p_copies integer,p_expected uuid
) returns public.wc_box_rd_files language plpgsql security definer set search_path=public,pg_temp as $$
declare package_id uuid; previous public.wc_box_rd_files; result public.wc_box_rd_files;
begin
 if not public.wc_is_hub_manager() then raise exception 'Manager access required'; end if;
 perform 1 from public.wc_delivery_packaging_profiles where signature=p_signature for update;
 package_id:=public.wc_cart_base_package(p_signature,p_index);
 if package_id is null then raise exception 'This Cart box no longer matches a reusable Base box. Reload the product.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('cart-base-rd:'||package_id::text,0));
 if p_copies is null or p_copies<1 or p_copies>1000 then raise exception 'Enter a copy count from 1 to 1000.'; end if;
 if p_id is not null then
  select * into previous from public.wc_box_rd_files where id=p_id for update;
  if not found or previous.cart_base_package_id is distinct from package_id or previous.revision is distinct from p_expected then
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
  if exists(select 1 from public.wc_box_rd_files where cart_base_package_id=package_id
    and lower(filename)=lower(p_filename) and id is distinct from p_id) then
   raise exception 'An RD file with this name already exists for this Cart Base box. Replace that file instead.';
  end if;
  if p_id is null then
   insert into public.wc_box_rd_files(cart_base_package_id,object_path,filename,size_bytes,copies)
   values(package_id,p_path,p_filename,p_bytes,p_copies) returning * into result;
  else
   update public.wc_box_rd_files set object_path=p_path,filename=p_filename,size_bytes=p_bytes,
    copies=p_copies,revision=gen_random_uuid(),updated_at=now()
   where id=p_id returning * into result;
  end if;
 end if;
 return result;
end $$;
revoke all on function public.wc_save_cart_base_rd_file(uuid,text,integer,text,text,integer,integer,uuid) from public,anon;
grant execute on function public.wc_save_cart_base_rd_file(uuid,text,integer,text,text,integer,integer,uuid) to authenticated;

create function public.wc_promote_cart_base_rd(p_signature text,p_index integer)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare package_id uuid; files_count integer;
begin
 if not public.wc_is_hub_manager() then raise exception 'Manager access required'; end if;
 perform 1 from public.wc_delivery_packaging_profiles where signature=p_signature for update;
 package_id:=public.wc_cart_base_package(p_signature,p_index);
 if package_id is null then raise exception 'This Cart box does not match a reusable Base box.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('cart-base-rd:'||package_id::text,0));
 if exists(select 1 from public.wc_box_rd_files where cart_base_package_id=package_id) then
  raise exception 'Shared RD files already exist for this Cart Base box. Review them before changing the source.';
 end if;
 select count(*) into files_count from public.wc_box_rd_files where profile_signature=p_signature and box_index=p_index;
 if files_count=0 then raise exception 'This box has no RD files to share.'; end if;
 if files_count<>(select count(distinct lower(filename)) from public.wc_box_rd_files
  where profile_signature=p_signature and box_index=p_index) then
  raise exception 'Two RD files have the same name. Rename one before sharing this set.';
 end if;
 update public.wc_box_rd_files set profile_signature=null,box_index=null,
  cart_base_package_id=package_id,revision=gen_random_uuid(),updated_at=now()
 where profile_signature=p_signature and box_index=p_index;
 return package_id;
end $$;
revoke all on function public.wc_promote_cart_base_rd(text,integer) from public,anon;
grant execute on function public.wc_promote_cart_base_rd(text,integer) to authenticated;

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
  'size_bytes',f.size_bytes,'copies',f.copies) order by p.n,f.created_at,f.id)
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
