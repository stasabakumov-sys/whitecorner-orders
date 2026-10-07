import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createHubClient} from './hub-client.mjs';
import {StationSupervisor} from './supervisor.mjs';
import {runStationWorker} from './worker-runtime.mjs';

const settings={url:'https://hub.example.test',anonKey:'public-test-key',email:'manager@example.test',password:'test-only'};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status});
const auth=()=>json({access_token:'test-access',refresh_token:'test-refresh',expires_in:120});
const blocked=signal=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}));

test('bounds a stalled HTTP request and permits the next heartbeat without replaying a command',async()=>{
 let hang=true,calls=0;
 const hub=createHubClient(settings,{timeoutMs:10,fetchImpl:async(url,options)=>url.includes('/token')?auth():(calls++,hang?blocked(options.signal):json({ok:true}))});
 await assert.rejects(hub.rpc('wc_claim_packing_transfer'),/timed out/);assert.equal(calls,1);
 hang=false;assert.deepEqual(await hub.rpc('wc_packing_station_heartbeat'),{ok:true});assert.equal(calls,2);
});
test('keeps the timeout active while reading a stalled response body',async()=>{
 const hub=createHubClient(settings,{timeoutMs:10,fetchImpl:async(url,options)=>url.includes('/token')?auth():{ok:true,status:200,json:()=>blocked(options.signal)}});
 await assert.rejects(hub.rpc('heartbeat'),/timed out/);
});
test('serializes expired-session refresh and recovers invalid refresh tokens with saved sign-in',async()=>{
 let now=0;const grants=[];
 const hub=createHubClient(settings,{now:()=>now,fetchImpl:async url=>{
  if(url.includes('/token')){grants.push(new URL(url).searchParams.get('grant_type'));return url.includes('refresh_token')?json({error:'invalid'},400):auth();}
  return json({ok:true});
 }});
 await hub.rpc('heartbeat');now=61000;await Promise.all([hub.rpc('heartbeat'),hub.rpc('claim')]);
 assert.deepEqual(grants,['password','refresh_token','password']);
});
test('refreshes a rejected session once, but never retries non-authentication RPC failures',async()=>{
 let calls=0;
 const hub=createHubClient(settings,{fetchImpl:async url=>url.includes('/token')?auth():++calls===1?json({error:'expired'},401):json({message:'Unavailable'},503)});
 await assert.rejects(hub.rpc('claim'),/Unavailable/);assert.equal(calls,2);
});

function supervisorSetup(){
 let time=0,control={supervisor_instance:'instance',restart_state:'idle',restart_id:null};const calls=[],workers=[];
 const rpc=async(name,args)=>{calls.push([name,args]);if(name==='wc_begin_packing_station_restart')control={...control,restart_state:'restarting'};if(name==='wc_finish_packing_station_restart')control={...control,restart_state:'completed'};return {...control};};
 const supervisor=new StationSupervisor({rpc,station:'Test laptop',instance:'instance',now:()=>time,spawnWorker:()=>{
  const child=new EventEmitter();child.messages=[];child.send=(message,callback)=>{child.messages.push(message);callback?.();};workers.push(child);return child;
 }});
 return {supervisor,calls,workers,setControl:change=>{control={...control,...change};},advance:ms=>{time+=ms;}};
}
test('restart drains the existing worker, waits for exit, and confirms only the new worker heartbeat',async()=>{
 const {supervisor,calls,workers,setControl}=supervisorSetup();await supervisor.tick();workers[0].emit('message',{type:'ready'});
 setControl({restart_state:'requested',restart_id:'restart-1'});await supervisor.tick();await supervisor.tick();
 assert.equal(workers.length,1);assert.deepEqual(workers[0].messages,[{type:'drain'}]);
 assert.equal(calls.filter(([name])=>name==='wc_begin_packing_station_restart').length,0);
 workers[0].emit('exit',0);await supervisor.tick();assert.equal(workers.length,2);
 await supervisor.tick();assert.equal(calls.filter(([name])=>name==='wc_finish_packing_station_restart').length,0);
 workers[1].emit('message',{type:'ready'});await supervisor.tick();
 assert.equal(calls.filter(([name])=>name==='wc_finish_packing_station_restart').length,1);assert.equal(workers[1].messages.length,0);
});
test('recovers an exited worker automatically and rejects another supervisor identity',async()=>{
 const {supervisor,workers,advance,setControl}=supervisorSetup();await supervisor.tick();workers[0].emit('exit',1);
 await supervisor.tick();assert.equal(workers.length,1);advance(15000);await supervisor.tick();assert.equal(workers.length,2);
 setControl({supervisor_instance:'another'});await assert.rejects(supervisor.tick(),/identity changed/);assert.equal(workers.length,2);
});
test('an unfinished upload blocks the replacement worker until server review permits restart',async()=>{
 const workers=[];const supervisor=new StationSupervisor({station:'Test',instance:'i',rpc:async name=>({supervisor_instance:'i',restart_state:'requested',restart_id:'r'}),spawnWorker:()=>{workers.push({});}});
 await supervisor.tick();assert.equal(workers.length,0);
});
test('a drain during transfer completes every file and records the result without claiming more work',async()=>{
 let drain=false,release;const gate=new Promise(resolve=>{release=resolve;});const calls=[],sent=[];
 const worker=runStationWorker({station:'Test',controller:'192.168.1.100',isDraining:()=>drain,
  rpc:async(name)=>{calls.push(name);return name==='wc_claim_packing_transfer'?{transfer_id:'t',files:[1,2]}:{};},
  transfer:async(files,{isStopped})=>{sent.push(files[0]);await gate;assert.equal(isStopped(),false);sent.push(files[1]);},
 });
 await new Promise(resolve=>setImmediate(resolve));drain=true;release();await worker;
 assert.deepEqual(sent,[1,2]);assert.deepEqual(calls,['wc_packing_station_worker_ready','wc_claim_packing_transfer','wc_finish_packing_transfer']);
});
test('failure to record a transfer does not cause automatic file replay on the next loop',async()=>{
 let drain=false,sent=0,claims=0;const errors=[];
 await runStationWorker({station:'Test',controller:'192.168.1.100',isDraining:()=>drain,onError:message=>errors.push(message),
  rpc:async(name)=>{if(name==='wc_claim_packing_transfer')return ++claims===1?{transfer_id:'t',files:[1]}:null;if(name==='wc_finish_packing_transfer')throw Error('Network interrupted');return {};},
  transfer:async()=>{sent++;},wait:async()=>{drain=true;},
 });
 assert.equal(sent,1);assert.ok(errors.some(message=>message.includes('could not record')));
});
