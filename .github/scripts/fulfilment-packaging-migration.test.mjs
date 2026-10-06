// Isolated PostgreSQL: no production payloads or courier requests.
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const {PGlite}=await import(pathToFileURL(path.resolve(process.argv[2])).href);
const db=new PGlite();
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
try{
 await db.exec(`
 create role anon; create role authenticated;
 create function public.wc_require_hub_member(p_manager boolean default false) returns void language plpgsql as $$
 begin if current_setting('test.member',true) is distinct from 'true' then raise exception 'Active Hub membership required'; end if; end $$;
 create table wc_orders(id uuid primary key);
 create table wc_order_items(id uuid primary key,order_id uuid,quantity integer);
 create table wc_fulfilment(id uuid primary key,order_id uuid,route text,status text);
 create table wc_shipments(id uuid primary key,fulfilment_id uuid,order_id uuid,status text,updated_at timestamptz,
 packages_approved_at timestamptz,courier_provider text,courier_order_id text,quote_request jsonb,courier_quotes jsonb,
 quoted_at timestamptz,selected_quote_id text,selected_quote jsonb);
 create table wc_shipment_packages(id uuid default gen_random_uuid() primary key,shipment_id uuid,package_no integer,
 package_name text check(package_name<>'FAIL'),length_mm numeric,width_mm numeric,height_mm numeric,weight_kg numeric,contents jsonb,source_type text,
 unique(shipment_id,package_no));
 create table wc_courier_booking_attempts(courier_order_id text,attempted_at timestamptz,details_saved boolean);
 insert into wc_orders values('${id(1)}');
 insert into wc_order_items values('${id(2)}','${id(1)}',1);
 insert into wc_fulfilment values('${id(3)}','${id(1)}','Shipping','Shipping Preparation');
 insert into wc_shipments(id,fulfilment_id,order_id,status,updated_at,courier_order_id,selected_quote_id,packages_approved_at)
 values('${id(4)}','${id(3)}','${id(1)}','Quote Selected',now(),'draft','quote',now());
 insert into wc_shipment_packages(shipment_id,package_no,package_name) values('${id(4)}',1,'Old box');
 `);
 const guard=await readFile('supabase/migrations/20260929000200_server_action_state.sql','utf8');
 await db.exec(guard.slice(guard.indexOf('create function public.wc_invalidate_shipment_packing()')).replace(/commit;\s*$/,''));
 await db.exec(await readFile('supabase/migrations/20261006000500_fulfilment_recalculate_packages.sql','utf8'));
 const version=async()=>String((await db.query('select updated_at::text as v from wc_shipments')).rows[0].v);
 const box={package_name:'Product box',length_mm:500,width_mm:400,height_mm:100,weight_kg:10,contents:[{order_item_id:id(2),unit_index:1,component_key:'main'}]};
 const replace=(boxes,v)=>db.query('select wc_replace_shipment_packages($1,$2,$3) as result',[id(4),v,JSON.stringify(boxes)]);
 const original=await version();
 await db.exec('set role anon');
 await assert.rejects(()=>replace([box],original),/permission denied/);
 await db.exec('set role authenticated');
 await assert.rejects(()=>replace([box],original),/Active Hub membership/);
 await db.exec("set test.member='true'");
 await assert.rejects(()=>replace([],original),/1 to 500/);
 await assert.rejects(()=>replace([{...box,weight_kg:0}],original),/dimensions, weight/);
 await assert.rejects(()=>replace([{...box,contents:[{order_item_id:id(99)}]}],original),/contents changed/);
 await assert.rejects(()=>replace([{...box,package_name:'FAIL'}],original),/check constraint/);
 await db.exec('reset role');
 assert.equal((await db.query('select package_name from wc_shipment_packages')).rows[0].package_name,'Old box');
 assert.equal(await version(),original);
 await db.exec("insert into wc_courier_booking_attempts values('draft',now(),true); set role authenticated");
 await assert.rejects(()=>replace([box],original),/Booking is in progress/);
 await db.exec('reset role; delete from wc_courier_booking_attempts; set role authenticated');
 const {rows}=await replace([box],original);
 assert.equal(rows[0].result.shipment.status,'Packaging Review');
 assert.equal(rows[0].result.shipment.courier_order_id,null);
 assert.equal(rows[0].result.shipment.packages_approved_at,null);
 assert.equal(rows[0].result.packages.length,1);
 assert.equal(rows[0].result.packages[0].package_name,'Product box');
 await assert.rejects(()=>replace([box],original),/Shipment changed/);
 await db.exec("reset role; update wc_shipments set status='Shipping Booked'; set role authenticated");
 await assert.rejects(()=>replace([box],original),/Only an open delivery/);
 console.log('Atomic packaging replacement, rollback, version, membership and booking guards passed');
}finally{await db.close();}
