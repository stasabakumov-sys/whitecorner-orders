-- One private box drawing per exact backdrop size, independent of product/variant.
create table public.wc_backdrop_box_drawings (
 size_key text primary key check(size_key ~ '^[1-9][0-9]{0,4}x[1-9][0-9]{0,4}$'),
 object_path text not null unique,
 filename text not null check(length(filename) between 1 and 255),
 size_bytes integer not null check(size_bytes between 1 and 1048576),
 revision uuid not null default gen_random_uuid(),updated_at timestamptz not null default now()
);
alter table public.wc_backdrop_box_drawings enable row level security;
revoke all on public.wc_backdrop_box_drawings from public,anon,authenticated;
grant select on public.wc_backdrop_box_drawings to authenticated;
create policy backdrop_drawings_read on public.wc_backdrop_box_drawings for select to authenticated using(true);
drop policy box_drawings_cleanup on storage.objects;
create policy box_drawings_cleanup on storage.objects for delete to authenticated
using(bucket_id='box-drawings' and not exists(select 1 from public.wc_box_drawings d where d.object_path=name)
 and not exists(select 1 from public.wc_backdrop_box_drawings d where d.object_path=name));

create function public.wc_save_backdrop_box_drawing(p_size text,p_path text,p_filename text,p_bytes integer,p_expected uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare previous uuid; result wc_backdrop_box_drawings;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 if p_size is null or p_size !~ '^[1-9][0-9]{0,4}x[1-9][0-9]{0,4}$' then raise exception 'Explicit backdrop dimensions are required';end if;
 if split_part(p_size,'x',1)::int<split_part(p_size,'x',2)::int or split_part(p_size,'x',1)::int>10000 then raise exception 'Invalid backdrop dimensions';end if;
 perform pg_advisory_xact_lock(hashtextextended('backdrop-drawing:'||p_size,0));
 select revision into previous from wc_backdrop_box_drawings where size_key=p_size;
 if previous is distinct from p_expected then raise exception 'Drawing changed. Refresh before replacing it.';end if;
 if p_path is null or split_part(p_path,'/',1)<>auth.uid()::text or not exists(select 1 from storage.objects where bucket_id='box-drawings' and name=p_path and (metadata->>'size')::bigint=p_bytes) then raise exception 'Uploaded file not found or size mismatch';end if;
 insert into wc_backdrop_box_drawings(size_key,object_path,filename,size_bytes) values(p_size,p_path,p_filename,p_bytes)
 on conflict(size_key) do update set object_path=excluded.object_path,filename=excluded.filename,size_bytes=excluded.size_bytes,revision=gen_random_uuid(),updated_at=now() returning * into result;
 return to_jsonb(result);
end $$;
revoke all on function public.wc_save_backdrop_box_drawing(text,text,text,integer,uuid) from public,anon;
grant execute on function public.wc_save_backdrop_box_drawing(text,text,text,integer,uuid) to authenticated;
