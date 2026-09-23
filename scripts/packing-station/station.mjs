import {sendRdFile,privateControllerAddress} from './ruida-udp.mjs';

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

let session=null,expiresAt=0,stopped=false;
process.on('SIGINT',()=>{stopped=true;});
process.on('SIGTERM',()=>{stopped=true;});

async function authRequest(grant,body){
 const response=await fetch(`${settings.url}/auth/v1/token?grant_type=${grant}`,{
  method:'POST',headers:{apikey:settings.anonKey,'Content-Type':'application/json'},body:JSON.stringify(body),
 });
 const result=await response.json().catch(()=>null);
 if(!response.ok||!result?.access_token)throw Error('Station sign-in failed. Check the manager account and network.');
 session=result;expiresAt=Date.now()+Math.max(30,Number(result.expires_in||3600)-60)*1000;
}
async function token(){
 if(!session)await authRequest('password',{email:settings.email,password:settings.password});
 else if(Date.now()>expiresAt)await authRequest('refresh_token',{refresh_token:session.refresh_token});
 return session.access_token;
}
async function rpc(name,body={}){
 const response=await fetch(`${settings.url}/rest/v1/rpc/${name}`,{
  method:'POST',headers:{apikey:settings.anonKey,Authorization:`Bearer ${await token()}`,'Content-Type':'application/json'},body:JSON.stringify(body),
 });
 const result=await response.json().catch(()=>null);
 if(!response.ok)throw Error(result?.message||`Hub request failed (${response.status}).`);
 return result;
}
async function fetchFile(file){
 if(!file?.object_path||!String(file.filename||'').toLowerCase().endsWith('.rd'))throw Error('Task contains an invalid RD file.');
 const path=String(file.object_path).split('/').map(encodeURIComponent).join('/');
 const response=await fetch(`${settings.url}/storage/v1/object/authenticated/box-rd-files/${path}`,{
  headers:{apikey:settings.anonKey,Authorization:`Bearer ${await token()}`},
 });
 if(!response.ok)throw Error(`${file.filename}: could not download from Hub (${response.status}).`);
 const buffer=Buffer.from(await response.arrayBuffer());
 if(buffer.length!==Number(file.size_bytes)||!buffer.length||buffer.length>20971520)throw Error(`${file.filename}: downloaded file size does not match the saved task.`);
 return buffer;
}
const delay=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));

console.log(`Packing station ${settings.name} is running. Laser cutting must be started at the machine panel.`);
while(!stopped){
 try{
  await rpc('wc_packing_station_heartbeat',{p_station:settings.name});
  const transfer=await rpc('wc_claim_packing_transfer',{p_station:settings.name});
  if(transfer?.transfer_id){
   const heartbeat=setInterval(()=>{void rpc('wc_packing_station_heartbeat',{p_station:settings.name}).catch(()=>{});},10000);
   try{
    if(!Array.isArray(transfer.files)||!transfer.files.length)throw Error('Task has no RD files.');
    for(const file of transfer.files){
     const data=await fetchFile(file);
     await sendRdFile(data,{address:settings.controller});
     console.log(`Sent ${file.filename}; requested cutting copies: ${file.copies}.`);
    }
    await rpc('wc_finish_packing_transfer',{p_transfer:transfer.transfer_id,p_ok:true,p_error:null});
    console.log('All RD files acknowledged. Verify them on the controller before cutting.');
   }catch(error){
    const message=error instanceof Error?error.message:'Transfer failed.';
    console.error(`${message} Check the controller file list before retrying this task.`);
    try{await rpc('wc_finish_packing_transfer',{p_transfer:transfer.transfer_id,p_ok:false,p_error:message});}
    catch{console.error('Hub could not record the transfer result. Check the task before retrying.');}
   }finally{clearInterval(heartbeat);}
  }
 }catch(error){console.error(error instanceof Error?error.message:'Station connection failed.');}
 if(!stopped)await delay(5000);
}
console.log('Packing station stopped.');
