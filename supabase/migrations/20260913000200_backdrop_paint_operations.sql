-- Snapshot the paint route per production unit. Preserve work already started.
alter table public.wc_shop_units add column paint_operations text[] not null
 default array['First primer','First sanding','Second primer','Second sanding','Finish coat']
 check(paint_operations = array['First primer','First sanding','Second primer','Second sanding','Finish coat']
 or paint_operations = array['First primer','First sanding','Finish coat']);

create function public.wc_shop_product_paint_operations(p_unit uuid,p_template uuid)
returns text[] language sql stable security definer set search_path=public as $$
 select case when coalesce(product.product_name,item.product_name,'') ~* 'backdrop'
 then array['First primer','First sanding','Finish coat']
 else array['First primer','First sanding','Second primer','Second sanding','Finish coat'] end
 from wc_production_units unit
 left join wc_order_items item on item.id=unit.order_item_id
 left join wc_shop_templates template on template.id=p_template
 left join wc_shipping_products product on product.id=template.product_id
 where unit.id=p_unit
$$;
revoke all on function public.wc_shop_product_paint_operations(uuid,uuid) from public,anon,authenticated;

update public.wc_shop_units unit set paint_operations=wc_shop_product_paint_operations(unit.unit_id,unit.template_id)
where not exists(select 1 from wc_shop_intervals work where work.unit_id=unit.unit_id and work.stage='Painting')
and not exists(select 1 from unnest(unit.completed) completed where completed like 'Painting:%');

create function public.wc_shop_snapshot_paint_operations()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='INSERT' or new.template_id is distinct from old.template_id then
  new.paint_operations=wc_shop_product_paint_operations(new.unit_id,new.template_id);
 end if;
 return new;
end $$;
revoke all on function public.wc_shop_snapshot_paint_operations() from public,anon,authenticated;
create trigger wc_shop_snapshot_paint_operations before insert or update of template_id on public.wc_shop_units
for each row execute function public.wc_shop_snapshot_paint_operations();

create or replace function public.wc_shop_command(p_id uuid,p_action text,p jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); s wc_shop_shifts; i wc_shop_intervals; u wc_shop_units; t wc_shop_templates;
 at_time timestamptz; stop_time timestamptz; begin_time timestamptz; unit uuid; stage text; op text; part text; key text; required text;
 sequence text[]:=array['First primer','First sanding','Second primer','Second sanding','Finish coat']; result jsonb; old_value jsonb;
