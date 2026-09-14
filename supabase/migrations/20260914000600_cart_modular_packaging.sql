-- Cart packaging is reusable: Base boxes stay fixed and selected options add
-- only their own box. Dimensions remain null until measured once in Shipping Data.
update public.wc_shipping_products
set product_type='Cart'
where product_type is distinct from 'Cart'
  and product_name ~* '(cart|mobile bar|serving table)';

-- Promote the newest complete no-shelf exact profile into the reusable Base,
-- but never overwrite an already complete Base package.
with ranked as (
 select pr.*,row_number() over(partition by pr.shipping_product_id order by pr.updated_at desc) rank
 from public.wc_delivery_packaging_profiles pr
 join public.wc_shipping_products p on p.id=pr.shipping_product_id and p.product_type='Cart'
 where jsonb_typeof(pr.packages)='array' and jsonb_array_length(pr.packages)>0
 and not exists(
  select 1 from jsonb_each_text(coalesce(pr.template_item->'wix_options','{}'::jsonb)) option
  where lower(trim(option.key)) in('internal shelf','side shelves')
    and lower(trim(option.value)) in('yes','true','included','selected')
 )
), boxes as (
 select r.shipping_product_id,b.value box,b.ordinality::integer package_no
 from ranked r cross join lateral jsonb_array_elements(r.packages) with ordinality b(value,ordinality)
 where r.rank=1
  and (b.value->>'length_mm')::numeric>0 and (b.value->>'width_mm')::numeric>0
  and (b.value->>'height_mm')::numeric>0 and (b.value->>'weight_kg')::numeric>0
)
insert into public.wc_shipping_packages(shipping_product_id,source_type,package_no,package_name,length_mm,width_mm,height_mm,weight_kg,contents,quantity,active,notes)
select shipping_product_id,'Base',package_no,coalesce(nullif(box->>'package_name',''),'Base box '||package_no),
 (box->>'length_mm')::numeric,(box->>'width_mm')::numeric,(box->>'height_mm')::numeric,(box->>'weight_kg')::numeric,'[]'::jsonb,1,true,
 'Promoted from the latest complete Cart profile without shelf boxes.'
from boxes
on conflict(shipping_product_id,source_type,package_no) do update set
 package_name=excluded.package_name,length_mm=excluded.length_mm,width_mm=excluded.width_mm,
 height_mm=excluded.height_mm,weight_kg=excluded.weight_kg,contents='[]'::jsonb,notes=excluded.notes,updated_at=now()
where wc_shipping_packages.length_mm is null or wc_shipping_packages.width_mm is null
   or wc_shipping_packages.height_mm is null or wc_shipping_packages.weight_kg is null;

insert into public.wc_shipping_rules
 (shipping_product_id,rule_type,match_name,match_value,effect_type,package_count_delta,package_name,exact_match_required,active,notes)
select p.id,'Option',x.name,'Yes','Add package',1,x.box,true,true,
 'Reusable Cart option box. Complete dimensions and weight once in Shipping Data.'
from public.wc_shipping_products p
cross join (values
 ('Internal Shelf','Internal shelf box'),
 ('Side shelves','Side shelves box')
) x(name,box)
where p.active and p.product_type='Cart'
and not exists(
 select 1 from public.wc_shipping_rules r
 where r.shipping_product_id=p.id and r.rule_type='Option'
   and lower(trim(r.match_name))=lower(x.name)
   and lower(trim(coalesce(r.match_value,'')))='yes'
   and r.effect_type='Add package'
);
