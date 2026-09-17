-- Owner-confirmed folded 180x90 box. Keep Ripple's measured weight and identity.
-- Run after deploying readers which resolve backdrop_size_key from the library.
do $migration$
declare source public.wc_delivery_packaging_profiles; box jsonb; reference public.wc_backdrop_packaging_dimensions;
begin
 select p.* into strict source from public.wc_delivery_packaging_profiles p
 where jsonb_array_length(p.packages)=1
 and jsonb_array_length(p.packages->0->'contents')=1
 and p.packages->0->'contents'->0->>'wix_product_id'='115701e9-439e-4488-4d87-47b287fd5310'
 and p.packages->0->'contents'->0->>'profile_item_key'='["115701e9-439e-4488-4d87-47b287fd5310",["foldable yes","size 180cm x 90cm"]]:0'
 for update;
 box:=source.packages->0;
 if (box->>'length_mm')::numeric is distinct from 930 or (box->>'width_mm')::numeric is distinct from 930 or (box->>'height_mm')::numeric is distinct from 90 then
  raise exception 'Ripple 180x90 dimensions changed; review before migration';
 end if;
 insert into public.wc_backdrop_packaging_dimensions(size_key,package_name,length_mm,width_mm,height_mm,created_by)
 values('1800x900:foldable','Backdrop',930,930,90,source.created_by)
 on conflict(size_key) do nothing;
 select * into strict reference from public.wc_backdrop_packaging_dimensions where size_key='1800x900:foldable' for update;
 if reference.length_mm<>930 or reference.width_mm<>930 or reference.height_mm<>90 then
  raise exception 'Shared 180x90 dimensions differ; review before migration';
 end if;
 update public.wc_delivery_packaging_profiles
 set packages=jsonb_build_array((box-'length_mm'-'width_mm'-'height_mm')||jsonb_build_object('backdrop_size_key','1800x900:foldable'))
 where signature=source.signature;
end $migration$;
