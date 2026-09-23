import {readFile} from 'node:fs/promises';

const version='20260923000700';
const name='backfill_paint_usage_20260923';
const source=(await readFile(`supabase/migrations/${version}_${name}.sql`,'utf8')).replaceAll('\r','');
const literal=value=>"'"+value.replaceAll("'","''")+"'";
const token=process.env.SUPABASE_ACCESS_TOKEN;
if(!token)throw Error('Supabase access token required');

async function query(statement,read_only){
  const response=await fetch('https://api.supabase.com/v1/projects/zgvnrpspwluapaxnycrg/database/query',{
    method:'POST',
    headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify({query:statement,read_only}),
  });
  if(!response.ok)throw Error(`Production query failed: HTTP ${response.status}: ${(await response.text()).slice(0,500)}`);
  return response.json();
}

const matches=`select ord.order_number, work.operation, count(*)::integer as matching_intervals,
  count(*) filter (where work.paint_volume_ml is null)::integer as without_volume,
  max(work.paint_volume_ml) as recorded_volume_ml
from public.wc_shop_intervals work
join public.wc_production_units unit on unit.id=work.unit_id
join public.wc_order_items item on item.id=unit.order_item_id
join public.wc_orders ord on ord.id=item.order_id
where work.stage='Painting' and (
  (ord.order_number='10824' and item.product_name like 'MDF Mobile Bar Cart with Decorative Wheels%' and work.operation='Finish coat'
    and work.started_at >= '2026-09-23 19:10:00+10' and work.started_at < '2026-09-23 19:11:00+10'
    and work.ended_at >= '2026-09-23 19:31:00+10' and work.ended_at < '2026-09-23 19:32:00+10') or
  (ord.order_number='10831' and item.product_name like 'Collapsible Tiramisu Dessert Cart%' and work.operation='First primer'
    and work.started_at >= '2026-09-23 18:44:00+10' and work.started_at < '2026-09-23 18:45:00+10'
    and work.ended_at >= '2026-09-23 19:01:00+10' and work.ended_at < '2026-09-23 19:02:00+10') or
  (ord.order_number='10825' and item.product_name like 'MDF Mobile Bar Cart with Decorative Wheels%' and work.operation='First primer'
    and work.started_at >= '2026-09-23 18:14:00+10' and work.started_at < '2026-09-23 18:15:00+10'
    and work.ended_at >= '2026-09-23 18:32:00+10' and work.ended_at < '2026-09-23 18:33:00+10')
) group by ord.order_number,work.operation order by ord.order_number;`;
const expected=new Map([['10824/Finish coat',650],['10831/First primer',900],['10825/First primer',1450]]);
function check(rows,after){
  if(rows.length!==expected.size)throw Error(`Expected ${expected.size} unique candidate groups, got ${rows.length}`);
  for(const row of rows){
    const value=expected.get(`${row.order_number}/${row.operation}`);
    if(value===undefined||row.matching_intervals!==1)throw Error(`Candidate mismatch: ${JSON.stringify(row)}`);
    if(after ? Number(row.recorded_volume_ml)!==value : row.without_volume!==1 && Number(row.recorded_volume_ml)!==value)
      throw Error(`Paint volume mismatch: ${JSON.stringify(row)}`);
  }
}

const before=await query(matches,true);
console.log('Candidate counts:',JSON.stringify(before));
check(before,false);
if(process.argv.includes('--verify'))process.exit(0);
if(!process.argv.includes('--apply'))throw Error('Use --verify or --apply');
const quoted=literal(source);
const apply=`begin; select pg_advisory_xact_lock(20260923,5); do $release$ begin
 if not exists(select 1 from supabase_migrations.schema_migrations where version='20260923000400') then raise exception 'Paint volume schema is missing';end if;
 if exists(select 1 from supabase_migrations.schema_migrations where version='${version}') then
  if (select replace(statements[1],E'\\r','') from supabase_migrations.schema_migrations where version='${version}') is distinct from ${quoted}
    then raise exception 'Backfill migration differs from registered version';end if;
 else
  execute ${quoted};
  insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','${name}',array[${quoted}]);
 end if;
end $release$; commit;`;
await query(apply,false);
const after=await query(matches,true);
check(after,true);
console.log('Backfill verified:',JSON.stringify(after));
