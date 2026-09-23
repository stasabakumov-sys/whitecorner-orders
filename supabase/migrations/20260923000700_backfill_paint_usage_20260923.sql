-- Owner-reported paint usage for completed Shop Floor intervals on 23 Sep 2026 (Brisbane time).
-- Match order, product, operation and both displayed minute boundaries before changing any row.
do $backfill$
declare
  entry record;
  matching_ids uuid[];
  old_row jsonb;
  new_row jsonb;
begin
  for entry in
    select * from (values
      ('10824', 'MDF Mobile Bar Cart with Decorative Wheels%', 'Finish coat',
       '2026-09-23 19:10:00+10'::timestamptz, '2026-09-23 19:31:00+10'::timestamptz, 650::numeric),
      ('10831', 'Collapsible Tiramisu Dessert Cart%', 'First primer',
       '2026-09-23 18:44:00+10'::timestamptz, '2026-09-23 19:01:00+10'::timestamptz, 900::numeric),
      ('10825', 'MDF Mobile Bar Cart with Decorative Wheels%', 'First primer',
       '2026-09-23 18:14:00+10'::timestamptz, '2026-09-23 18:32:00+10'::timestamptz, 1450::numeric)
    ) as reported(order_number, product_pattern, operation, started_minute, ended_minute, volume_ml)
  loop
    select array_agg(work.id) into matching_ids
    from public.wc_shop_intervals work
    join public.wc_production_units unit on unit.id = work.unit_id
    join public.wc_order_items item on item.id = unit.order_item_id
    join public.wc_orders ord on ord.id = item.order_id
    where ord.order_number = entry.order_number
      and item.product_name like entry.product_pattern
      and work.stage = 'Painting'
      and work.operation = entry.operation
      and work.started_at >= entry.started_minute
      and work.started_at < entry.started_minute + interval '1 minute'
      and work.ended_at >= entry.ended_minute
      and work.ended_at < entry.ended_minute + interval '1 minute';

    if coalesce(array_length(matching_ids, 1), 0) <> 1 then
      raise exception 'Expected exactly one completed paint interval for order %, operation %, found %',
        entry.order_number, entry.operation, coalesce(array_length(matching_ids, 1), 0);
    end if;

    select to_jsonb(work) into old_row
    from public.wc_shop_intervals work where work.id = matching_ids[1] for update;
    if (old_row->>'paint_volume_ml')::numeric is not null then
      if (old_row->>'paint_volume_ml')::numeric <> entry.volume_ml then
        raise exception 'Paint volume already differs for order %, operation %', entry.order_number, entry.operation;
      end if;
      continue;
    end if;

    update public.wc_shop_intervals
    set paint_volume_ml = entry.volume_ml
    where id = matching_ids[1]
    returning to_jsonb(wc_shop_intervals) into new_row;

    insert into public.wc_shop_audit(worker_id, action, before_value, after_value)
    values ((new_row->>'worker_id')::uuid, 'Backfill paint volume', old_row, new_row);
  end loop;
end
$backfill$;
