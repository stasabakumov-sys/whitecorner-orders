-- A CNC sheet is one physical sheet of material to be cut for a product.
create table public.wc_product_cnc_sheets (
 id uuid primary key default gen_random_uuid(),
 product_id uuid not null references public.wc_shipping_products(id) on delete cascade,
 sheet_number integer not null check(sheet_number > 0),
 name text not null default '' check(length(name) <= 150),
 parts jsonb not null default '[]' check(jsonb_typeof(parts) = 'array'),
 comment text not null default '' check(length(comment) <= 4000),
 object_path text unique,
 filename text check(filename is null or length(filename) between 1 and 255),
 size_bytes integer check(size_bytes is null or size_bytes between 1 and 20971520),
 revision uuid not null default gen_random_uuid(),
 updated_at timestamptz not null default now(),
 unique(product_id, sheet_number),
 check((object_path is null) = (filename is null) and (object_path is null) = (size_bytes is null))
);
create index wc_product_cnc_sheets_product on public.wc_product_cnc_sheets(product_id, sheet_number);
alter table public.wc_product_cnc_sheets enable row level security;
revoke all on public.wc_product_cnc_sheets from public, anon, authenticated;
grant select on public.wc_product_cnc_sheets to authenticated;
create policy product_cnc_sheets_read on public.wc_product_cnc_sheets for select to authenticated using(true);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('cnc-files','cnc-files',false,20971520,array['application/octet-stream']);
create policy cnc_files_upload on storage.objects for insert to authenticated
with check(bucket_id='cnc-files' and (storage.foldername(name))[1]=auth.uid()::text);
create policy cnc_files_download on storage.objects for select to authenticated using(bucket_id='cnc-files');
create policy cnc_files_cleanup on storage.objects for delete to authenticated
using(bucket_id='cnc-files' and (storage.foldername(name))[1]=auth.uid()::text
 and not exists(select 1 from public.wc_product_cnc_sheets s where s.object_path=name));

create function public.wc_save_product_cnc_sheet(p_id uuid,p_product uuid,p_number integer,p_name text,p_parts jsonb,p_comment text,p_expected uuid)
returns public.wc_product_cnc_sheets language plpgsql security definer set search_path=public as $$
declare result public.wc_product_cnc_sheets;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not exists(select 1 from public.wc_shipping_products where id=p_product) then raise exception 'Product not found'; end if;
 if p_number is null or p_number<1 or length(btrim(coalesce(p_name,'')))>150 or length(coalesce(p_comment,''))>4000
    or jsonb_typeof(p_parts) is distinct from 'array'
    or exists(select 1 from jsonb_array_elements(p_parts) x where coalesce(length(x->>'id'),0)=0 or coalesce(length(btrim(x->>'name')),0)=0)
    or (select count(*) from jsonb_array_elements(p_parts))<>(select count(distinct x->>'id') from jsonb_array_elements(p_parts) x)
 then raise exception 'Invalid CNC sheet details'; end if;
 if p_id is null then
  insert into public.wc_product_cnc_sheets(product_id,sheet_number,name,parts,comment)
  values(p_product,p_number,btrim(coalesce(p_name,'')),p_parts,coalesce(p_comment,'')) returning * into result;
 else
  update public.wc_product_cnc_sheets set sheet_number=p_number,name=btrim(coalesce(p_name,'')),parts=p_parts,
   comment=coalesce(p_comment,''),revision=gen_random_uuid(),updated_at=now()
  where id=p_id and product_id=p_product and revision=p_expected returning * into result;
  if not found then raise exception 'CNC sheet changed. Reload before saving.'; end if;
 end if;
 return result;
end $$;
revoke all on function public.wc_save_product_cnc_sheet(uuid,uuid,integer,text,jsonb,text,uuid) from public,anon;
grant execute on function public.wc_save_product_cnc_sheet(uuid,uuid,integer,text,jsonb,text,uuid) to authenticated;

create function public.wc_attach_product_cnc_file(p_id uuid,p_path text,p_filename text,p_size integer,p_expected uuid)
returns public.wc_product_cnc_sheets language plpgsql security definer set search_path=public as $$
declare result public.wc_product_cnc_sheets;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_filename is null or p_filename !~* '\.tap$' or length(p_filename)>255 or p_size<1 or p_size>20971520
    or p_path is null or split_part(p_path,'/',1)<>auth.uid()::text
    or not exists(select 1 from storage.objects where bucket_id='cnc-files' and name=p_path and (metadata->>'size')::bigint=p_size)
 then raise exception 'Invalid or missing TAP file'; end if;
 update public.wc_product_cnc_sheets set object_path=p_path,filename=p_filename,size_bytes=p_size,
  revision=gen_random_uuid(),updated_at=now()
 where id=p_id and revision=p_expected returning * into result;
 if not found then raise exception 'CNC sheet changed. Reload before replacing its file.'; end if;
 return result;
end $$;
revoke all on function public.wc_attach_product_cnc_file(uuid,text,text,integer,uuid) from public,anon;
grant execute on function public.wc_attach_product_cnc_file(uuid,text,text,integer,uuid) to authenticated;
