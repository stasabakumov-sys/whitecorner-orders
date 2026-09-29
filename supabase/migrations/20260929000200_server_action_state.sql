begin;
-- Server-owned, short-lived OAuth handshakes. No bearer/refresh tokens stored.
create table public.wc_gmail_oauth_requests (
 nonce uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null, mailbox text not null check(mailbox in ('info','support')),
 expires_at timestamptz not null
);
alter table public.wc_gmail_oauth_requests enable row level security;
revoke all on public.wc_gmail_oauth_requests from public,anon,authenticated;
grant all on public.wc_gmail_oauth_requests to service_role;
create function public.wc_consume_gmail_oauth(p_nonce uuid) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare pending public.wc_gmail_oauth_requests;
begin
 delete from public.wc_gmail_oauth_requests where nonce=p_nonce returning * into pending;
 if pending.nonce is null or pending.expires_at<=now() then return null; end if;
 if not exists(select 1 from auth.sessions s where s.id=pending.session_id and s.user_id=pending.user_id
   and (s.not_after is null or s.not_after>now())) then return null; end if;
 if not exists(select 1 from public.wc_hub_members m where m.user_id=pending.user_id and m.active and m.role='manager') then return null; end if;
 return pending.user_id;
end $$;
revoke all on function public.wc_consume_gmail_oauth(uuid) from public,anon,authenticated;
grant execute on function public.wc_consume_gmail_oauth(uuid) to service_role;

-- Provider quotes and accepted booking details cannot be forged through PostgREST.
create table public.wc_courier_quotes (
 courier_order_id text primary key, shipment_id uuid not null references public.wc_shipments(id),
 request jsonb not null, quotes jsonb not null, created_at timestamptz not null default now()
);
create table public.wc_courier_booking_attempts (
 courier_order_id text primary key references public.wc_courier_quotes(courier_order_id),
 actor uuid not null references auth.users(id), details jsonb not null,
 shipment_version timestamptz not null, total_cents bigint not null check(total_cents>=0),
 prepared_at timestamptz not null default now(), attempted_at timestamptz,
 preparation_token uuid not null, details_saved boolean not null default false
);
alter table public.wc_courier_quotes enable row level security;
alter table public.wc_courier_booking_attempts enable row level security;
revoke all on public.wc_courier_quotes,public.wc_courier_booking_attempts from public,anon,authenticated;
grant all on public.wc_courier_quotes,public.wc_courier_booking_attempts to service_role;
create function public.wc_prepare_courier_booking(p_order text,p_actor uuid,p_version timestamptz,p_total bigint,p_details jsonb,p_token uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare shipment public.wc_shipments;
begin
 select s.* into shipment from public.wc_shipments s where s.courier_order_id=p_order for update;
 if not found or shipment.status<>'Quote Selected' or shipment.updated_at<>p_version then return false; end if;
 if not exists(select 1 from public.wc_hub_members where user_id=p_actor and active and role='manager') then return false; end if;
 insert into public.wc_courier_booking_attempts(courier_order_id,actor,details,shipment_version,total_cents,preparation_token)
 values(p_order,p_actor,p_details,p_version,p_total,p_token)
 on conflict(courier_order_id) do update set actor=excluded.actor,details=excluded.details,
 shipment_version=excluded.shipment_version,total_cents=excluded.total_cents,
 preparation_token=excluded.preparation_token,prepared_at=now(),details_saved=false
 where wc_courier_booking_attempts.attempted_at is null and wc_courier_booking_attempts.details_saved;
 -- An uncertain details POST requires reconciliation/new quote, never overlapping writes.
 return found;
end $$;
revoke all on function public.wc_prepare_courier_booking(text,uuid,timestamptz,bigint,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.wc_prepare_courier_booking(text,uuid,timestamptz,bigint,jsonb,uuid) to service_role;
create function public.wc_claim_courier_booking(p_order text,p_actor uuid,p_version timestamptz,p_total bigint)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare shipment public.wc_shipments;
begin
 select s.* into shipment from public.wc_shipments s where s.courier_order_id=p_order for update;
 if not found or shipment.status<>'Quote Selected' or shipment.updated_at<>p_version then return false; end if;
 if not exists(select 1 from public.wc_hub_members where user_id=p_actor and active and role='manager') then return false; end if;
 update public.wc_courier_booking_attempts set attempted_at=now()
 where courier_order_id=p_order and actor=p_actor and attempted_at is null and details_saved
 and shipment_version=p_version and total_cents=p_total and prepared_at>now()-interval '15 minutes';
 return found;
end $$;
revoke all on function public.wc_claim_courier_booking(text,uuid,timestamptz,bigint) from public,anon,authenticated;
grant execute on function public.wc_claim_courier_booking(text,uuid,timestamptz,bigint) to service_role;

-- Direct PostgREST package edits must invalidate approval too, not just Angular edits.
create function public.wc_invalidate_shipment_packing() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare shipment public.wc_shipments; target uuid;
begin
 if tg_op='UPDATE' and new.shipment_id<>old.shipment_id then raise exception 'Packages cannot move between shipments'; end if;
 target := case when tg_op='DELETE' then old.shipment_id else new.shipment_id end;
 select * into shipment from public.wc_shipments where id=target for update;
 if not found then return coalesce(new,old); end if;
 if shipment.status in ('Shipping Booked','In Transit','Delivered') or exists
  (select 1 from public.wc_courier_booking_attempts where courier_order_id=shipment.courier_order_id and (attempted_at is not null or not details_saved)) then
  raise exception 'Booking is in progress or already attempted. Reconcile it before editing packages';
 end if;
 update public.wc_shipments set status='Packaging Review',packages_approved_at=null,courier_order_id=null,
  courier_provider=null,quote_request=null,courier_quotes=null,quoted_at=null,selected_quote_id=null,selected_quote=null,updated_at=clock_timestamp()
 where id=target;
 return coalesce(new,old);
end $$;
revoke all on function public.wc_invalidate_shipment_packing() from public,anon,authenticated;
create trigger wc_invalidate_shipment_packing before insert or update or delete on public.wc_shipment_packages
for each row execute function public.wc_invalidate_shipment_packing();
commit;
