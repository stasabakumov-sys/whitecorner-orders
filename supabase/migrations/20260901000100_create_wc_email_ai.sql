create extension if not exists pgcrypto;

create table if not exists public.wc_email_threads (
  id uuid primary key default gen_random_uuid(),
  external_thread_id text unique,
  correspondent_email text,
  correspondent_name text,
  subject text,
  status text not null default 'Inbox' check (status in ('Inbox','Needs reply','Sent')),
  linked_order_id uuid references public.wc_orders(id) on delete set null,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wc_email_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.wc_email_threads(id) on delete cascade,
  external_message_id text unique,
  direction text not null check (direction in ('Incoming','Outgoing')),
  from_email text,
  to_email text,
  subject text,
  body_text text,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.wc_email_ai_analysis (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null unique references public.wc_email_threads(id) on delete cascade,
  message_id uuid references public.wc_email_messages(id) on delete set null,
  ai_state text not null default 'Not analysed' check (ai_state in ('Not analysed','Review','Draft ready','Auto handled')),
  intent text,
  needs_reply boolean,
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  recommended_action text,
  draft_reply text,
  automation_allowed boolean not null default false,
  risk_reason text,
  linked_order_confidence numeric check (linked_order_confidence is null or (linked_order_confidence >= 0 and linked_order_confidence <= 1)),
  analyzed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists wc_email_threads_status_idx on public.wc_email_threads(status);
create index if not exists wc_email_threads_last_message_idx on public.wc_email_threads(last_message_at desc);
create index if not exists wc_email_messages_thread_idx on public.wc_email_messages(thread_id, received_at);

alter table public.wc_email_threads enable row level security;
alter table public.wc_email_messages enable row level security;
alter table public.wc_email_ai_analysis enable row level security;

drop policy if exists wc_email_threads_auth_all on public.wc_email_threads;
create policy wc_email_threads_auth_all on public.wc_email_threads for all to authenticated using (true) with check (true);

drop policy if exists wc_email_messages_auth_all on public.wc_email_messages;
create policy wc_email_messages_auth_all on public.wc_email_messages for all to authenticated using (true) with check (true);

drop policy if exists wc_email_ai_analysis_auth_all on public.wc_email_ai_analysis;
create policy wc_email_ai_analysis_auth_all on public.wc_email_ai_analysis for all to authenticated using (true) with check (true);