begin
 if actor is null then raise exception 'Sign in required';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 select c.result into result from wc_shop_commands c where c.id=p_id and c.worker_id=actor;
 if found then return result;end if;
 at_time=coalesce((p->>'at')::timestamptz,clock_timestamp());
 if at_time>clock_timestamp()+interval '2 minutes' then raise exception 'Time cannot be in the future';end if;
 select * into s from wc_shop_shifts where worker_id=actor and ended_at is null for update;
 select * into i from wc_shop_intervals where worker_id=actor and ended_at is null for update;
 if p_action in ('shift-start','start','pause','finish-operation','finish-stage','shift-end') and p ? 'expectedActiveStart'
 and i.started_at is distinct from (p->>'expectedActiveStart')::timestamptz then raise exception 'Timer changed on another device. Reload and review queued actions';end if;
 if i.id is not null and at_time<i.started_at then raise exception 'Time precedes the current task; reload or correct the shift';end if;
 if p_action='template' then
  perform wc_shop_validate_parts(p->'parts',coalesce(p->'estimates','{}'));
  if p->>'id' is null then
   insert into wc_shop_templates(name,parts,estimates) values(p->>'name',p->'parts',coalesce(p->'estimates','{}')) returning to_jsonb(wc_shop_templates.*) into result;
  else
   update wc_shop_templates set name=p->>'name',parts=p->'parts',estimates=coalesce(p->'estimates','{}'),version=version+1 where id=(p->>'id')::uuid and version=(p->>'version')::integer returning to_jsonb(wc_shop_templates.*) into result;
   if not found then raise exception 'Template changed. Reload before editing';end if;
  end if;
 elsif p_action='assign' then
  unit=(p->>'unitId')::uuid;
  perform 1 from wc_production_units where id=unit for update;
  select * into t from wc_shop_templates where id=(p->>'templateId')::uuid;
  if t.id is null then raise exception 'Select a saved parts template';end if;
  perform wc_shop_validate_parts(t.parts,t.estimates);
  if exists(select 1 from wc_shop_intervals where unit_id=unit) then raise exception 'Work has started. Its parts snapshot must be preserved';end if;
  insert into wc_shop_units(unit_id,template_id,parts,estimates,finish) values(unit,t.id,t.parts,t.estimates,p->>'finish')
  on conflict(unit_id) do update set template_id=excluded.template_id,parts=excluded.parts,estimates=excluded.estimates,finish=excluded.finish;
 elsif p_action='shift-start' then
  if s.id is not null then raise exception 'Close or correct the previous shift first';end if;
  if exists(select 1 from wc_shop_shifts where worker_id=actor and ended_at>at_time) then raise exception 'Shift overlaps a previous shift';end if;
  insert into wc_shop_shifts(worker_id,started_at) values(actor,at_time) returning * into s;
  insert into wc_shop_intervals(shift_id,worker_id,stage,operation,started_at) values(s.id,actor,'Pause','Pause',at_time);
 elsif p_action in ('start','pause','finish-operation','finish-stage','shift-end') then
  if s.id is null then raise exception 'Start shift first';end if;
  if at_time<s.started_at then raise exception 'Time precedes the shift';end if;
  if p_action='start' then
   unit=nullif(p->>'unitId','')::uuid;stage=p->>'stage';op=p->>'operation';part=nullif(p->>'partId','');
   if stage='Other' then
    if unit is not null or op not in ('Cleaning','Design','Administration','Development','Rest') or part is not null then raise exception 'Choose an Other activity';end if;
   else
    select * into u from wc_shop_units where unit_id=unit for update; sequence=u.paint_operations;
    if u.unit_id is null then raise exception 'Assign a parts template first';end if;
    if not exists(select 1 from wc_production_units where id=unit and production_status=stage) then raise exception 'Production stage changed. Reload';end if;
    if stage not in ('CNC','Assembly','Sanding','Painting') or stage||':finished'=any(u.completed) then raise exception 'This stage is not available for work';end if;
    if stage in ('Assembly','Sanding') then
     if part is null or not exists(select 1 from jsonb_array_elements(u.parts) x where x->>'id'=part) then raise exception 'Choose a part';end if;
     op=stage;key=stage||':'||part;
    else
     if part is not null then raise exception 'This stage tracks the whole product';end if;
     if stage='CNC' then op='CNC';else
      if op is null or (op<>all(sequence) and op<>'Repaint') then raise exception 'Choose a painting operation';end if;
      if op<>'Repaint' then
       foreach required in array sequence loop
        exit when required=op;
        if not ('Painting:'||required=any(u.completed)) then raise exception 'Finish the previous painting operation first';end if;
       end loop;
      end if;
     end if;
     key=stage||':'||op;
    end if;
    if op<>'Repaint' and key=any(u.completed) then raise exception 'This operation is already complete';end if;
   end if;
  elsif p_action in ('finish-operation','finish-stage') then
   if i.id is null or i.stage='Pause' then raise exception 'Resume the task before finishing';end if;
   if i.unit_id is not null then
    select * into u from wc_shop_units where unit_id=i.unit_id for update; sequence=u.paint_operations;
    if not exists(select 1 from wc_production_units where id=i.unit_id and production_status=i.stage) then raise exception 'Stage changed. Pause and reload';end if;
    key=i.stage||':'||coalesce(i.part_id,i.operation);
    if not key=any(u.completed) then u.completed=array_append(u.completed,key);end if;
    if i.stage in ('Assembly','Sanding') and not exists(select 1 from jsonb_array_elements(u.parts) x where not(i.stage||':'||(x->>'id')=any(u.completed))) then u.completed=array_append(u.completed,i.stage||':finished');end if;
    if p_action='finish-stage' then
     if i.stage='Painting' then
      foreach required in array sequence loop
       if not('Painting:'||required=any(u.completed)) then raise exception 'Complete all required painting operations first';end if;
      end loop;
     elsif i.stage<>'CNC' then raise exception 'Finish each part to complete this stage';end if;
     u.completed=array_append(u.completed,i.stage||':finished');
    end if;
    update wc_shop_units set completed=u.completed where unit_id=u.unit_id;
   end if;
  end if;
  update wc_shop_intervals set ended_at=at_time where id=i.id;
  if p_action='shift-end' then update wc_shop_shifts set ended_at=at_time where id=s.id;
  elsif p_action='start' then
   insert into wc_shop_intervals(shift_id,worker_id,unit_id,stage,operation,part_id,started_at) values(s.id,actor,unit,stage,op,part,at_time);
  else insert into wc_shop_intervals(shift_id,worker_id,stage,operation,started_at) values(s.id,actor,'Pause','Pause',at_time);
  end if;
 elsif p_action='finish-painting' then
  unit=(p->>'unitId')::uuid;
  select * into u from wc_shop_units where unit_id=unit for update; sequence=u.paint_operations;
  if u.unit_id is null or not exists(select 1 from wc_production_units where id=unit and production_status='Painting') then raise exception 'Select a Painting product';end if;
  foreach required in array sequence loop
   if not('Painting:'||required=any(u.completed)) then raise exception 'Complete all required painting operations first';end if;
  end loop;
  if exists(select 1 from wc_shop_intervals where unit_id=unit and ended_at is null) then raise exception 'Finish or pause the current operation first';end if;
  update wc_shop_units set completed=array_append(completed,'Painting:finished') where unit_id=unit;
 elsif p_action='edit-interval' then
  select * into i from wc_shop_intervals where id=(p->>'id')::uuid and worker_id=actor for update;
  if i.id is null then raise exception 'Record not found';end if;
  select * into s from wc_shop_shifts where id=i.shift_id;
  begin_time=(p->>'start')::timestamptz;stop_time=(p->>'end')::timestamptz;
  if begin_time is null or stop_time is null or stop_time<begin_time or begin_time<s.started_at or stop_time>coalesce(s.ended_at,clock_timestamp()) then raise exception 'Use valid times inside the shift';end if;
  if exists(select 1 from wc_shop_intervals x where x.shift_id=s.id and x.id<>i.id and x.started_at<stop_time and coalesce(x.ended_at,clock_timestamp())>begin_time) then raise exception 'This edit overlaps another activity';end if;
  old_value=to_jsonb(i);
  update wc_shop_intervals set started_at=begin_time,ended_at=stop_time where id=i.id returning to_jsonb(wc_shop_intervals.*) into result;
  insert into wc_shop_audit(worker_id,action,before_value,after_value) values(actor,p_action,old_value,result);
 elsif p_action='edit-shift' then
  select * into s from wc_shop_shifts where id=(p->>'id')::uuid and worker_id=actor for update;
  if s.id is null then raise exception 'Shift not found';end if;
  begin_time=(p->>'start')::timestamptz;stop_time=(p->>'end')::timestamptz;
  if begin_time is null or stop_time is null or stop_time<begin_time or stop_time>clock_timestamp() then raise exception 'Use valid shift times';end if;
  if exists(select 1 from wc_shop_shifts x where x.worker_id=actor and x.id<>s.id and x.started_at<stop_time and coalesce(x.ended_at,clock_timestamp())>begin_time) then raise exception 'Shift overlaps another shift';end if;
  if exists(select 1 from wc_shop_intervals x where x.shift_id=s.id and (x.started_at<begin_time or x.started_at>stop_time or (x.ended_at is not null and x.ended_at>stop_time))) then raise exception 'Correct activity times before shortening this shift';end if;
  old_value=to_jsonb(s);
  update wc_shop_intervals set ended_at=stop_time where shift_id=s.id and ended_at is null;
  update wc_shop_shifts set started_at=begin_time,ended_at=stop_time where id=s.id returning to_jsonb(wc_shop_shifts.*) into result;
  insert into wc_shop_audit(worker_id,action,before_value,after_value) values(actor,p_action,old_value,result);
 else raise exception 'Unknown shop action';end if;
 result=coalesce(result,'{"ok":true}'::jsonb);
 insert into wc_shop_commands(id,worker_id,result) values(p_id,actor,result);
 return result;
end $$;
