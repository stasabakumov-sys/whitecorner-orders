import {readFile} from 'node:fs/promises';
const mode=process.argv[2];
if(!['--verify','--apply'].includes(mode))throw Error('Use --verify or --apply');
const version='20261008000100',name='backdrop_box_whole_cut';
const source=(await readFile(`supabase/migrations/${version}_${name}.sql`,'utf8')).replaceAll('\r','');
const quote=value=>"'"+value.replaceAll("'","''")+"'";
const token=process.env.SUPABASE_ACCESS_TOKEN;
if(!token)throw Error('Supabase access token required');
async function query(sql,read_only=true){
 const response=await fetch('https://api.supabase.com/v1/projects/zgvnrpspwluapaxnycrg/database/query',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query:sql,read_only})});
 if(!response.ok)throw Error(`Backdrop whole-cut release query failed: HTTP ${response.status}`);
 return response.json();
}
const [before]=await query(`select
 to_regprocedure('public.wc_backdrop_constructor_geometry(jsonb)') is not null geometry,
 to_regprocedure('public.wc_save_cart_constructor_files(uuid,uuid,jsonb,jsonb,jsonb,jsonb)') is not null cart_save,
 to_regprocedure('public.wc_save_backdrop_constructor_files(uuid,text,jsonb,jsonb,jsonb,jsonb)') is not null backdrop_save,
 to_regprocedure('public.wc_send_packing_task(uuid,text)') is not null packing_send,
 (select relrowsecurity from pg_class where oid='public.wc_backdrop_box_svg_drawings'::regclass) svg_rls,
 (select relrowsecurity from pg_class where oid='public.wc_box_rd_files'::regclass) rd_rls,
 exists(select 1 from supabase_migrations.schema_migrations where version='20261007000500') earlier_backdrop_box;
`);
if(!before||Object.values(before).some(value=>value!==true))throw Error('Backdrop whole-cut prerequisites differ');
const [registration]=await query(`select replace(statements[1],E'\\r','')=${quote(source)} source_matches from supabase_migrations.schema_migrations where version='${version}'`);
if(registration&&!registration.source_matches)throw Error('Registered migration differs');
console.log(JSON.stringify({preflight:'passed',registered:!!registration}));
if(mode==='--verify'&&!registration)process.exit(0);
if(mode==='--apply')await query(`begin;set local lock_timeout='15s';set local statement_timeout='120s';select pg_advisory_xact_lock(20260923,6);
 do $release$ begin
 if exists(select 1 from supabase_migrations.schema_migrations where version='${version}') then
  if (select replace(statements[1],E'\\r','') from supabase_migrations.schema_migrations where version='${version}') is distinct from ${quote(source)} then raise exception 'Registered migration differs';end if;
 else execute ${quote(source)};insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','${name}',array[${quote(source)}]);end if;
 end $release$;commit;`,false);
const [after]=await query(`select
 exists(select 1 from supabase_migrations.schema_migrations where version='${version}') registered,
 (public.wc_backdrop_constructor_geometry('{"length_mm":830,"width_mm":780,"height_mm":80}'::jsonb)->>'main_panel')::numeric=815 whole_main,
 (public.wc_backdrop_constructor_geometry('{"length_mm":1150,"width_mm":400,"height_mm":80}'::jsonb)->>'rim')::numeric=12.5 rotated_rim,
 (public.wc_backdrop_constructor_geometry('{"length_mm":1500,"width_mm":930,"height_mm":80}'::jsonb)->>'main_panel')::numeric=910 split_main,
 (select p.prosecdef and p.prosrc like '%wc_backdrop_constructor_geometry(current_box)%' and not has_function_privilege('anon',p.oid,'execute') and has_function_privilege('authenticated',p.oid,'execute') from pg_proc p where p.oid='public.wc_save_backdrop_constructor_files(uuid,text,jsonb,jsonb,jsonb,jsonb)'::regprocedure) save_guard,
 (select p.prosecdef and p.prosrc like '%constructor_data->''rd_ids''%' and not has_function_privilege('anon',p.oid,'execute') from pg_proc p where p.oid='public.wc_send_packing_task(uuid,text)'::regprocedure) ordered_send,
 not has_function_privilege('anon','public.wc_backdrop_constructor_geometry(jsonb)','execute') geometry_private;
`);
if(!after||Object.values(after).some(value=>value!==true))throw Error('Backdrop whole-cut postflight failed');
console.log(JSON.stringify({release:'verified',...after}));
