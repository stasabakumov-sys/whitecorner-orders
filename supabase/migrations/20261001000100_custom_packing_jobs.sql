-- Independent manager-authored Packing jobs with no product or order links.
create table public.wc_custom_packing_jobs (
 id uuid primary key default gen_random_uuid(),
 title text not null check (length(btrim(title)) between 1 and 160),
 instructions text not null default '' check (length(instructions) <= 5000),
 created_by uuid not null references public.wc_hub_members(user_id),
 updated_by uuid not null references public.wc_hub_members(user_id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 revision uuid not null default gen_random_uuid()
);
create index wc_custom_packing_jobs_updated on public.wc_custom_packing_jobs(updated_at desc);
alter table public.wc_custom_packing_jobs enable row level security;
revoke all on public.wc_custom_packing_jobs from public, anon, authenticated;
grant select on public.wc_custom_packing_jobs to authenticated;
create policy custom_packing_jobs_manager_read on public.wc_custom_packing_jobs
 for select to authenticated using (public.wc_is_hub_manager());

create function public.wc_save_custom_packing_job(
 p_id uuid, p_title text, p_instructions text, p_expected uuid
) returns public.wc_custom_packing_jobs language plpgsql security definer
set search_path=public,pg_temp as $$
declare result public.wc_custom_packing_jobs;
begin
 if not public.wc_is_hub_manager() then raise exception 'Manager access required'; end if;
 if p_title is null or length(btrim(p_title)) not between 1 and 160 then
  raise exception 'Enter a title of 1 to 160 characters';
 end if;
 if length(coalesce(p_instructions,'')) > 5000 then
  raise exception 'Instructions must be 5000 characters or fewer';
 end if;
 if p_id is null then
  insert into public.wc_custom_packing_jobs(title,instructions,created_by,updated_by)
  values(btrim(p_title),coalesce(p_instructions,''),auth.uid(),auth.uid()) returning * into result;
 else
  update public.wc_custom_packing_jobs set title=btrim(p_title),instructions=coalesce(p_instructions,''),
   updated_by=auth.uid(),updated_at=now(),revision=gen_random_uuid()
  where id=p_id and revision=p_expected returning * into result;
  if not found then raise exception 'Custom job changed. Refresh the list before saving again.'; end if;
 end if;
 return result;
end $$;
revoke all on function public.wc_save_custom_packing_job(uuid,text,text,uuid) from public,anon;
grant execute on function public.wc_save_custom_packing_job(uuid,text,text,uuid) to authenticated;
