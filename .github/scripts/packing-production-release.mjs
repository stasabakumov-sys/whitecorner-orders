// Release only the reviewed Packing migrations.
import {readFile} from 'node:fs/promises';

const project='zgvnrpspwluapaxnycrg';
const migrations=[
 ['20260923000500','box_rd_files'],
 ['20260923000600','packing_tasks'],
 ['20260923000800','packing_exclude_delivery'],
];
const sources=await Promise.all(migrations.map(async([version,name])=>({
 version,name,source:(await readFile(`supabase/migrations/${version}_${name}.sql`,'utf8')).replaceAll('\r',''),
})));
const quote=value=>"'"+value.replaceAll("'","''")+"'";
const token=process.env.SUPABASE_ACCESS_TOKEN;
if(!token)throw Error('Supabase access token required');
const api=`https://api.supabase.com/v1/projects/${project}`;
async function request(path,method='GET',body){
 const response=await fetch(api+path,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 if(!response.ok)throw Error(`Production API ${path} returned HTTP ${response.status}: ${(await response.text()).slice(0,300)}`);
 return response.json();
}
async function sql(query,read_only=true){return request('/database/query','POST',{query,read_only});}
const preflight=`select
 (select count(*)::int from auth.users) user_count,
 to_regclass('public.wc_delivery_packaging_profiles') is not null profiles_ready,
 to_regclass('public.wc_production_units') is not null units_ready,
 to_regprocedure('public.wc_shop_item_product(uuid)') is not null product_rpc_ready,
 to_regprocedure('public.wc_cost_main(uuid)') is not null main_rpc_ready,
 exists(select 1 from supabase_migrations.schema_migrations where version='20260923000500') rd_registered,
 exists(select 1 from supabase_migrations.schema_migrations where version='20260923000600') packing_registered;`;
const verification=`select
 exists(select 1 from supabase_migrations.schema_migrations where version='20260923000800') delivery_filter_registered,
 to_regclass('public.wc_box_rd_files') is not null rd_table,
 to_regclass('public.wc_hub_members') is not null members_table,
 to_regclass('public.wc_packing_tasks') is not null tasks_table,
 to_regclass('public.wc_packing_transfers') is not null transfers_table,
 to_regclass('public.wc_packing_stations') is not null stations_table,
 exists(select 1 from storage.buckets where id='box-rd-files' and not public) private_bucket,
 (select count(*)::int from public.wc_hub_members where role='manager' and active) manager_count,
 to_regprocedure('public.wc_assign_packing_task(uuid,text,uuid)') is not null assign_rpc,
 to_regprocedure('public.wc_request_packing_transfer(uuid)') is not null transfer_rpc,
 coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.wc_packing_tasks')),false) tasks_rls;`;
const before=(await sql(preflight))[0];
console.log('Preflight:',JSON.stringify(before));
console.log('Auth redirect allow list requires separate verification; this token has database access only.');
if(!before?.profiles_ready||!before?.units_ready||!before?.product_rpc_ready||!before?.main_rpc_ready)throw Error('Packing prerequisites are missing');
if(!before.packing_registered&&before.user_count!==2)throw Error('Expected exactly two existing Auth users before assigning manager roles');
if(process.argv.includes('--verify')){
 if(before.rd_registered&&before.packing_registered)console.log('Packing state:',JSON.stringify((await sql(verification))[0]));
 process.exit(0);
}
if(!process.argv.includes('--apply'))throw Error('Use --verify or --apply');
const blocks=sources.map(({version,name,source})=>{
 const body=quote(source);
 return `if exists(select 1 from supabase_migrations.schema_migrations where version='${version}') then
  if (select replace(statements[1],E'\\r','') from supabase_migrations.schema_migrations where version='${version}') is distinct from ${body} then raise exception 'Migration ${version} differs from registered version';end if;
 else execute ${body};insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','${name}',array[${body}]);end if;`;
}).join('\n');
await sql(`begin;select pg_advisory_xact_lock(20260923,6);do $release$ begin ${blocks} end $release$;commit;`,false);
const after=(await sql(verification))[0];
if(!after||Object.entries(after).some(([key,value])=>key==='manager_count'?value!==2:value!==true))throw Error(`Packing postflight failed: ${JSON.stringify(after)}`);
console.log('Packing database verified:',JSON.stringify(after));
