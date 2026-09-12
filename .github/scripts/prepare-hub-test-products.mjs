// Generate transactional SQL for explicit execution in the owner's SQL Editor.
import {readFile} from 'node:fs/promises';
const version='20260912000300';
const migration=await readFile(`supabase/migrations/${version}_hub_test_products_catalog.sql`,'utf8');
const literal="'"+migration.replaceAll("'","''")+"'";
console.log(`begin;
select pg_advisory_xact_lock(${version});
do $release$ begin
 if not exists(select 1 from supabase_migrations.schema_migrations where version='20260912000200') then raise exception 'Hub test orders prerequisite missing';end if;
 if not exists(select 1 from supabase_migrations.schema_migrations where version='${version}') then
  execute ${literal};
  insert into supabase_migrations.schema_migrations(version,statements,name) values('${version}',array[${literal}],'hub_test_products_catalog');
 end if;
end $release$;
do $verify$ begin
 if (select count(*) from wc_shipping_products where wix_product_id is null and active and product_name in ('TEST Backdrop','TEST Cart'))<>2 then raise exception 'Hub test product verification failed';end if;
end $verify$;
commit;
select product_name,product_type,wix_product_id,active,notes from wc_shipping_products where product_name in ('TEST Backdrop','TEST Cart') order by product_name;`);
