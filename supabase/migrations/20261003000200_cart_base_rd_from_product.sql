-- Manage shared Cart Base RD files directly from the reusable box in Products.
create function public.wc_save_cart_base_rd_file_for_package(
 p_id uuid,p_package uuid,p_path text,p_filename text,
 p_bytes integer,p_copies integer,p_expected uuid
) returns public.wc_box_rd_files language plpgsql security definer set search_path=public,pg_temp as $$
declare previous public.wc_box_rd_files; result public.wc_box_rd_files;
begin
 if not public.wc_is_hub_manager() then raise exception 'Manager access required'; end if;
 perform 1 from public.wc_shipping_packages p join public.wc_shipping_products product on product.id=p.shipping_product_id
  where p.id=p_package and p.active and p.source_type='Base' and product.product_type='Cart'
  for update of p;
 if not found then raise exception 'This reusable Cart Base box is unavailable. Reload the product.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('cart-base-rd:'||p_package::text,0));
 if p_copies is null or p_copies<1 or p_copies>1000 then raise exception 'Enter a copy count from 1 to 1000.'; end if;
 if p_id is not null then
  select * into previous from public.wc_box_rd_files where id=p_id for update;
  if not found or previous.cart_base_package_id is distinct from p_package or previous.revision is distinct from p_expected then
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
  if exists(select 1 from public.wc_box_rd_files where cart_base_package_id=p_package
   and lower(filename)=lower(p_filename) and id is distinct from p_id) then
   raise exception 'An RD file with this name already exists for this Cart Base box. Replace that file instead.';
  end if;
  if p_id is null then
   insert into public.wc_box_rd_files(cart_base_package_id,object_path,filename,size_bytes,copies)
    values(p_package,p_path,p_filename,p_bytes,p_copies) returning * into result;
  else
   update public.wc_box_rd_files set object_path=p_path,filename=p_filename,size_bytes=p_bytes,
    copies=p_copies,revision=gen_random_uuid(),updated_at=now()
    where id=p_id returning * into result;
  end if;
 end if;
 return result;
end $$;
revoke all on function public.wc_save_cart_base_rd_file_for_package(uuid,uuid,text,text,integer,integer,uuid) from public,anon;
grant execute on function public.wc_save_cart_base_rd_file_for_package(uuid,uuid,text,text,integer,integer,uuid) to authenticated;

-- Packaging source drawings use the same reusable Base box identity.
create table public.wc_cart_base_box_drawings (
 cart_base_package_id uuid primary key references public.wc_shipping_packages(id) on delete restrict,
 box_snapshot jsonb not null check(jsonb_typeof(box_snapshot)='object'),
 object_path text not null unique,
 filename text not null check(length(filename) between 1 and 255),
 size_bytes integer not null check(size_bytes between 1 and 20971520),
 revision uuid not null default gen_random_uuid(),
 updated_at timestamptz not null default now()
);
alter table public.wc_cart_base_box_drawings enable row level security;
revoke all on public.wc_cart_base_box_drawings from public,anon,authenticated;
grant select on public.wc_cart_base_box_drawings to authenticated;
create policy cart_base_drawings_read on public.wc_cart_base_box_drawings for select to authenticated
 using(public.wc_is_active_hub_member());
create policy cart_base_drawings_cleanup_guard on storage.objects as restrictive for delete to authenticated
 using(bucket_id<>'box-drawings' or not exists(select 1 from public.wc_cart_base_box_drawings d where d.object_path=name));

-- Keep the original profile records; share only one unambiguous, current drawing.
with candidates as (
 select d.*,public.wc_cart_base_package(d.profile_signature,d.box_index) package_id
 from public.wc_box_drawings d join public.wc_delivery_packaging_profiles profile on profile.signature=d.profile_signature
 where lower(btrim(d.box_snapshot->>'package_name'))=lower(btrim((profile.packages->d.box_index)->>'package_name'))
 and d.box_snapshot->'length_mm'=(profile.packages->d.box_index)->'length_mm'
 and d.box_snapshot->'width_mm'=(profile.packages->d.box_index)->'width_mm'
 and d.box_snapshot->'height_mm'=(profile.packages->d.box_index)->'height_mm'
), unique_source as (
 select package_id from candidates where package_id is not null group by package_id having count(distinct object_path)=1
)
insert into public.wc_cart_base_box_drawings(cart_base_package_id,box_snapshot,object_path,filename,size_bytes)
select distinct on (c.package_id) c.package_id,
 jsonb_build_object('package_name',p.package_name,'length_mm',p.length_mm,'width_mm',p.width_mm,'height_mm',p.height_mm),
 c.object_path,c.filename,c.size_bytes
from candidates c join unique_source u on u.package_id=c.package_id join public.wc_shipping_packages p on p.id=c.package_id;

create function public.wc_save_cart_base_box_drawing(
 p_package uuid,p_box jsonb,p_path text,p_filename text,p_bytes integer,p_expected uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare current_box jsonb; previous uuid; result public.wc_cart_base_box_drawings;
begin
 if not public.wc_is_hub_manager() then raise exception 'Manager access required'; end if;
 select jsonb_build_object('package_name',p.package_name,'length_mm',p.length_mm,'width_mm',p.width_mm,'height_mm',p.height_mm)
 into current_box from public.wc_shipping_packages p join public.wc_shipping_products product on product.id=p.shipping_product_id
 where p.id=p_package and p.active and p.source_type='Base' and product.product_type='Cart' for update of p;
 if not found or p_box is distinct from current_box then raise exception 'Base box changed. Reload the product before uploading.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('cart-base-drawing:'||p_package::text,0));
 select revision into previous from public.wc_cart_base_box_drawings where cart_base_package_id=p_package;
 if previous is distinct from p_expected then raise exception 'Drawing changed. Reload before replacing it.'; end if;
 if p_filename is null or length(p_filename) not between 5 and 255 or lower(p_filename) not like '%.cdr'
 or p_bytes is null or p_bytes not between 1 and 20971520
 or p_path is null or split_part(p_path,'/',1)<>auth.uid()::text
 or not exists(select 1 from storage.objects where bucket_id='box-drawings' and name=p_path and (metadata->>'size')::bigint=p_bytes)
 then raise exception 'Choose a valid CDR drawing of at most 20 MB and retry.'; end if;
 insert into public.wc_cart_base_box_drawings(cart_base_package_id,box_snapshot,object_path,filename,size_bytes)
 values(p_package,p_box,p_path,p_filename,p_bytes)
 on conflict(cart_base_package_id) do update set box_snapshot=excluded.box_snapshot,object_path=excluded.object_path,
 filename=excluded.filename,size_bytes=excluded.size_bytes,revision=gen_random_uuid(),updated_at=now() returning * into result;
 return to_jsonb(result);
end $$;
revoke all on function public.wc_save_cart_base_box_drawing(uuid,jsonb,text,text,integer,uuid) from public,anon;
grant execute on function public.wc_save_cart_base_box_drawing(uuid,jsonb,text,text,integer,uuid) to authenticated;
