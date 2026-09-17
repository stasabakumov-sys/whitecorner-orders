-- One canonical package size per Backdrop size and folding mode.
-- Product packaging profiles keep their own measured weight.
create table public.wc_backdrop_packaging_dimensions (
 size_key text primary key check(size_key ~ '^[1-9][0-9]{0,4}x[1-9][0-9]{0,4}:(foldable|nonfoldable)$'),
 package_name text not null default 'Backdrop' check(length(trim(package_name)) between 1 and 150),
 length_mm numeric not null check(length_mm>0),
 width_mm numeric not null check(width_mm>0),
 height_mm numeric not null check(height_mm>0),
 revision uuid not null default gen_random_uuid(),
 created_by uuid not null default auth.uid() references auth.users(id),
 updated_at timestamptz not null default now()
);

alter table public.wc_backdrop_packaging_dimensions enable row level security;
revoke all on public.wc_backdrop_packaging_dimensions from public,anon,authenticated;
grant select on public.wc_backdrop_packaging_dimensions to authenticated;
grant all on public.wc_backdrop_packaging_dimensions to service_role;
create policy backdrop_packaging_dimensions_read on public.wc_backdrop_packaging_dimensions for select to authenticated using(true);

create function public.wc_save_backdrop_packaging_dimensions(
 p_size text,p_package_name text,p_length numeric,p_width numeric,p_height numeric,p_expected uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare previous uuid; result wc_backdrop_packaging_dimensions;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 if p_size is null or p_size !~ '^[1-9][0-9]{0,4}x[1-9][0-9]{0,4}:(foldable|nonfoldable)$' then raise exception 'Exact Backdrop size and folding option are required';end if;
 if nullif(trim(p_package_name),'') is null or length(trim(p_package_name))>150 or p_length<=0 or p_width<=0 or p_height<=0 then raise exception 'Complete the package name and positive dimensions';end if;
 perform pg_advisory_xact_lock(hashtextextended('backdrop-packaging-dimensions:'||p_size,0));
 select revision into previous from wc_backdrop_packaging_dimensions where size_key=p_size;
 if previous is distinct from p_expected then raise exception 'Backdrop dimensions changed. Reload before saving.';end if;
 insert into wc_backdrop_packaging_dimensions(size_key,package_name,length_mm,width_mm,height_mm,created_by)
 values(p_size,trim(p_package_name),p_length,p_width,p_height,auth.uid())
 on conflict(size_key) do update set package_name=excluded.package_name,length_mm=excluded.length_mm,width_mm=excluded.width_mm,height_mm=excluded.height_mm,revision=gen_random_uuid(),updated_at=now()
 returning * into result;
 return to_jsonb(result);
end $$;
revoke all on function public.wc_save_backdrop_packaging_dimensions(text,text,numeric,numeric,numeric,uuid) from public,anon;
grant execute on function public.wc_save_backdrop_packaging_dimensions(text,text,numeric,numeric,numeric,uuid) to authenticated;
