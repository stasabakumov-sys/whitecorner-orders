import {readFile} from 'node:fs/promises';
const token=process.env.SUPABASE_ACCESS_TOKEN;
if(!token)throw Error('SUPABASE_ACCESS_TOKEN required');
const version='20261006000500',name='fulfilment_recalculate_packages';
const source=(await readFile(`supabase/migrations/${version}_${name}.sql`,'utf8')).replaceAll('\r','');
const quote=value=>`'${value.replaceAll("'","''")}'`;
async function query(sql,readOnly=true){
 const response=await fetch('https://api.supabase.com/v1/projects/zgvnrpspwluapaxnycrg/database/query',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query:sql,read_only:readOnly})});
 if(!response.ok)throw Error(`Migration request failed: HTTP ${response.status}`);
 return response.json();
}
await query(`begin;
 set local lock_timeout='15s'; set local statement_timeout='120s';
 select pg_advisory_xact_lock(20261006,2);
 do $migration$ begin
  if exists(select 1 from supabase_migrations.schema_migrations where version='${version}') then
   if not exists(select 1 from supabase_migrations.schema_migrations where version='${version}' and replace(statements[1],E'\\r','')=${quote(source)}) then
    raise exception 'Registered migration differs from reviewed source';
   end if;
  else
   execute ${quote(source)};
   insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','${name}',array[${quote(source)}]);
  end if;
 end $migration$;
 commit;`,false);
const [state]=await query(`select
 exists(select 1 from supabase_migrations.schema_migrations where version='${version}') as registered,
 to_regprocedure('public.wc_replace_shipment_packages(uuid,timestamptz,jsonb)') is not null as function_ready,
 has_function_privilege('authenticated','public.wc_replace_shipment_packages(uuid,timestamptz,jsonb)','execute') as member_execute,
 not has_function_privilege('anon','public.wc_replace_shipment_packages(uuid,timestamptz,jsonb)','execute') as anon_denied,
 exists(select 1 from pg_trigger where tgname='wc_invalidate_shipment_packing' and tgrelid='public.wc_shipment_packages'::regclass and tgenabled='O') as packing_guard;`);
if(!state||Object.values(state).some(value=>value!==true))throw Error('Packaging migration postflight failed');
console.log('Fulfilment packaging transaction published; no shipment recalculated');
