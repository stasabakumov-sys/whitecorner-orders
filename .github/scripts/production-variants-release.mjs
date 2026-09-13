import {readFile} from 'node:fs/promises';
const version='20260914000100';
const source=(await readFile(`supabase/migrations/${version}_production_template_variants.sql`,'utf8')).replaceAll('\r','');
const literal="'"+source.replaceAll("'","''")+"'";
const verify=`select exists(select 1 from supabase_migrations.schema_migrations where version='${version}') registered,
 to_regprocedure('public.wc_shop_save_variant_template(uuid,uuid,text,jsonb,jsonb,integer,text,text)') is not null variant_save,
 (select relrowsecurity from pg_class where oid='public.wc_shop_templates'::regclass) template_rls,
 (select count(*)::int from wc_shop_templates where product_id is not null and jsonb_array_length(parts)>0) saved_templates;`;
const sql=`begin;
select pg_advisory_xact_lock(${version});
do $release$ begin
 if to_regprocedure('public.wc_shop_save_product_template(uuid,uuid,text,jsonb,jsonb,integer)') is null then raise exception 'Product templates prerequisite missing';end if;
 if exists(select 1 from supabase_migrations.schema_migrations where version='${version}') then
  if (select replace(statements[1],E'\\r','') from supabase_migrations.schema_migrations where version='${version}') is distinct from replace(${literal},E'\\r','') then raise exception 'Migration differs';end if;
 else
  execute ${literal};
  insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','production_template_variants',array[${literal}]);
 end if;
 if has_function_privilege('anon','public.wc_shop_save_variant_template(uuid,uuid,text,jsonb,jsonb,integer,text,text)','EXECUTE') then raise exception 'Anonymous variant write access';end if;
 if not has_function_privilege('authenticated','public.wc_shop_save_variant_template(uuid,uuid,text,jsonb,jsonb,integer,text,text)','EXECUTE') then raise exception 'Variant save unavailable';end if;
 if not (select relrowsecurity from pg_class where oid='public.wc_shop_templates'::regclass) then raise exception 'Template RLS missing';end if;
end $release$;
commit;
${verify}`;
if(process.argv.includes('--print-sql')){process.stdout.write(sql);process.exit(0);}
const token=process.env.SUPABASE_ACCESS_TOKEN;if(!token)throw Error('Supabase access token required');
async function query(query,read_only){const r=await fetch('https://api.supabase.com/v1/projects/zgvnrpspwluapaxnycrg/database/query',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query,read_only})});if(!r.ok)throw Error(`Production query failed: HTTP ${r.status}`);return r.json();}
console.log('Preflight:',JSON.stringify(await query(verify,true)));
if(process.argv.includes('--apply')){await query(sql,false);const rows=await query(verify,true);if(!rows[0]?.registered||!rows[0]?.variant_save||!rows[0]?.template_rls)throw Error('Postflight failed');console.log('Verified:',JSON.stringify(rows));}
