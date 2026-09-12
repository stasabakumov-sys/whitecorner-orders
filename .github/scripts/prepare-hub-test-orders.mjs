// Generate reviewable SQL only. Execute explicitly in the owner's SQL Editor.
import {readFile} from 'node:fs/promises';
const version='20260912000200';
const migration=await readFile(`supabase/migrations/${version}_hub_test_orders.sql`,'utf8');
const seed=await readFile('supabase/seeds/shop-floor-test-orders.sql','utf8');
const literal="'"+migration.replaceAll("'","''")+"'";
console.log(`begin;
select pg_advisory_xact_lock(${version});
do $release$ begin
 if not exists(select 1 from supabase_migrations.schema_migrations where version='20260912000100') then raise exception 'Shop Floor prerequisite missing';end if;
 if not exists(select 1 from supabase_migrations.schema_migrations where version='${version}') then
  execute ${literal};
  insert into supabase_migrations.schema_migrations(version,statements,name) values('${version}',array[${literal}],'hub_test_orders');
 end if;
end $release$;
${seed}
do $verify$ begin
 if (select count(*) from wc_orders o join wc_order_items i on i.order_id=o.id join wc_production_units u on u.order_item_id=i.id
 where o.id in ('f076f530-6be8-458b-9606-693e0153c101','f076f530-6be8-458b-9606-693e0153c102')
 and o.order_source='hub_test' and o.wix_order_id is null and o.total=0 and i.quantity=1)<>2 then raise exception 'Test orders verification failed';end if;
end $verify$;
commit;
select o.order_number,o.order_source,o.wix_order_id,i.product_name,i.quantity,u.production_status
from wc_orders o join wc_order_items i on i.order_id=o.id join wc_production_units u on u.order_item_id=i.id
where o.id in ('f076f530-6be8-458b-9606-693e0153c101','f076f530-6be8-458b-9606-693e0153c102') order by o.order_number;`);
