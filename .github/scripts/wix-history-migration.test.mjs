import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const {PGlite}=await import(pathToFileURL(path.resolve(process.argv[2])).href);
const db=new PGlite();
try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create table wc_orders(wix_order_id text,order_number text,is_hidden boolean);grant select on wc_orders to authenticated;');
 await db.exec("insert into wc_orders values('hidden','2',true),('active','1',false)");
 await db.exec(await readFile('supabase/migrations/20260909000800_wix_order_history.sql','utf8'));
 await db.exec(`set role service_role;insert into wc_wix_order_history(wix_order_id,order_number,raw_order) values('hidden','2','{}'),('active','1','{}'),('old','3','{}');reset role;`);
 await db.exec(await readFile('supabase/migrations/20260910000100_wix_history_source_json.sql','utf8'));
 const source=JSON.stringify({note:'Backdrop\0\ud800😀'});
 await db.query('update wc_wix_order_history set raw_order=$1::jsonb, source_json=$2 where wix_order_id=$3',[JSON.stringify({note:'Backdrop��😀'}),source,'old']);
 assert.equal((await db.query("select source_json from wc_wix_order_history where wix_order_id='old'")).rows[0].source_json,source);
 await db.exec('set role authenticated');
 assert.equal((await db.query('select * from wc_wix_order_history')).rows.length,2);
 await assert.rejects(()=>db.exec("insert into wc_wix_order_history(wix_order_id,order_number,raw_order) values('bad','4','{}')"),/permission denied/);
 await db.exec('reset role;set role anon');await assert.rejects(()=>db.query('select * from wc_wix_order_history'));
 await db.exec('reset role');assert.equal((await db.query('select * from wc_orders')).rows.length,2);
 console.log('History migration: RLS, write isolation and existing operational rows verified');
}finally{await db.close();}
