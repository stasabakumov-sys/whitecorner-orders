// Applies only the approved requote migration, atomically and once.
import {readFile} from 'node:fs/promises';
const version='20260909000600';
const migration=await readFile(`supabase/migrations/${version}_delivery_requote.sql`,'utf8');
const literal="'"+migration.replaceAll("'","''")+"'";
const query=`begin;
select pg_advisory_xact_lock(20260909000600);
do $migration$ begin
if not exists(select 1 from supabase_migrations.schema_migrations where version='${version}') then
execute ${literal};
insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','delivery_requote',array[${literal}]);
end if;
end $migration$;
commit;`;
if(process.argv.includes('--print-sql')){process.stdout.write(query);process.exit(0);}
const token=process.env.SUPABASE_ACCESS_TOKEN;
if(!token)throw Error('SUPABASE_ACCESS_TOKEN is required');
const response=await fetch('https://api.supabase.com/v1/projects/zgvnrpspwluapaxnycrg/database/query',{
 method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query,read_only:false})
});
if(!response.ok)throw Error(`Requote migration failed (HTTP ${response.status}); deployment stopped.`);
console.log('Requote migration applied or already registered.');
