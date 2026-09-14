-- An explicit zero Sanding estimate for every saved part means that the stage is absent.
-- Missing estimates remain unknown and conservatively keep Sanding in the route.
create or replace function public.wc_shop_status_guard() returns trigger language plpgsql security definer set search_path=public as $$
declare u wc_shop_units; previous text; expected_next text; sanding_required boolean;
begin
 if new.production_status is not distinct from old.production_status then return new;end if;
 select * into u from wc_shop_units where unit_id=new.id;
 if (new.production_status='CNC' or old.production_status='New') and not found then raise exception 'Add and assign product parts in Shop Floor before CNC';end if;
 -- Legacy units remain usable until explicitly enrolled. Never rewrite existing production history.
 if u.unit_id is null then return new;end if;
 previous=old.production_status;
 if new.production_status='Painting' and u.finish='raw' then raise exception 'RAW skips Painting';end if;
 select exists(
  select 1 from jsonb_array_elements(u.parts) part
  where not (u.estimates ? ('Sanding:'||(part->>'id')))
   or (u.estimates->>('Sanding:'||(part->>'id')))::numeric<>0
 ) into sanding_required;
 expected_next=case previous
  when 'New' then 'CNC'
  when 'CNC' then 'Assembly'
  when 'Assembly' then case when sanding_required then 'Sanding' when u.finish='raw' then 'Packing' else 'Painting' end
  when 'Sanding' then case u.finish when 'raw' then 'Packing' else 'Painting' end
  when 'Painting' then 'Packing'
  when 'Packing' then 'Ready'
 end;
 if array_position(array['New','CNC','Assembly','Sanding','Painting','Packing','Ready'],new.production_status) > array_position(array['New','CNC','Assembly','Sanding','Painting','Packing','Ready'],previous) then
  if new.production_status is distinct from expected_next then raise exception 'Complete the next production stage in order';end if;
  if previous in ('CNC','Assembly','Sanding','Painting') and not (previous||':finished'=any(u.completed)) then raise exception 'Finish the current stage in Shop Floor first';end if;
 end if;
 return new;
end $$;
