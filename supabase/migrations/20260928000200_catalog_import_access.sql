-- Scoped, short-lived machine access. No user, customer or order privileges.
create table public.wc_catalog_import_access (
 token_hash text primary key check(length(token_hash)=64),
 expires_at timestamptz not null check(expires_at<=now()+interval '2 hours')
);
alter table public.wc_catalog_import_access enable row level security;
revoke all on public.wc_catalog_import_access from public,anon,authenticated;
grant all on public.wc_catalog_import_access to service_role;
