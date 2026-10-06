// Isolated PostgreSQL rehearsal; uses synthetic orders and no production credentials.
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const {PGlite}=await import(pathToFileURL(path.resolve(process.argv[2])).href);
const db=new PGlite();
const first='11111111-1111-4111-8111-111111111111';
const second='22222222-2222-4222-8222-222222222222';
try{
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('test.actor',true),'')::uuid $$;
    create function public.wc_require_hub_member(p_manager boolean default false)
      returns void language plpgsql as $$ begin
        if auth.uid() is null then raise exception 'Active Hub membership required'; end if;
        if p_manager and current_setting('test.manager',true) is distinct from 'true'
          then raise exception 'Manager access required'; end if;
      end $$;
    create table public.wc_orders(id uuid primary key,order_number text,customer_name text,fulfillment_status text);
    create table public.wc_fulfilment(id uuid primary key,order_id uuid unique references public.wc_orders(id),
      route text,status text,shipping_booked_at timestamptz,fulfilled_at timestamptz,updated_at timestamptz);
    create table public.wc_shipments(id uuid primary key,order_id uuid references public.wc_orders(id),
      status text,courier_order_id text);
    create table public.wc_shipping_fulfillment_sync(order_id uuid primary key references public.wc_orders(id));
    create table public.wc_order_activity(id bigserial primary key,order_id uuid references public.wc_orders(id),
      activity_type text,message text,created_by text);
    insert into public.wc_orders values('${first}','10821','Lucee Holland','NOT_FULFILLED'),
      ('${second}','10822','Other customer','NOT_FULFILLED');
    insert into public.wc_fulfilment values
      ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','${first}','Shipping','Shipping Preparation',null,null,now()),
      ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','${second}','Shipping','Shipping Preparation',null,null,now());
    insert into public.wc_shipments values
      ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','${first}','Packaging Review',null),
      ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','${second}','Shipping Booked','courier-draft');
  `);
  await db.exec(await readFile('supabase/migrations/20261006000100_manual_fast_courier_fulfilment.sql','utf8'));
  await db.exec(`set role authenticated; set test.actor='99999999-9999-4999-8999-999999999999'; set test.manager='false';`);
  await assert.rejects(()=>db.query('select public.wc_complete_manual_fast_courier($1)',[first]),/Manager access required/);
  await db.exec(`set test.manager='true';`);
  await assert.rejects(()=>db.query('select public.wc_complete_manual_fast_courier($1)',[second]),/Hub courier or Wix sync record/);
  await db.query('select public.wc_complete_manual_fast_courier($1)',[first]);
  await assert.rejects(()=>db.query('select public.wc_complete_manual_fast_courier($1)',[first]),/Only an open delivery/);
  await db.exec('reset role');
  const {rows}=await db.query(`select f.status,f.completion_source,f.shipping_booked_at is null as booking_date_unknown,
    o.fulfillment_status,s.status as shipment_status,
    (select count(*)::int from public.wc_order_activity where order_id=o.id) as activity_count
    from public.wc_orders o join public.wc_fulfilment f on f.order_id=o.id
    join public.wc_shipments s on s.order_id=o.id where o.id=$1`,[first]);
  assert.deepEqual(rows[0],{status:'Fulfilled',completion_source:'manual_fast_courier',booking_date_unknown:true,
    fulfillment_status:'FULFILLED',shipment_status:'Packaging Review',activity_count:1});
  console.log('Manual Fast Courier migration and guarded completion passed');
}finally{await db.close();}
