create table public.wc_catalog_media_issues (
 source_url text primary key,
 reason text not null,
 checked_at timestamptz not null default now()
);
alter table public.wc_catalog_media_issues enable row level security;
revoke all on public.wc_catalog_media_issues from public,anon,authenticated;
grant select on public.wc_catalog_media_issues to authenticated;
create policy media_issues_staff_read on public.wc_catalog_media_issues for select to authenticated using(true);
grant all on public.wc_catalog_media_issues to service_role;
