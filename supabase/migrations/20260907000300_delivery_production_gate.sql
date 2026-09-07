-- No order updates, external calls, quote backfill or new Ready exemptions.
alter table public.wc_delivery_reviews drop constraint wc_delivery_reviews_state_check;
alter table public.wc_delivery_reviews add constraint wc_delivery_reviews_state_check check
 (state in ('importing','pending','packaging_required','legacy_packaging_required','address_required','calculating','quoted','failed','uncertain','excluded','approved_without_quote'));

-- Lock and compare the exact source read by the authenticated Edge Function.
-- Recheck inside the same transaction that records approval / moves production.
create function public.wc_assert_delivery_context(p_order_id uuid,p_order_version timestamptz,p_items jsonb,p_rules jsonb,p_review_version timestamptz)
returns void language plpgsql security definer set search_path=public as $$
declare version timestamptz; current_rules jsonb;
begin
 perform 1 from wc_orders where id=p_order_id and updated_at=p_order_version for update;
 if not found then raise exception 'Order changed'; end if;
 perform 1 from wc_order_items where order_id=p_order_id for update;
 if (select jsonb_agg(to_jsonb(i) order by i.id) from wc_order_items i where order_id=p_order_id)
  is distinct from (select jsonb_agg(e order by e->>'id') from jsonb_array_elements(p_items) e) then raise exception 'Items changed'; end if;
 lock table wc_shipping_rules in share mode;
 select coalesce(jsonb_agg(x order by x::text),'[]'::jsonb) into current_rules from
  (select jsonb_build_object('match_name',match_name,'match_value',match_value,'effect_type',effect_type,'active',active) x
   from wc_shipping_rules where active and effect_type='No effect') r;
 if current_rules is distinct from (select coalesce(jsonb_agg(e order by e::text),'[]'::jsonb) from jsonb_array_elements(p_rules) e) then raise exception 'Rules changed'; end if;
 select updated_at into version from wc_delivery_reviews where order_id=p_order_id for update;
 if version is distinct from p_review_version then raise exception 'Review changed'; end if;
end $$;

create function public.wc_approve_delivery_without_quote(p_order_id uuid,p_actor uuid,p_reason text,p_input_key text,p_invoice_cents bigint,
 p_order_version timestamptz,p_items jsonb,p_rules jsonb,p_review_version timestamptz)
returns void language plpgsql security definer set search_path=public as $$
declare r wc_delivery_reviews; a jsonb;
begin
 if p_actor is null or p_reason is null or length(btrim(p_reason))<3 or length(p_reason)>2000 or p_input_key is null then raise exception 'Approval reason and actor required'; end if;
 perform wc_assert_delivery_context(p_order_id,p_order_version,p_items,p_rules,p_review_version);
 select * into strict r from wc_delivery_reviews where order_id=p_order_id;
 if r.quote_attempted_at is not null or r.token is not null or r.state not in
  ('pending','packaging_required','legacy_packaging_required','address_required','failed','approved_without_quote') then raise exception 'Unquoted idle review required'; end if;
 -- A repeated request for the same decision is a no-op, not another audit entry.
 if r.state='approved_without_quote' and r.approval->>'input_key'=p_input_key
  and r.approval->'invoice_cents' is not distinct from coalesce(to_jsonb(p_invoice_cents),'null'::jsonb) then return; end if;
 a=jsonb_build_object('kind','without_quote','actor',p_actor,'at',now(),'reason',btrim(p_reason),'input_key',p_input_key,'invoice_cents',p_invoice_cents);
 update wc_delivery_reviews set state='approved_without_quote',approval=a,approval_history=approval_history||jsonb_build_array(a),error=null,updated_at=clock_timestamp()
 where order_id=p_order_id;
end $$;

-- Status transitions are server-owned. Ordinary authenticated users retain
-- notes/priority editing; cannot insert an already-Ready unit or reparent one.
revoke insert,update,delete on public.wc_production_units from public,anon,authenticated;
grant update(production_comment,priority) on public.wc_production_units to authenticated;

create function public.wc_set_reviewed_production_status(p_order_id uuid,p_unit_id uuid,p_next text,p_actor uuid,p_decision text,
 p_order_version timestamptz,p_items jsonb,p_rules jsonb,p_review_version timestamptz)
returns jsonb language plpgsql security definer set search_path=public as $$
declare previous text; activity jsonb;
begin
 if p_actor is null or p_decision is null or p_decision not in ('not_required','ready_exemption','within_target','approved_exception','approved_without_quote')
  or p_next is null or p_next not in ('New','CNC','Assembly','Painting','Packing','Ready') then raise exception 'Delivery decision required'; end if;
 perform wc_assert_delivery_context(p_order_id,p_order_version,p_items,p_rules,p_review_version);
 select u.production_status into previous from wc_production_units u join wc_order_items i on i.id=u.order_item_id
 where u.id=p_unit_id and i.order_id=p_order_id for update of u;
 if not found then raise exception 'Unit does not belong to order'; end if;
 if previous=p_next then return null; end if;
 update wc_production_units set production_status=p_next where id=p_unit_id;
 insert into wc_order_activity(order_id,production_unit_id,activity_type,old_status,new_status,created_by)
 values(p_order_id,p_unit_id,'status_change',previous,p_next,p_actor::text) returning to_jsonb(wc_order_activity.*) into activity;
 return activity;
end $$;

revoke all on function public.wc_assert_delivery_context(uuid,timestamptz,jsonb,jsonb,timestamptz),
 public.wc_approve_delivery_without_quote(uuid,uuid,text,text,bigint,timestamptz,jsonb,jsonb,timestamptz),
 public.wc_set_reviewed_production_status(uuid,uuid,text,uuid,text,timestamptz,jsonb,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.wc_approve_delivery_without_quote(uuid,uuid,text,text,bigint,timestamptz,jsonb,jsonb,timestamptz),
 public.wc_set_reviewed_production_status(uuid,uuid,text,uuid,text,timestamptz,jsonb,jsonb,timestamptz) to service_role;

-- Explicit packaging confirmation reopens only the original, unattempted estimate.
create or replace function public.wc_save_delivery_packages(p_order_id uuid,p_packages jsonb,p_signature text,p_actor uuid,p_save_profile boolean,p_order_updated_at timestamptz,p_items jsonb)
returns void language plpgsql security definer set search_path=public as $$
begin
 perform 1 from wc_orders where id=p_order_id and updated_at=p_order_updated_at for update;
 if not found or (select jsonb_agg(to_jsonb(i) order by i.id) from wc_order_items i where order_id=p_order_id) is distinct from (select jsonb_agg(e order by e->>'id') from jsonb_array_elements(p_items) e) then raise exception 'Order changed; reload packaging'; end if;
 if jsonb_typeof(p_packages)<>'array' or jsonb_array_length(p_packages)=0 then raise exception 'Packages required'; end if;
 update wc_delivery_reviews set packages=p_packages,state='pending',error=null,updated_at=now()
 where order_id=p_order_id and quote_attempted_at is null and token is null and state in ('pending','packaging_required','legacy_packaging_required','address_required','approved_without_quote');
 if not found then raise exception 'Calculation already started or packaging is locked'; end if;
 if p_save_profile then
 insert into wc_delivery_packaging_profiles(signature,packages,created_by) values(p_signature,p_packages,p_actor)
 on conflict(signature) do update set packages=excluded.packages,created_by=excluded.created_by,updated_at=now();
 end if;
end $$;
