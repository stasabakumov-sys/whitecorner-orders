-- Add a production stage without changing current units or status-change guards.
alter table public.wc_production_units drop constraint wc_production_units_production_status_check;
alter table public.wc_production_units add constraint wc_production_units_production_status_check
  check (production_status in ('New','CNC','Assembly','Sanding','Painting','Packing','Ready'));
create or replace function public.wc_set_reviewed_production_status(p_order_id uuid,p_unit_id uuid,p_next text,p_actor uuid,p_decision text,
 p_order_version timestamptz,p_items jsonb,p_rules jsonb,p_review_version timestamptz)
returns jsonb language plpgsql security definer set search_path=public as $$
declare previous text; activity jsonb;
begin
 if p_actor is null or p_decision is null or p_decision not in ('not_required','ready_exemption','within_target','approved_exception','approved_without_quote')
  or p_next is null or p_next not in ('New','CNC','Assembly','Sanding','Painting','Packing','Ready') then raise exception 'Delivery decision required'; end if;
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
