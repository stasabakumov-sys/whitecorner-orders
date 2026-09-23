-- Wix is the source of imported contact fields; Hub keeps a read-only snapshot.
create table public.wc_wix_contacts (
  wix_contact_id text primary key,
  contact jsonb not null check (jsonb_typeof(contact) = 'object'),
  synced_at timestamptz not null
);

create table public.wc_wix_contacts_sync (
  site_id text primary key,
  total integer not null check (total >= 0),
  synced_at timestamptz not null
);

alter table public.wc_wix_contacts enable row level security;
alter table public.wc_wix_contacts_sync enable row level security;
create policy wix_contacts_read on public.wc_wix_contacts for select to authenticated using (true);
create policy wix_contacts_sync_read on public.wc_wix_contacts_sync for select to authenticated using (true);
revoke all on public.wc_wix_contacts, public.wc_wix_contacts_sync from public, anon, authenticated;
grant select on public.wc_wix_contacts, public.wc_wix_contacts_sync to authenticated;
grant all on public.wc_wix_contacts, public.wc_wix_contacts_sync to service_role;

create function public.wc_replace_wix_contacts(p_site text, p_expected integer, p_contacts jsonb)
returns public.wc_wix_contacts_sync
language plpgsql security definer set search_path = public as $$
declare
  result public.wc_wix_contacts_sync;
  actual integer;
  unique_ids integer;
begin
  if nullif(btrim(p_site), '') is null or p_expected is null or p_expected < 0
     or jsonb_typeof(p_contacts) is distinct from 'array' then
    raise exception 'Invalid contacts snapshot';
  end if;
  perform pg_advisory_xact_lock(20260923, 3);
  if exists (select 1 from public.wc_wix_contacts_sync where site_id <> p_site) then
    raise exception 'Contacts snapshot belongs to another Wix site';
  end if;
  select count(*), count(distinct value->>'id') into actual, unique_ids
    from jsonb_array_elements(p_contacts);
  if actual <> p_expected or unique_ids <> actual or exists (
    select 1 from jsonb_array_elements(p_contacts) as c(value)
    where jsonb_typeof(value) <> 'object' or nullif(value->>'id', '') is null
  ) then
    raise exception 'Incomplete or duplicate Wix contacts snapshot';
  end if;
  if actual = 0 and exists (select 1 from public.wc_wix_contacts) then
    raise exception 'Empty Wix contacts response requires manual review';
  end if;

  -- The transaction preserves the prior complete snapshot if any write fails.
  delete from public.wc_wix_contacts
    where wix_contact_id not in (select value->>'id' from jsonb_array_elements(p_contacts));
  insert into public.wc_wix_contacts(wix_contact_id, contact, synced_at)
    select value->>'id', value, now() from jsonb_array_elements(p_contacts)
    on conflict (wix_contact_id) do update
      set contact = excluded.contact, synced_at = excluded.synced_at;
  insert into public.wc_wix_contacts_sync(site_id, total, synced_at)
    values (p_site, actual, now())
    on conflict (site_id) do update set total = excluded.total, synced_at = excluded.synced_at
    returning * into result;
  return result;
end $$;
revoke all on function public.wc_replace_wix_contacts(text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.wc_replace_wix_contacts(text, integer, jsonb) to service_role;
