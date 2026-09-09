-- Explicit corrected estimates retain previous attempts; no automatic reset/backfill.
alter table public.wc_delivery_reviews add column attempt_history jsonb not null default '[]'
 check (jsonb_typeof(attempt_history)='array');

create function public.wc_requote_delivery_packages(p_order_id uuid,p_packages jsonb,p_signature text,p_actor uuid,p_save_profile boolean,p_order_updated_at timestamptz,p_items jsonb,p_review_updated_at timestamptz)
returns void language plpgsql security definer set search_path=public as $$
declare r wc_delivery_reviews;
begin
 perform 1 from wc_orders where id=p_order_id and updated_at=p_order_updated_at for update;
 if not found or (select jsonb_agg(to_jsonb(i) order by i.id) from wc_order_items i where order_id=p_order_id) is distinct from (select jsonb_agg(e order by e->>'id') from jsonb_array_elements(p_items) e) then raise exception 'Order changed; reload packaging'; end if;
 select * into r from wc_delivery_reviews where order_id=p_order_id for update;
 if not found or r.updated_at is distinct from p_review_updated_at or r.token is not null or r.state not in ('failed','quoted','uncertain') then raise exception 'Review changed or calculation in progress; reload'; end if;
 if p_actor is null or jsonb_typeof(p_packages) is distinct from 'array' or jsonb_array_length(p_packages)=0 then raise exception 'Actor and packages required'; end if;
 update wc_delivery_reviews set
 attempt_history=attempt_history||jsonb_build_array((to_jsonb(r)-'attempt_history')||jsonb_build_object('superseded_at',clock_timestamp(),'superseded_by',p_actor)),
 packages=p_packages,state='pending',input_key=null,snapshot=null,request=null,response=null,
 insurance_response=null,evaluated_quotes='[]',quote_attempted_at=null,quoted_at=null,error=null,
 token=null,started_at=null,approval=null,updated_at=clock_timestamp()
 where order_id=p_order_id;
 if p_save_profile then
 insert into wc_delivery_packaging_profiles(signature,packages,created_by) values(p_signature,p_packages,p_actor)
 on conflict(signature) do update set packages=excluded.packages,created_by=excluded.created_by,updated_at=clock_timestamp();
 end if;
end $$;
revoke all on function public.wc_requote_delivery_packages(uuid,jsonb,text,uuid,boolean,timestamptz,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.wc_requote_delivery_packages(uuid,jsonb,text,uuid,boolean,timestamptz,jsonb,timestamptz) to service_role;
