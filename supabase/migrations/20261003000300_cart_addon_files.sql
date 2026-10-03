-- Reusable Cart Add-on boxes share the existing private packaging-file contract.
-- cart_base_package_id remains the compatibility name for a reusable Cart box ID.
alter table public.wc_shipping_packages add column shipping_rule_id uuid
 references public.wc_shipping_rules(id) on delete restrict;
drop index public.wc_shipping_packages_product_size_source_no_uq;
create unique index wc_shipping_packages_product_size_source_no_uq
 on public.wc_shipping_packages(shipping_product_id,size_key,source_type,shipping_rule_id,package_no) nulls not distinct;
create unique index wc_shipping_packages_rule_no_uq
 on public.wc_shipping_packages(shipping_rule_id,package_no) where shipping_rule_id is not null;

create function public.wc_cart_addon_identity_guard() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
 if (old.shipping_product_id is distinct from new.shipping_product_id or old.size_key is distinct from new.size_key
  or old.rule_type is distinct from new.rule_type or old.match_name is distinct from new.match_name
  or old.match_value is distinct from new.match_value or old.effect_type is distinct from new.effect_type)
  and exists(select 1 from wc_shipping_packages p where p.shipping_rule_id=old.id and
   (exists(select 1 from wc_box_rd_files f where f.cart_base_package_id=p.id)
    or exists(select 1 from wc_cart_base_box_drawings d where d.cart_base_package_id=p.id))) then
  raise exception 'This Add-on has saved files. Create a separate packaging rule for another product, size or option.';
 end if;
 return new;
end $$;
revoke all on function public.wc_cart_addon_identity_guard() from public,anon,authenticated;
create trigger wc_cart_addon_identity_guard before update on public.wc_shipping_rules
 for each row execute function public.wc_cart_addon_identity_guard();

create function public.wc_sync_cart_addon_boxes() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare eligible boolean; total integer;
begin
 eligible:=new.active and new.effect_type in ('Add package','Replace profile')
  and new.package_count_delta>0 and nullif(btrim(new.package_name),'') is not null
  and new.length_mm>0 and new.width_mm>0 and new.height_mm>0
  and exists(select 1 from wc_shipping_products where id=new.shipping_product_id and product_type='Cart');
 total:=case when eligible then new.package_count_delta else 0 end;
 -- Keep IDs stable. RD geometry guards reject incompatible changes atomically.
 update wc_shipping_packages set active=false where shipping_rule_id=new.id and package_no>total;
 insert into wc_shipping_packages(shipping_product_id,size_key,source_type,shipping_rule_id,package_no,
  package_name,length_mm,width_mm,height_mm,weight_kg,quantity,active,notes)
 select new.shipping_product_id,new.size_key,new.rule_type,new.id,n,new.package_name,
  new.length_mm,new.width_mm,new.height_mm,new.weight_kg,1,true,'Reusable box from Cart Add-on rule.'
 from generate_series(1,total) n
 on conflict(shipping_rule_id,package_no) where shipping_rule_id is not null do update set
  shipping_product_id=excluded.shipping_product_id,size_key=excluded.size_key,source_type=excluded.source_type,
  package_name=excluded.package_name,length_mm=excluded.length_mm,width_mm=excluded.width_mm,
  height_mm=excluded.height_mm,weight_kg=excluded.weight_kg,active=true,updated_at=now();
 return new;
end $$;
revoke all on function public.wc_sync_cart_addon_boxes() from public,anon,authenticated;
create trigger wc_sync_cart_addon_boxes after insert or update on public.wc_shipping_rules
 for each row execute function public.wc_sync_cart_addon_boxes();
-- Reuse exactly the same trigger contract for existing rules.
update public.wc_shipping_rules set updated_at=updated_at
 where shipping_product_id in(select id from wc_shipping_products where product_type='Cart');

