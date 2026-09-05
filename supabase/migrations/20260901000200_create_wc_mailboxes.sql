create table if not exists public.wc_mailboxes (
  id uuid primary key default gen_random_uuid(),
  mailbox_key text not null unique check (mailbox_key in ('info','support')),
  email text not null unique,
  provider text not null default 'gmail' check (provider = 'gmail'),
  refresh_token text,
  granted_scopes text[] not null default '{}',
  connected_by uuid,
  connected_at timestamptz,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.wc_mailboxes enable row level security;

-- No authenticated policies on purpose. OAuth tokens are backend-only.
-- Supabase Edge Functions use the service-role key and therefore can access this table.

create index if not exists wc_mailboxes_email_idx on public.wc_mailboxes(email);
