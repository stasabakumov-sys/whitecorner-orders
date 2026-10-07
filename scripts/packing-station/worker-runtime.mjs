import {transferTask} from './transfer-task.mjs';

export async function runStationWorker({rpc,fetchFile,station,controller,isStopped=()=>false,isDraining=()=>false,onReady=()=>{},onFile=()=>{},onError=()=>{},onTransferred=()=>{},transfer=transferTask,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
 let announced=false;
 while(!isStopped()&&!isDraining()){
  try{
   await rpc(announced?'wc_packing_station_heartbeat':'wc_packing_station_worker_ready',{p_station:station});
   if(!announced){announced=true;onReady();}
   if(isStopped()||isDraining())break;
   const request=await rpc('wc_claim_packing_transfer',{p_station:station});
   if(request?.transfer_id){
    const heartbeat=setInterval(()=>{void rpc('wc_packing_station_heartbeat',{p_station:station}).catch(()=>{});},10000);
    try{
     // Graceful restart stops new claims, but the complete current transfer
     // and its server result finish before exiting. Operator stop is separate.
     await transfer(request.files,{address:controller,fetchFile,isStopped,onFile});
     await rpc('wc_finish_packing_transfer',{p_transfer:request.transfer_id,p_ok:true,p_error:null});
     onTransferred();
    }catch(error){
     const message=error instanceof Error?error.message:'Transfer failed.';
     onError(`${message} Check the controller file list before retrying this task.`);
     try{await rpc('wc_finish_packing_transfer',{p_transfer:request.transfer_id,p_ok:false,p_error:message});}
     catch{onError('Hub could not record the transfer result. Check the task before retrying.');}
    }finally{clearInterval(heartbeat);}
   }
  }catch(error){onError(error instanceof Error?error.message:'Station connection failed.');}
  if(!isStopped()&&!isDraining())await wait(5000);
 }
}
