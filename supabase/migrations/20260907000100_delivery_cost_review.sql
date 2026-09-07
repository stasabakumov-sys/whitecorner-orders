-- Additive: Ready exemption snapshot and waiting review rows only.
-- No quote backfill, booking, external requests or existing order updates.
create table public.wc_delivery_reviews (
 order_id uuid primary key references public.wc_orders(id) on delete cascade,
 state text not null default 'importing' check (state in ('importing','pending','packaging_required','legacy_packaging_required','address_required','calculating','quoted','failed','uncertain','excluded')),
 packages jsonb not null default '[]',
 input_key text,
 snapshot jsonb,
 request jsonb,
 response jsonb,
 insurance_response jsonb,
 evaluated_quotes jsonb not null default '[]',
 quote_attempted_at timestamptz,
 quoted_at timestamptz,
 error text,
 token uuid,
 started_at timestamptz,
 approval jsonb,
 approval_history jsonb not null default '[]',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check (jsonb_typeof(packages)='array'),
 check (jsonb_typeof(evaluated_quotes)='array')
);
create table public.wc_delivery_packaging_profiles (
 signature text primary key,
 packages jsonb not null check (jsonb_typeof(packages)='array'),
 created_by uuid not null,
 updated_at timestamptz not null default now()
);
-- Fixed cutover snapshot: becoming Ready later must NOT bypass the gate.
create table public.wc_delivery_booking_exemptions (
 order_id uuid primary key references public.wc_orders(id) on delete cascade,
 reason text not null default 'Already Ready at delivery review cutover',
 captured_at timestamptz not null default now()
);
insert into public.wc_delivery_booking_exemptions(order_id)
select o.id from public.wc_orders o where
 exists(select 1 from public.wc_fulfilment f where f.order_id=o.id and f.ready_at is not null)
 or o.id in (
  select i.order_id from public.wc_order_items i join public.wc_production_units u on u.order_item_id=i.id
  where coalesce(i.product_name,'') !~* '^(delivery|shipping)(\s+(fee|charge))?$'
   and coalesce(i.product_name,'') !~* '(additional tabletop|custom cutouts?|side shelves|integrated ice storage shelf|umbrella hole|support panel|customisation|customization|back panel with|benchtop upgrade)'
   and u.unit_index<=greatest(1,i.quantity)
  group by i.order_id having count(*)>0 and bool_and(u.production_status='Ready')
 );
-- Existing non-Ready orders need a decision too, but are NOT automatically
-- quoted at rollout. Their first estimate requires packaging confirmation.
insert into public.wc_delivery_reviews(order_id,state,error)
select o.id,'legacy_packaging_required','Confirm packaging to request this existing order''s one-time estimate.'
from public.wc_orders o where not o.is_hidden and not o.archived
 and coalesce(o.fulfillment_status,'')<>'FULFILLED' and coalesce(o.wix_status,'') !~* 'cancel'
 and concat_ws(' ',o.delivery_type,o.delivery_title) !~* 'pick[ -]?up'
 and not exists(select 1 from public.wc_delivery_booking_exemptions e where e.order_id=o.id)
 and not (coalesce(o.shipping,0)=0 and exists(select 1 from public.wc_order_items i where i.order_id=o.id and i.product_name ~* '^(delivery|shipping)(\s+(fee|charge))?$')
  and coalesce((select sum(i.unit_price*i.quantity) from public.wc_order_items i where i.order_id=o.id and i.product_name ~* '^(delivery|shipping)(\s+(fee|charge))?$'),0)=0);
alter table public.wc_delivery_reviews enable row level security;
alter table public.wc_delivery_packaging_profiles enable row level security;
alter table public.wc_delivery_booking_exemptions enable row level security;
revoke all on public.wc_delivery_reviews,public.wc_delivery_packaging_profiles,public.wc_delivery_booking_exemptions from public,anon,authenticated;
grant select on public.wc_delivery_reviews,public.wc_delivery_packaging_profiles,public.wc_delivery_booking_exemptions to authenticated;
grant all on public.wc_delivery_reviews,public.wc_delivery_packaging_profiles,public.wc_delivery_booking_exemptions to service_role;
create policy delivery_reviews_read on public.wc_delivery_reviews for select to authenticated using(true);
create policy delivery_profiles_read on public.wc_delivery_packaging_profiles for select to authenticated using(true);
create policy delivery_exemptions_read on public.wc_delivery_booking_exemptions for select to authenticated using(true);
create index wc_delivery_reviews_queue on public.wc_delivery_reviews(state,created_at) where quote_attempted_at is null;

