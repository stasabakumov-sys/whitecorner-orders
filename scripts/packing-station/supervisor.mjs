import {fork} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHubClient} from './hub-client.mjs';

// Task Scheduler can lose its launcher during sign-out or suspend recovery.
// Drain an orphan before its replacement takes the supervisor lease.
export function drainIfOwnerExited(supervisor,ownerPid,probe=pid=>process.kill(pid,0)){
 if(ownerPid<=0)return;
 try{probe(ownerPid);}catch(error){if(error?.code==='ESRCH')supervisor.stop();}
}

// Restart only our own child. A drain request lets the entire active transfer
// finish and record its result before the worker exits; no RD files are replayed.
export class StationSupervisor{
 constructor({rpc,spawnWorker,station,instance=randomUUID(),now=Date.now,onError=()=>{}}){
  Object.assign(this,{rpc,spawnWorker,station,instance,now,onError});
  this.worker=null;this.ready=false;this.pending=null;this.draining=null;this.nextStart=0;this.stopping=false;
 }
 spawn(){
  const worker=this.spawnWorker();this.worker=worker;this.ready=false;
  worker.on('message',message=>{if(this.worker===worker&&message?.type==='ready')this.ready=true;});
  worker.on('error',()=>this.onError('The station worker could not start. Automatic recovery will retry.'));
  worker.on('exit',()=>{if(this.worker===worker){this.worker=null;this.ready=false;this.nextStart=this.now()+(this.draining?0:15000);this.draining=null;}});
 }
 drain(id){if(this.worker&&this.draining!==id){this.worker.send({type:'drain'},error=>{if(error)this.onError('The station worker is stopping. Waiting for its exit before restarting.');});this.draining=id;}}
 async tick(){
  if(this.stopping){this.drain('shutdown');return;}
  const control=await this.rpc('wc_packing_station_control_heartbeat',{p_station:this.station,p_instance:this.instance});
  if(!control||control.supervisor_instance!==this.instance)throw Error('Station supervisor identity changed.');
  const requested=['requested','restarting'].includes(control.restart_state);
  if(requested&&this.pending===control.restart_id&&this.ready){
   await this.rpc('wc_finish_packing_station_restart',{p_station:this.station,p_instance:this.instance,p_request:this.pending});
   this.pending=null;
  }else if(requested&&this.pending!==control.restart_id){
   if(this.worker){this.drain(control.restart_id);return;}
   const started=await this.rpc('wc_begin_packing_station_restart',{p_station:this.station,p_instance:this.instance,p_request:control.restart_id});
   if(started?.restart_state!=='restarting')return;
   this.pending=control.restart_id;
  }
  if(!this.worker&&this.now()>=this.nextStart)this.spawn();
 }
 stop(){this.stopping=true;this.drain('shutdown');}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const settings={url:process.env.HUB_SUPABASE_URL?.replace(/\/$/,''),anonKey:process.env.HUB_SUPABASE_ANON_KEY,email:process.env.HUB_STATION_EMAIL,password:process.env.HUB_STATION_PASSWORD};
 const hub=createHubClient(settings);
 const supervisor=new StationSupervisor({rpc:hub.rpc,station:process.env.HUB_STATION_NAME||'Packing laptop',
  spawnWorker:()=>fork(fileURLToPath(new URL('./station.mjs',import.meta.url)),['--send'],{stdio:['ignore','inherit','inherit','ipc'],windowsHide:true}),onError:message=>console.error(message)});
 process.on('SIGINT',()=>supervisor.stop());process.on('SIGTERM',()=>supervisor.stop());
 const ownerPid=process.ppid;
 while(!supervisor.stopping||supervisor.worker){
  drainIfOwnerExited(supervisor,ownerPid);
  try{await supervisor.tick();}catch(error){console.error(error instanceof Error?error.message:'Station recovery connection failed.');}
  await new Promise(resolve=>setTimeout(resolve,5000));
 }
}
