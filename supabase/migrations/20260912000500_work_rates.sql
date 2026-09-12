-- Shared hourly labour rates used with product planning minutes.
create table public.wc_work_rates (
 work_type text primary key check(work_type in ('cnc','assembly','sanding','painting')),
 label text not null, rate_gst_hour numeric(12,4) check(rate_gst_hour is null or (rate_gst_hour>=0 and rate_gst_hour<>'NaN'::numeric)),
 sort_order integer not null, updated_at timestamptz not null default now(), updated_by uuid references auth.users(id)
);
insert into public.wc_work_rates(work_type,label,sort_order) values
 ('cnc','CNC',10),('assembly','Assembly',20),('sanding','Sanding',30),('painting','Painting',40);
alter table public.wc_work_rates enable row level security;
create policy work_rates_read on public.wc_work_rates for select to authenticated using(true);
revoke all on public.wc_work_rates from public,anon,authenticated;
grant select on public.wc_work_rates to authenticated;

create function public.wc_save_work_rate(p_type text,p_rate numeric,p_expected timestamptz)
returns jsonb language plpgsql security definer set search_path=public as $$
declare saved wc_work_rates;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 if p_rate is null or p_rate<0 or p_rate>100000 or p_rate='NaN'::numeric then raise exception 'Enter a valid hourly rate';end if;
 update wc_work_rates set rate_gst_hour=p_rate,updated_at=clock_timestamp(),updated_by=auth.uid()
 where work_type=p_type and updated_at=p_expected returning * into saved;
 if not found then raise exception 'Rate changed. Refresh before editing';end if;
 return to_jsonb(saved);
end $$;
revoke all on function public.wc_save_work_rate(text,numeric,timestamptz) from public,anon,authenticated;
grant execute on function public.wc_save_work_rate(text,numeric,timestamptz) to authenticated;