-- Resolve a rule only when product, size, component, value and geometry agree.
create function public.wc_cart_addon_rule(p_signature text,p_index integer) returns uuid
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare profile wc_delivery_packaging_profiles; box jsonb; size text; result uuid;
begin
 select * into profile from wc_delivery_packaging_profiles where signature=p_signature;
 if not found or p_index is null or p_index<0 or p_index>=jsonb_array_length(profile.packages)
  or profile.template_item->>'profile_scope'='cart-main' then return null; end if;
 box:=profile.packages->p_index;
 if jsonb_typeof(box->'contents') is distinct from 'array' or jsonb_array_length(box->'contents')=0 then return null; end if;
 size:=wc_cart_size_key(profile.template_item->'wix_options');
 if size='' then
  select case when count(distinct coalesce(size_key,''))=1 then min(coalesce(size_key,'')) end into size
  from wc_shipping_packages where shipping_product_id=profile.shipping_product_id and active;
 end if;
 if size is null then return null; end if;
 select case when count(*)=1 then (array_agg(r.id))[1] end into result
 from wc_shipping_rules r join wc_shipping_products product on product.id=r.shipping_product_id and product.product_type='Cart'
 where r.shipping_product_id=profile.shipping_product_id and r.active and r.effect_type in('Add package','Replace profile')
  and coalesce(r.size_key,'')=size and r.package_count_delta>0
  and lower(btrim(r.package_name))=lower(btrim(box->>'package_name'))
  and r.length_mm=(box->>'length_mm')::numeric and r.width_mm=(box->>'width_mm')::numeric and r.height_mm=(box->>'height_mm')::numeric
  and not exists(select 1 from jsonb_array_elements(box->'contents') c where not coalesce((
   (r.rule_type='Option' and c->>'component_key'='option:'||btrim(regexp_replace(lower(r.match_name),'[^a-z0-9]+',' ','g'))
    and (nullif(btrim(r.match_value),'') is null or exists(
     select 1 from jsonb_each(coalesce(profile.template_item->'wix_options','{}')) o
     where lower(btrim(o.key))=lower(btrim(r.match_name))
      and lower(btrim(case jsonb_typeof(o.value) when 'object' then coalesce(o.value->>'original',o.value->>'value','') else o.value#>>'{}' end))=lower(btrim(r.match_value)))))
   or (r.rule_type='Add-on' and coalesce(c->>'component_key','main')='main'
    and lower(btrim(c->>'product_name'))=lower(btrim(r.match_name))
    and nullif(btrim(r.match_value),'') is null)
  ),false));
 return result;
exception when invalid_text_representation then return null;
end $$;
revoke all on function public.wc_cart_addon_rule(text,integer) from public,anon;
grant execute on function public.wc_cart_addon_rule(text,integer) to authenticated;

alter function public.wc_cart_base_package(text,integer) rename to wc_cart_standard_base_package;
create function public.wc_cart_base_package(p_signature text,p_index integer) returns uuid
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result uuid; rule_id uuid; ordinal integer; total integer; matched integer;
begin
 rule_id:=wc_cart_addon_rule(p_signature,p_index);
 if rule_id is null then return wc_cart_standard_base_package(p_signature,p_index); end if;
 select package_count_delta into total from wc_shipping_rules where id=rule_id;
 select count(*)::integer into matched from wc_delivery_packaging_profiles p
  cross join lateral generate_series(0,jsonb_array_length(p.packages)-1) n
  where p.signature=p_signature and wc_cart_addon_rule(p_signature,n)=rule_id;
 if mod(matched,total)<>0 then return null; end if;
 select count(*)::integer into ordinal from generate_series(0,p_index-1) n where wc_cart_addon_rule(p_signature,n)=rule_id;
 select id into result from wc_shipping_packages where shipping_rule_id=rule_id and active and package_no=mod(ordinal,total)+1;
 return result;
end $$;
revoke all on function public.wc_cart_base_package(text,integer) from public,anon;
grant execute on function public.wc_cart_base_package(text,integer) to authenticated;

-- Authoritative mapping for Manage cutting; its preview must use the same IDs as Send.
create function public.wc_cart_packing_file_boxes() returns table(signature text,box_index integer,package_id uuid)
language sql stable security definer set search_path=public,pg_temp as $$
 select p.signature,(b.n-1)::integer,wc_cart_base_package(p.signature,(b.n-1)::integer)
 from wc_delivery_packaging_profiles p cross join lateral jsonb_array_elements(p.packages) with ordinality b(box,n)
 where wc_is_hub_manager()
$$;
revoke all on function public.wc_cart_packing_file_boxes() from public,anon;
grant execute on function public.wc_cart_packing_file_boxes() to authenticated;

create or replace function public.wc_cart_base_rd_package_guard()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if exists(select 1 from public.wc_box_rd_files where cart_base_package_id=old.id)
  and (old.shipping_product_id is distinct from new.shipping_product_id
   or old.size_key is distinct from new.size_key or old.source_type is distinct from new.source_type or old.shipping_rule_id is distinct from new.shipping_rule_id
   or old.package_name is distinct from new.package_name
   or old.length_mm is distinct from new.length_mm or old.width_mm is distinct from new.width_mm
   or old.height_mm is distinct from new.height_mm) then
  raise exception 'This Cart packaging box has shared RD files. Remove them before changing its name, size or dimensions.';
 end if;
 return new;
end $$;
revoke all on function public.wc_cart_base_rd_package_guard() from public,anon,authenticated;

-- Manage shared Cart Base RD files directly from the reusable box in Products.
create or replace function public.wc_save_cart_base_rd_file_for_package(
 p_id uuid,p_package uuid,p_path text,p_filename text,
 p_bytes integer,p_copies integer,p_expected uuid
) returns public.wc_box_rd_files language plpgsql security definer set search_path=public,pg_temp as $$
declare previous public.wc_box_rd_files; result public.wc_box_rd_files;
begin
 if not public.wc_is_hub_manager() then raise exception 'Manager access required'; end if;
 perform 1 from public.wc_shipping_packages p join public.wc_shipping_products product on product.id=p.shipping_product_id
  where p.id=p_package and p.active and (p.source_type='Base' or p.shipping_rule_id is not null) and product.product_type='Cart'
  for update of p;
 if not found then raise exception 'This reusable Cart packaging box is unavailable. Reload the product.'; end if;
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
   raise exception 'An RD file with this name already exists for this Cart packaging box. Replace that file instead.';
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

alter table public.wc_box_rd_files disable trigger wc_box_rd_manager_guard;
alter table public.wc_box_rd_files disable trigger wc_box_rd_active_guard;
with sources as (
 select f.id,f.profile_signature,f.box_index,f.filename,
        public.wc_cart_base_package(f.profile_signature,f.box_index) package_id
 from public.wc_box_rd_files f where f.profile_signature is not null
), unambiguous as (
 select package_id from sources where package_id is not null
 and exists(select 1 from wc_shipping_packages p where p.id=package_id and p.shipping_rule_id is not null)
 and not exists(select 1 from wc_box_rd_files f where f.cart_base_package_id=package_id)
 group by package_id
 having count(distinct (profile_signature,box_index))=1
    and count(*)=count(distinct lower(filename))
)
update public.wc_box_rd_files f set cart_base_package_id=s.package_id,
 profile_signature=null,box_index=null
from sources s join unambiguous u on u.package_id=s.package_id where f.id=s.id;
alter table public.wc_box_rd_files enable trigger wc_box_rd_active_guard;
alter table public.wc_box_rd_files enable trigger wc_box_rd_manager_guard;


-- Keep the original profile records; share only one unambiguous, current drawing.
with candidates as (
 select d.*,public.wc_cart_base_package(d.profile_signature,d.box_index) package_id
 from public.wc_box_drawings d join public.wc_delivery_packaging_profiles profile on profile.signature=d.profile_signature
 where lower(btrim(d.box_snapshot->>'package_name'))=lower(btrim((profile.packages->d.box_index)->>'package_name'))
 and d.box_snapshot->'length_mm'=(profile.packages->d.box_index)->'length_mm'
 and d.box_snapshot->'width_mm'=(profile.packages->d.box_index)->'width_mm'
 and d.box_snapshot->'height_mm'=(profile.packages->d.box_index)->'height_mm'
), unique_source as (
 select package_id from candidates where package_id is not null
 and exists(select 1 from wc_shipping_packages p where p.id=package_id and p.shipping_rule_id is not null)
 group by package_id having count(distinct object_path)=1
)
insert into public.wc_cart_base_box_drawings(cart_base_package_id,box_snapshot,object_path,filename,size_bytes)
select distinct on (c.package_id) c.package_id,
 jsonb_build_object('package_name',p.package_name,'length_mm',p.length_mm,'width_mm',p.width_mm,'height_mm',p.height_mm),
 c.object_path,c.filename,c.size_bytes
from candidates c join unique_source u on u.package_id=c.package_id join public.wc_shipping_packages p on p.id=c.package_id on conflict(cart_base_package_id) do nothing;