create function public.wc_seed_delivery_review() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into wc_delivery_reviews(order_id) values(new.id) on conflict do nothing;
 return new;
end $$;
create trigger wc_order_delivery_review after insert on public.wc_orders for each row execute function public.wc_seed_delivery_review();
revoke all on function public.wc_seed_delivery_review() from public,anon,authenticated;

-- A claim may be recovered only BEFORE a quote POST has been attempted.
create function public.wc_claim_delivery_review(p_order_id uuid,p_token uuid) returns boolean language plpgsql security definer set search_path=public as $$
begin
 update wc_delivery_reviews set token=p_token,started_at=now(),updated_at=now()
 where order_id=p_order_id and quote_attempted_at is null and state in ('pending','packaging_required','address_required','calculating')
 and (token is null or started_at<now()-interval '3 minutes');
 return found;
end $$;

create function public.wc_save_delivery_packages(p_order_id uuid,p_packages jsonb,p_signature text,p_actor uuid,p_save_profile boolean,p_order_updated_at timestamptz,p_items jsonb)
returns void language plpgsql security definer set search_path=public as $$
begin
 perform 1 from wc_orders where id=p_order_id and updated_at=p_order_updated_at for update;
 if not found or (select jsonb_agg(to_jsonb(i) order by i.id) from wc_order_items i where order_id=p_order_id) is distinct from (select jsonb_agg(e order by e->>'id') from jsonb_array_elements(p_items) e) then raise exception 'Order changed; reload packaging'; end if;
 if jsonb_typeof(p_packages)<>'array' or jsonb_array_length(p_packages)=0 then raise exception 'Packages required'; end if;
 update wc_delivery_reviews set packages=p_packages,state='pending',error=null,updated_at=now()
 where order_id=p_order_id and quote_attempted_at is null and token is null and state in ('pending','packaging_required','legacy_packaging_required','address_required');
 if not found then raise exception 'Calculation already started or packaging is locked'; end if;
 if p_save_profile then
 insert into wc_delivery_packaging_profiles(signature,packages,created_by) values(p_signature,p_packages,p_actor)
 on conflict(signature) do update set packages=excluded.packages,created_by=excluded.created_by,updated_at=now();
 end if;
end $$;

create function public.wc_approve_delivery_review(p_order_id uuid,p_actor uuid,p_reason text,p_input_key text,p_invoice_cents bigint,p_order_updated_at timestamptz,p_items jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare r wc_delivery_reviews; invoice_cents bigint;
begin
 if length(btrim(p_reason))<3 then raise exception 'Approval reason required'; end if;
 perform 1 from wc_orders where id=p_order_id and updated_at=p_order_updated_at for update;
 if not found or (select jsonb_agg(to_jsonb(i) order by i.id) from wc_order_items i where order_id=p_order_id) is distinct from (select jsonb_agg(e order by e->>'id') from jsonb_array_elements(p_items) e) then raise exception 'Order changed; reload review'; end if;
 select round((coalesce(o.shipping,0)+coalesce((select sum(i.unit_price*i.quantity) from wc_order_items i where i.order_id=o.id and i.product_name ~* '^(delivery|shipping)(\s+(fee|charge))?$'),0))*100)::bigint into invoice_cents from wc_orders o where o.id=p_order_id;
 select * into strict r from wc_delivery_reviews where order_id=p_order_id for update;
 if r.state<>'quoted' or r.input_key is distinct from p_input_key or invoice_cents is distinct from p_invoice_cents then raise exception 'Review changed; reload before approving'; end if;
 update wc_delivery_reviews set approval=jsonb_build_object('actor',p_actor,'at',now(),'reason',btrim(p_reason),'input_key',p_input_key,'invoice_cents',invoice_cents),
 approval_history=approval_history||jsonb_build_array(jsonb_build_object('actor',p_actor,'at',now(),'reason',btrim(p_reason),'input_key',p_input_key,'invoice_cents',invoice_cents)),updated_at=now() where order_id=p_order_id;
end $$;
revoke all on function public.wc_claim_delivery_review(uuid,uuid),public.wc_save_delivery_packages(uuid,jsonb,text,uuid,boolean,timestamptz,jsonb),public.wc_approve_delivery_review(uuid,uuid,text,text,bigint,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.wc_claim_delivery_review(uuid,uuid),public.wc_save_delivery_packages(uuid,jsonb,text,uuid,boolean,timestamptz,jsonb),public.wc_approve_delivery_review(uuid,uuid,text,text,bigint,timestamptz,jsonb) to service_role;
