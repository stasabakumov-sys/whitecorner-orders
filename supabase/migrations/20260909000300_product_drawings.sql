-- Product drawings are separate from packaging, scoped to a product and optional variant.
create table public.wc_product_drawings (
 product_id uuid not null references public.wc_shipping_products(id) on delete cascade,
 variant_key text not null default '' check(length(variant_key)<=8000),
 object_path text not null unique,
 filename text not null check(length(filename) between 1 and 255),
 size_bytes integer not null check(size_bytes between 1 and 1048576),
 revision uuid not null default gen_random_uuid(),
 updated_at timestamptz not null default now(),
 primary key(product_id,variant_key)
);
alter table public.wc_product_drawings enable row level security;
revoke all on public.wc_product_drawings from public,anon,authenticated;
grant select on public.wc_product_drawings to authenticated;
create policy product_drawings_read on public.wc_product_drawings for select to authenticated using(true);

drop policy box_drawings_cleanup on storage.objects;
create policy box_drawings_cleanup on storage.objects for delete to authenticated
using(bucket_id='box-drawings'
 and not exists(select 1 from public.wc_box_drawings d where d.object_path=name)
 and not exists(select 1 from public.wc_backdrop_box_drawings d where d.object_path=name)
 and not exists(select 1 from public.wc_product_drawings d where d.object_path=name));

create function public.wc_save_product_drawing(p_product uuid,p_variant text,p_path text,p_filename text,p_bytes integer,p_expected uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare previous uuid; result wc_product_drawings;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 if p_variant is null or length(p_variant)>8000 then raise exception 'Invalid product variant';end if;
 perform 1 from wc_shipping_products where id=p_product for key share;
 if not found then raise exception 'Product not found';end if;
 perform pg_advisory_xact_lock(hashtextextended('product-drawing:'||p_product::text||':'||p_variant,0));
 select revision into previous from wc_product_drawings where product_id=p_product and variant_key=p_variant;
 if previous is distinct from p_expected then raise exception 'Drawing changed. Refresh before replacing it.';end if;
 if p_path is null or split_part(p_path,'/',1)<>auth.uid()::text or not exists(select 1 from storage.objects where bucket_id='box-drawings' and name=p_path and (metadata->>'size')::bigint=p_bytes) then raise exception 'Uploaded file not found or size mismatch';end if;
 insert into wc_product_drawings(product_id,variant_key,object_path,filename,size_bytes) values(p_product,p_variant,p_path,p_filename,p_bytes)
 on conflict(product_id,variant_key) do update set object_path=excluded.object_path,filename=excluded.filename,size_bytes=excluded.size_bytes,revision=gen_random_uuid(),updated_at=now() returning * into result;
 return to_jsonb(result);
end $$;
revoke all on function public.wc_save_product_drawing(uuid,text,text,text,integer,uuid) from public,anon;
grant execute on function public.wc_save_product_drawing(uuid,text,text,text,integer,uuid) to authenticated;
