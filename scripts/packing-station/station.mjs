import {privateControllerAddress} from './ruida-udp.mjs';
import {createHubClient} from './hub-client.mjs';
import {runStationWorker} from './worker-runtime.mjs';

const settings={
 url:process.env.HUB_SUPABASE_URL?.replace(/\/$/,''),
 anonKey:process.env.HUB_SUPABASE_ANON_KEY,
 email:process.env.HUB_STATION_EMAIL,
 password:process.env.HUB_STATION_PASSWORD,
 controller:process.env.HUB_LASER_IP,
 name:process.env.HUB_STATION_NAME||'Packing laptop',
};
if(!process.argv.includes('--send')){
 console.error('Start with --send only when the laptop is connected to the laser controller and an operator is present.');
 process.exit(2);
}
if(!settings.url||!settings.anonKey||!settings.email||!settings.password||!privateControllerAddress(settings.controller)){
 console.error('Set the Hub URL, publishable key, manager login and private laser controller IP in local environment variables.');
 process.exit(2);
}

let stopped=false,draining=false;
process.on('SIGINT',()=>{stopped=true;});
process.on('SIGTERM',()=>{stopped=true;});
if(process.send){
 process.on('message',message=>{if(message?.type==='drain')draining=true;});
 process.on('disconnect',()=>{draining=true;});
}

const {rpc,fetchFile}=createHubClient(settings);
console.log(`Packing station ${settings.name} is running. Laser cutting must be started at the machine panel.`);
await runStationWorker({rpc,fetchFile,station:settings.name,controller:settings.controller,isStopped:()=>stopped,isDraining:()=>draining,
 onReady:()=>{if(process.connected)process.send({type:'ready'});},
 onFile:({file,filename,completed,total})=>console.log(`[${completed}/${total}] ${file.filename} -> controller ${filename}; cut ${file.copies} copies manually.`),
 onError:message=>console.error(message),onTransferred:()=>console.log('All RD files acknowledged. Verify them on the controller before cutting.'),
});
console.log('Packing station stopped.');
if(process.connected)process.disconnect();
