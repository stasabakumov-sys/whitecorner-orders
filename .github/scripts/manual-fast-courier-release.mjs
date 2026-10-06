import {readFile} from 'node:fs/promises';

const mode=process.argv[2];
if(!['--verify','--apply','--complete-10821'].includes(mode))throw Error('Use --verify, --apply or --complete-10821');
const token=process.env.SUPABASE_ACCESS_TOKEN;
if(!token)throw Error('SUPABASE_ACCESS_TOKEN is required');

const project='zgvnrpspwluapaxnycrg';
const version='20261006000100';
const name='manual_fast_courier_fulfilment';
const source=(await readFile(`supabase/migrations/${version}_${name}.sql`,'utf8')).replaceAll('\r','');
const quote=value=>`'${value.replaceAll("'","''")}'`;

async function query(sql,readOnly=true){
  const response=await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`,{
    method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify({query:sql,read_only:readOnly}),
  });
  if(!response.ok)throw Error(`Production query failed with HTTP ${response.status}`);
  return response.json();
}

const [before]=await query(`select
  to_regclass('public.wc_orders') is not null as orders_ready,
  to_regclass('public.wc_fulfilment') is not null as fulfilment_ready,
  to_regclass('public.wc_shipments') is not null as shipments_ready,
  to_regclass('public.wc_shipping_fulfillment_sync') is not null as sync_ready,
  to_regprocedure('public.wc_require_hub_member(boolean)') is not null as member_gate_ready,
  exists(select 1 from supabase_migrations.schema_migrations where version='${version}') as registered;`);
if(!before||Object.entries(before).some(([key,value])=>key!=='registered'&&value!==true))throw Error('Production prerequisites differ');
const [state]=await query(`select
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='wc_fulfilment' and column_name='completion_source') as column_ready,
  to_regprocedure('public.wc_complete_manual_fast_courier(uuid)') is not null as function_ready;`);
if(before.registered!==state.column_ready||before.registered!==state.function_ready)throw Error('Migration history and schema disagree');
if(before.registered){
  const [match]=await query(`select replace(statements[1],E'\\r','')=${quote(source)} as source_matches
    from supabase_migrations.schema_migrations where version='${version}';`);
  if(!match?.source_matches)throw Error('Registered migration differs from reviewed source');
}

const [order]=await query(`select
  count(*)::int as matches,
  coalesce(bool_and(customer_name='Lucee Holland'),false) as customer_matches,
  coalesce(bool_and(f.route='Shipping'),false) as shipping_route,
  coalesce(bool_and(f.status='Shipping Preparation'),false) as open_fulfilment,
  coalesce(bool_and(s.courier_order_id is null and coalesce(s.status,'Packaging Review') not in ('Shipping Booked','In Transit','Delivered')),false) as no_hub_booking,
  coalesce(bool_and(y.order_id is null),false) as no_wix_sync,
  coalesce(bool_and(o.fulfillment_status is distinct from 'FULFILLED'),false) as locally_open
  from public.wc_orders o
  left join public.wc_fulfilment f on f.order_id=o.id
  left join public.wc_shipments s on s.order_id=o.id
  left join public.wc_shipping_fulfillment_sync y on y.order_id=o.id
  where o.order_number='10821';`);
console.log(JSON.stringify({preflight:'passed',registered:before.registered,order10821:order}));
if(mode==='--verify')process.exit(0);

if(mode==='--apply'&&!before.registered){
  await query(`begin;
    set local lock_timeout='15s';
    set local statement_timeout='120s';
    select pg_advisory_xact_lock(20261006,1);
    ${source}
    insert into supabase_migrations.schema_migrations(version,name,statements)
      values('${version}','${name}',array[${quote(source)}]);
    commit;`,false);
}

const [after]=await query(`select
  exists(select 1 from supabase_migrations.schema_migrations where version='${version}') as registered,
  to_regprocedure('public.wc_complete_manual_fast_courier(uuid)') is not null as function_ready,
  has_function_privilege('authenticated','public.wc_complete_manual_fast_courier(uuid)','execute') as member_execute,
  not has_function_privilege('anon','public.wc_complete_manual_fast_courier(uuid)','execute') as anon_denied,
  position('wc_require_hub_member(true)' in pg_get_functiondef('public.wc_complete_manual_fast_courier(uuid)'::regprocedure))>0 as manager_gate;`);
if(!after||Object.values(after).some(value=>value!==true))throw Error('Production migration postflight failed');
if(mode==='--apply'){console.log(JSON.stringify({release:'migration verified'}));process.exit(0);}

if(order?.matches!==1||!order.customer_matches||!order.shipping_route||!order.open_fulfilment||!order.no_hub_booking||!order.no_wix_sync||!order.locally_open){
  throw Error('Order #10821 differs from the reviewed open delivery; no status changed');
}
await query(`begin;
  set local lock_timeout='15s';
  set local statement_timeout='30s';
  do $complete$ declare target_id uuid; fulfilment_id uuid; begin
    select o.id,f.id into target_id,fulfilment_id from public.wc_orders o
      join public.wc_fulfilment f on f.order_id=o.id
      where o.order_number='10821' and o.customer_name='Lucee Holland'
        and f.route='Shipping' and f.status='Shipping Preparation'
      for update of o,f;
    if target_id is null then raise exception 'Order #10821 changed'; end if;
    if exists(select 1 from public.wc_shipments s where s.order_id=target_id
        and (s.courier_order_id is not null or s.status in ('Shipping Booked','In Transit','Delivered')))
      or exists(select 1 from public.wc_shipping_fulfillment_sync where order_id=target_id)
      then raise exception 'Hub booking or Wix sync now exists'; end if;
    update public.wc_fulfilment set status='Fulfilled',completion_source='manual_fast_courier',
      fulfilled_at=now(),updated_at=now() where id=fulfilment_id;
    update public.wc_orders set fulfillment_status='FULFILLED' where id=target_id;
    insert into public.wc_order_activity(order_id,activity_type,message,created_by)
      values(target_id,'note','Fulfilled in Hub; Fast Courier booked on website. Wix was not updated.','Fulfilment');
  end $complete$;
  commit;`,false);
const [completed]=await query(`select f.status='Fulfilled' and f.completion_source='manual_fast_courier'
  and o.fulfillment_status='FULFILLED' as saved
  from public.wc_orders o join public.wc_fulfilment f on f.order_id=o.id
  where o.order_number='10821';`);
if(!completed?.saved)throw Error('Order #10821 completion could not be verified');
console.log(JSON.stringify({order10821:'fulfilled in Hub; Wix untouched'}));
