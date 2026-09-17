-- Older Backdrop profiles predate shipping_product_id. Link only profiles whose
-- saved main contents identify one active Backdrop unambiguously. No packages,
-- measurements, weights or signatures are changed.
with candidates as (
 select distinct profile.signature,product.id product_id
 from public.wc_delivery_packaging_profiles profile
 cross join lateral jsonb_array_elements(coalesce(profile.packages,'[]'::jsonb)) box(value)
 cross join lateral jsonb_array_elements(coalesce(box.value->'contents','[]'::jsonb)) content(value)
 join public.wc_shipping_products product on product.active
  and (lower(trim(coalesce(product.product_type,'')))='backdrop' or product.product_name~*'backdrop')
  and (
   (nullif(content.value->>'wix_product_id','') is not null and product.wix_product_id=content.value->>'wix_product_id')
   or (nullif(content.value->>'wix_product_id','') is null and lower(trim(product.product_name))=lower(trim(content.value->>'product_name')))
  )
 where profile.shipping_product_id is null
  and jsonb_typeof(profile.packages)='array'
  and coalesce(content.value->>'component_key','main')='main'
), unique_candidates as (
 select signature,min(product_id::text)::uuid product_id
 from candidates
 group by signature
 having count(distinct product_id)=1
)
update public.wc_delivery_packaging_profiles profile
set shipping_product_id=candidate.product_id
from unique_candidates candidate
where profile.signature=candidate.signature and profile.shipping_product_id is null;
