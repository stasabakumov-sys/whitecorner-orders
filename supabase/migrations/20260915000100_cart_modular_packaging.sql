-- Older exact profiles can be displayed beside a Cart through their saved
-- contents even when shipping_product_id was never linked. Link only a single,
-- unambiguous Cart match, then promote its no-shelf boxes into reusable Base.
with candidates as (
 select distinct pr.signature,p.id product_id
 from public.wc_delivery_packaging_profiles pr
 cross join lateral jsonb_array_elements(coalesce(pr.packages,'[]'::jsonb)) box(value)
 cross join lateral jsonb_array_elements(coalesce(box.value->'contents','[]'::jsonb)) content(value)
 join public.wc_shipping_products p on p.active and p.product_type='Cart' and (
  (nullif(content.value->>'wix_product_id','') is not null and p.wix_product_id=content.value->>'wix_product_id')
  or (nullif(content.value->>'wix_product_id','') is null and lower(trim(p.product_name))=lower(trim(content.value->>'product_name')))
 )
 where pr.shipping_product_id is null
   and coalesce(content.value->>'component_key','main')='main'
), unique_candidates as (
 select signature,min(product_id::text)::uuid product_id
 from candidates group by signature having count(distinct product_id)=1
)
update public.wc_delivery_packaging_profiles pr
set shipping_product_id=c.product_id,updated_at=pr.updated_at
from unique_candidates c where c.signature=pr.signature and pr.shipping_product_id is null;

with eligible as (
 select pr.*,row_number() over(partition by pr.shipping_product_id order by pr.updated_at desc) rank
 from public.wc_delivery_packaging_profiles pr
 join public.wc_shipping_products p on p.id=pr.shipping_product_id and p.active and p.product_type='Cart'
 where jsonb_typeof(pr.packages)='array' and jsonb_array_length(pr.packages)>0
 and not exists(
  select 1 from jsonb_each_text(coalesce(pr.template_item->'wix_options','{}'::jsonb)) option
  where lower(trim(option.key)) in('internal shelf','side shelves')
    and lower(trim(option.value)) in('yes','true','included','selected')
 )
 and not exists(
  select 1 from jsonb_array_elements(pr.packages) package
  cross join lateral jsonb_array_elements(coalesce(package->'contents','[]'::jsonb)) content
  where lower(coalesce(content->>'profile_item_key','')) ~ '(internal shelf|side shelves) (yes|true|included|selected)'
 )
), boxes as (
 select e.shipping_product_id,box.value box,box.ordinality::integer package_no
 from eligible e
 join public.wc_shipping_products p on p.id=e.shipping_product_id
 cross join lateral jsonb_array_elements(e.packages) with ordinality box(value,ordinality)
 where e.rank=1
   and nullif(box.value->>'length_mm','')::numeric>0
   and nullif(box.value->>'width_mm','')::numeric>0
   and nullif(box.value->>'height_mm','')::numeric>0
   and nullif(box.value->>'weight_kg','')::numeric>0
   and exists(
    select 1 from jsonb_array_elements(coalesce(box.value->'contents','[]'::jsonb)) content
    where coalesce(content->>'component_key','main')='main' and (
     (p.wix_product_id is not null and content->>'wix_product_id'=p.wix_product_id)
     or (p.wix_product_id is null and lower(trim(content->>'product_name'))=lower(trim(p.product_name)))
    )
   )
)
insert into public.wc_shipping_packages
 (shipping_product_id,source_type,package_no,package_name,length_mm,width_mm,height_mm,weight_kg,contents,quantity,active,notes)
select shipping_product_id,'Base',package_no,coalesce(nullif(box->>'package_name',''),'Base box '||package_no),
 (box->>'length_mm')::numeric,(box->>'width_mm')::numeric,(box->>'height_mm')::numeric,(box->>'weight_kg')::numeric,
 '[]'::jsonb,1,true,'Promoted from a linked complete Cart profile without shelf boxes.'
from boxes
on conflict(shipping_product_id,source_type,package_no) do update set
 package_name=excluded.package_name,length_mm=excluded.length_mm,width_mm=excluded.width_mm,
 height_mm=excluded.height_mm,weight_kg=excluded.weight_kg,contents='[]'::jsonb,
 notes=excluded.notes,updated_at=now()
where coalesce(wc_shipping_packages.length_mm,0)<=0
   or coalesce(wc_shipping_packages.width_mm,0)<=0
   or coalesce(wc_shipping_packages.height_mm,0)<=0
   or coalesce(wc_shipping_packages.weight_kg,0)<=0;
