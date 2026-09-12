// Generate transactional SQL for explicit execution in the owner's SQL Editor.
import {readFile} from 'node:fs/promises';
const version='20260912000500';
const migration=await readFile(`supabase/migrations/${version}_work_rates.sql`,'utf8');
const literal="'"+migration.replaceAll("'","''")+"'";
console.log(`begin;
select pg_advisory_xact_lock(${version});
do $preflight$ begin
 if not exists(select 1 from supabase_migrations.schema_migrations where version='20260912000400') then raise exception 'Product parts prerequisite missing';end if;
 if exists(select 1 from supabase_migrations.schema_migrations where version='${version}') then raise exception 'Work rates migration already applied';end if;
 if to_regclass('public.wc_work_rates') is not null then raise exception 'Unexpected existing work rates table';end if;
end $preflight$;
${migration}
insert into supabase_migrations.schema_migrations(version,statements,name) values('${version}',array[${literal}],'work_rates');
do $verify$ begin
 if (select count(*) from wc_work_rates)<>4 then raise exception 'Work rate directory verification failed';end if;
 if has_function_privilege('anon','public.wc_save_work_rate(text,numeric,timestamptz)','EXECUTE') then raise exception 'Anonymous work rate write access';end if;
 if not has_function_privilege('authenticated','public.wc_save_work_rate(text,numeric,timestamptz)','EXECUTE') then raise exception 'Authenticated work rate save unavailable';end if;
end $verify$;
commit;
select work_type,label,rate_gst_hour from wc_work_rates order by sort_order;`);
