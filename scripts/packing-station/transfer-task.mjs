import {sendRdFile} from './ruida-udp.mjs';

// Download and validate the entire task before writing any file to the controller.
// Acknowledged transfers are not a confirmation that cutting has happened.
export async function transferTask(files,{address,fetchFile,sendFile=sendRdFile,onFile=()=>{},isStopped=()=>false}){
 if(!Array.isArray(files)||!files.length)throw Error('Task has no RD files.');
 const prepared=[];
 for(const [index,file] of files.entries()){
  if(isStopped())throw Error('Station stopped before all files were transferred.');
  const data=await fetchFile(file);
  if(!Buffer.isBuffer(data)||!data.length||data.length>20971520||data.length!==Number(file.size_bytes)){
   throw Error(`${file.filename}: downloaded file size does not match the saved task.`);
  }
  const sourceFilename=String(file.filename||'');
  if(!sourceFilename.toLowerCase().endsWith('.rd')||!sourceFilename.slice(0,-3).trim()){
   throw Error(`${file.filename}: invalid saved RD filename. Check the task files and retry.`);
  }
  prepared.push({file,data,filename:`D${index+1}`});
 }
 for(const [index,entry] of prepared.entries()){
  if(isStopped())throw Error('Station stopped before all files were transferred.');
  await sendFile(entry.data,{address,filename:entry.filename});
  onFile({file:entry.file,filename:entry.filename,completed:index+1,total:prepared.length});
 }
 return prepared.map(({file,filename})=>({file_id:file.file_id,filename}));
}
