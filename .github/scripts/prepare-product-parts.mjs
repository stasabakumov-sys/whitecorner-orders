// Generate transactional SQL for explicit execution in the owner's SQL Editor.
import {readFile} from 'node:fs/promises';
const version='20260912000400';
const migration=await readFile(`supabase/migrations/${version}_product_parts_templates.sql`,'utf8');
const literal="'"+migration.replaceAll("'","''")+"'";
console.log(`begin;
select pg_advisory_xact_lock(${version});
do $release$ begin
 if not exists(select 1 from supabase_migrations.schema_migrations where version='20260912000300') then raise exception 'Hub test products prerequisite missing';end if;
 if not exists(select 1 from supabase_migrations.schema_migrations where version='${version}') then
  execute ${literal};
  insert into supabase_migrations.schema_migrations(version,statements,name) values('${version}',array[${literal}],'product_parts_templates');
 end if;
end $release$;
do $verify$ begin
 if to_regprocedure('public.wc_shop_save_product_template(uuid,uuid,text,jsonb,jsonb,integer)') is null then raise exception 'Product parts save contract missing';end if;
 if has_function_privilege('anon','public.wc_shop_save_product_template(uuid,uuid,text,jsonb,jsonb,integer)','EXECUTE') then raise exception 'Anonymous product parts write access';end if;
 if not has_function_privilege('authenticated','public.wc_shop_save_product_template(uuid,uuid,text,jsonb,jsonb,integer)','EXECUTE') then raise exception 'Authenticated product parts save unavailable';end if;
end $verify$;
commit;
select count(*)::int product_templates from wc_shop_templates where product_id is not null;`);
