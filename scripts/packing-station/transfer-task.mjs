import {createHash} from 'node:crypto';
import {sendRdFile} from './ruida-udp.mjs';

// Download and validate the entire task before writing any file to the controller.
// Acknowledged transfers are not a confirmation that cutting has happened.
export async function transferTask(files,{address,fetchFile,sendFile=sendRdFile,onFile=()=>{},isStopped=()=>false}){
 if(!Array.isArray(files)||!files.length)throw Error('Task has no RD files.');
 const prepared=[];
 for(const file of files){
  if(isStopped())throw Error('Station stopped before all files were transferred.');
  const data=await fetchFile(file);
  if(!Buffer.isBuffer(data)||!data.length||data.length>20971520||data.length!==Number(file.size_bytes)){
   throw Error(`${file.filename}: downloaded file size does not match the saved task.`);
  }
  const hash=createHash('sha256').update(data).digest('hex');
  const filename=hash.slice(0,8).toUpperCase();
  if(prepared.some(entry=>entry.filename===filename&&entry.hash!==hash))throw Error('Controller filename conflict. Contact a manager before retrying.');
  prepared.push({file,data,filename,hash});
 }
 const sent=new Set();
 for(const [index,entry] of prepared.entries()){
  if(isStopped())throw Error('Station stopped before all files were transferred.');
  if(!sent.has(entry.hash)){
   await sendFile(entry.data,{address,filename:entry.filename});
   sent.add(entry.hash);
  }
  onFile({file:entry.file,filename:entry.filename,completed:index+1,total:prepared.length});
 }
 return prepared.map(({file,filename})=>({file_id:file.file_id,filename}));
}
