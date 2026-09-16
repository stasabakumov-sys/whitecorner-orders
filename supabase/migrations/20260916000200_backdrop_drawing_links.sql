-- Link unambiguous legacy per-product Backdrop drawings into the shared
-- size + folding library. The private storage object stays in place.
create or replace function public.wc_backdrop_profile_drawing_key(p_template jsonb)
returns text language sql immutable set search_path=public as $$
 with options as(
  select key,case jsonb_typeof(value) when 'object' then coalesce(value->>'original',value->>'value',value->>'name','') else value#>>'{}' end value
  from jsonb_each(coalesce(p_template->'wix_options',p_template->'options','{}'::jsonb))
 ), parsed as(
  select
   (select public.wc_shop_metric_size(value) from options where btrim(key)~*'^size|dimensions?$' limit 1) size_key,
   (select case regexp_replace(lower(btrim(value)),'[\s_-]','','g')
    when 'yes' then 'foldable' when 'true' then 'foldable' when 'foldable' then 'foldable'
    when 'no' then 'nonfoldable' when 'false' then 'nonfoldable' when 'nonfoldable' then 'nonfoldable' when 'unfoldable' then 'nonfoldable'
    end from options where lower(btrim(key))='foldable' limit 1) folding
 ) select case when size_key is not null and folding is not null then size_key||':'||folding end from parsed
$$;
revoke all on function public.wc_backdrop_profile_drawing_key(jsonb) from public,anon,authenticated;

with candidates as(
 select public.wc_backdrop_profile_drawing_key(pr.template_item) size_key,d.object_path,d.filename,d.size_bytes,d.updated_at
 from public.wc_box_drawings d
 join public.wc_delivery_packaging_profiles pr on pr.signature=d.profile_signature
 left join public.wc_shipping_products p on p.id=pr.shipping_product_id
 where (coalesce(p.product_type,'')~*'^backdrop$' or coalesce(p.product_name,'')~*'backdrop' or coalesce(pr.template_item->>'product_name','')~*'backdrop')
), unambiguous as(
 select size_key from candidates where size_key is not null group by size_key having count(distinct object_path)=1
), selected as(
 select distinct on(c.size_key)c.size_key,c.object_path,c.filename,c.size_bytes
 from candidates c join unambiguous u using(size_key)
 order by c.size_key,c.updated_at desc
)
insert into public.wc_backdrop_box_drawings(size_key,object_path,filename,size_bytes)
select size_key,object_path,filename,size_bytes from selected
on conflict do nothing;

drop function public.wc_backdrop_profile_drawing_key(jsonb);
