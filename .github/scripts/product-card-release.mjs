// Targeted, owner-authorised release. No db push and no customer payload logging.
import {readFile} from 'node:fs/promises';
const names=['20260913000100_backdrop_drawing_folding','20260913000200_backdrop_paint_operations'];
const literal=value=>"'"+value.replaceAll("'","''")+"'";
const sources=await Promise.all(names.map(name=>readFile(`supabase/migrations/${name}.sql`,'utf8').then(s=>s.replace(/^\uFEFF/,'').replaceAll('\r',''))));
const original=await readFile('supabase/migrations/20260912000100_shop_floor_tracker.sql','utf8');
const originalCommand=original.slice(original.indexOf('create function public.wc_shop_command('));
const oldBody=originalCommand.slice(originalCommand.indexOf('as $$')+5,originalCommand.indexOf('end $$;')+4).replaceAll('\r','');
const verify=`select
 (select count(*)::int from supabase_migrations.schema_migrations where version in ('20260913000100','20260913000200')) registered,
 exists(select 1 from pg_attribute where attrelid='public.wc_shop_units'::regclass and attname='paint_operations' and not attisdropped) paint_routes,
 to_regprocedure('public.wc_classify_backdrop_box_drawing(text,text,uuid)') is not null classification,
 (select count(*)::int from pg_class where oid in ('public.wc_shop_units'::regclass,'public.wc_backdrop_box_drawings'::regclass) and relrowsecurity) rls_tables,
 has_function_privilege('anon','public.wc_shop_command(uuid,text,jsonb)','EXECUTE') anon_shop_write,
 (select count(*)::int from wc_backdrop_box_drawings where position(':' in size_key)=0) drawings_needing_classification,
 (select count(*)::int from wc_shop_templates t join wc_shipping_products p on p.id=t.product_id where p.short_name='Plane Arch' and jsonb_array_length(t.parts)>0) plane_arch_saved_templates;`;
const sql=`begin;
select pg_advisory_xact_lock(20260913000100);
do $prerequisites$ begin
 if to_regprocedure('public.wc_shop_save_product_template(uuid,uuid,text,jsonb,jsonb,integer)') is null then raise exception 'Product parts prerequisite missing';end if;
 if not exists(select 1 from supabase_migrations.schema_migrations where version='20260913000200')
 and (select replace(prosrc,E'\\r','') from pg_proc where oid='public.wc_shop_command(uuid,text,jsonb)'::regprocedure) is distinct from ${literal(oldBody)} then raise exception 'Shop Floor command differs from reviewed source';end if;
end $prerequisites$;
${names.map((name,i)=>{const version=name.slice(0,14),body=literal(sources[i]);return `do $release$ begin
 if exists(select 1 from supabase_migrations.schema_migrations where version='${version}') then
  if (select replace(statements[1],E'\\r','') from supabase_migrations.schema_migrations where version='${version}') is distinct from ${body} then raise exception 'Registered migration ${version} differs';end if;
 else
  execute ${body};
  insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','${name.slice(15)}',array[${body}]);
 end if;
end $release$;`;}).join('\n')}
do $verify$ begin
 if has_function_privilege('anon','public.wc_classify_backdrop_box_drawing(text,text,uuid)','EXECUTE') or has_function_privilege('anon','public.wc_shop_command(uuid,text,jsonb)','EXECUTE') then raise exception 'Anonymous write access';end if;
 if not has_function_privilege('authenticated','public.wc_classify_backdrop_box_drawing(text,text,uuid)','EXECUTE') then raise exception 'Classification contract unavailable';end if;
 if (select count(*) from pg_class where oid in ('public.wc_shop_units'::regclass,'public.wc_backdrop_box_drawings'::regclass) and relrowsecurity)<>2 then raise exception 'RLS missing';end if;
end $verify$;
commit;
${verify}`;
if(process.argv.includes('--print-sql')){process.stdout.write(sql);process.exit(0);}
if(process.argv.includes('--print-preflight')){process.stdout.write(verify);process.exit(0);}
const token=process.env.SUPABASE_ACCESS_TOKEN;if(!token)throw Error('SUPABASE_ACCESS_TOKEN is required');
async function request(query,read_only){const response=await fetch('https://api.supabase.com/v1/projects/zgvnrpspwluapaxnycrg/database/query',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query,read_only})});if(!response.ok)throw Error(`Supabase database access failed (HTTP ${response.status}); no release completion claimed.`);return response.json();}
console.log('Preflight:',JSON.stringify(await request(verify,true)));
if(process.argv.includes('--apply')){await request(sql,false);const result=await request(verify,true);const r=result[0];if(r?.registered!==2||!r.paint_routes||!r.classification||r.rls_tables!==2||r.anon_shop_write)throw Error('Production verification failed');console.log('Verified:',JSON.stringify(result));}
