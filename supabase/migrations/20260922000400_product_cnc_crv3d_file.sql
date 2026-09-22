-- Existing .tap and .crc3d attachments remain readable; new files use .crv3d.
create or replace function public.wc_attach_product_cnc_file(p_id uuid,p_path text,p_filename text,p_size integer,p_expected uuid)
returns public.wc_product_cnc_sheets language plpgsql security definer set search_path=public as $$
declare result public.wc_product_cnc_sheets;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_filename is null or p_filename !~* '\.crv3d$' or length(p_filename)>255 or p_size is null or p_size<1 or p_size>20971520
    or p_path is null or split_part(p_path,'/',1)<>auth.uid()::text
    or not exists(select 1 from storage.objects where bucket_id='cnc-files' and name=p_path and (metadata->>'size')::bigint=p_size)
 then raise exception 'Invalid or missing CRV3D file'; end if;
 update public.wc_product_cnc_sheets set object_path=p_path,filename=p_filename,size_bytes=p_size,
  revision=gen_random_uuid(),updated_at=now()
 where id=p_id and revision=p_expected returning * into result;
 if not found then raise exception 'CNC sheet changed. Reload before replacing its file.'; end if;
 return result;
end $$;
