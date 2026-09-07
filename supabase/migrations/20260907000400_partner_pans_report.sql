-- Local partner dispatch tracking only. No order updates or external calls.
create table public.wc_partner_pans (
 order_item_id uuid primary key references public.wc_order_items(id) on delete cascade,
 selection_key text not null,
 status text not null check(status in ('pending','ordered_and_sent')),
 updated_at timestamptz not null default now(),
 updated_by uuid not null,
 history jsonb not null default '[]'::jsonb check(jsonb_typeof(history)='array')
);
alter table public.wc_partner_pans enable row level security;
create policy partner_pans_read on public.wc_partner_pans for select to authenticated using(true);
revoke all on public.wc_partner_pans from public,anon,authenticated;
grant select on public.wc_partner_pans to authenticated;

create function public.wc_set_partner_pans_status(p_item_id uuid,p_source jsonb,p_selection_key text,p_status text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); source jsonb; result wc_partner_pans; event jsonb;
begin
 if actor is null then raise exception 'Authentication required'; end if;
 if p_status is null or p_status not in ('pending','ordered_and_sent') or p_selection_key is null or length(p_selection_key)>10000 then raise exception 'Invalid Pans status'; end if;
 select to_jsonb(i) into source from wc_order_items i join wc_orders o on o.id=i.order_id
 where i.id=p_item_id and not o.is_hidden and o.order_number::text<>'10242' for update of i;
 if not found or source is distinct from p_source then raise exception 'Order item changed; refresh the report'; end if;
 select * into result from wc_partner_pans where order_item_id=p_item_id for update;
 if found and result.selection_key=p_selection_key and result.status=p_status then return to_jsonb(result); end if;
 event=jsonb_build_object('status',p_status,'selection_key',p_selection_key,'at',now(),'actor',actor);
 insert into wc_partner_pans(order_item_id,selection_key,status,updated_by,history)
 values(p_item_id,p_selection_key,p_status,actor,jsonb_build_array(event))
 on conflict(order_item_id) do update set selection_key=excluded.selection_key,status=excluded.status,
 updated_by=actor,updated_at=now(),history=wc_partner_pans.history||jsonb_build_array(event)
 returning * into result;
 return to_jsonb(result);
end $$;
revoke all on function public.wc_set_partner_pans_status(uuid,jsonb,text,text) from public,anon;
grant execute on function public.wc_set_partner_pans_status(uuid,jsonb,text,text) to authenticated;
