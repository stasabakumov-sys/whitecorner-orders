-- Historical painting intervals remain nullable until their actual usage is supplied.
alter table public.wc_shop_intervals
 add column paint_volume_ml numeric(10,2)
 check (paint_volume_ml > 0 and paint_volume_ml <= 100000);

-- Preserve the existing command implementation, including its idempotency and
-- offline timer checks. The wrapper passes only this command's paint amount to
-- the interval trigger in the same database transaction.
alter function public.wc_shop_command(uuid,text,jsonb) rename to wc_shop_command_core;
revoke all on function public.wc_shop_command_core(uuid,text,jsonb) from public,anon,authenticated;

create function public.wc_shop_record_paint_volume()
returns trigger language plpgsql security definer set search_path=public as $$
declare amount_text text; amount numeric;
begin
 if old.ended_at is null and new.ended_at is not null
    and old.stage='Painting'
    and old.operation in ('First primer','Second primer','Finish coat','Repaint')
    and current_setting('wc.shop_action',true) in ('finish-operation','finish-stage') then
   amount_text=current_setting('wc.paint_volume_ml',true);
   if amount_text is null or amount_text !~ '^[0-9]+(\.[0-9]{1,2})?$' then
     raise exception 'Enter paint used in mL before finishing this operation';
   end if;
   amount=amount_text::numeric;
   if amount<=0 or amount>100000 then
     raise exception 'Paint used must be greater than zero and at most 100000 mL';
   end if;
   new.paint_volume_ml=amount;
 end if;
 return new;
end $$;
revoke all on function public.wc_shop_record_paint_volume() from public,anon,authenticated;
create trigger wc_shop_record_paint_volume before update of ended_at on public.wc_shop_intervals
 for each row execute function public.wc_shop_record_paint_volume();

create function public.wc_shop_command(p_id uuid,p_action text,p jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
 perform set_config('wc.shop_action',coalesce(p_action,''),true);
 perform set_config('wc.paint_volume_ml',coalesce(p->>'paintVolumeMl',''),true);
 return public.wc_shop_command_core(p_id,p_action,p);
end $$;
revoke all on function public.wc_shop_command(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.wc_shop_command(uuid,text,jsonb) to authenticated;
