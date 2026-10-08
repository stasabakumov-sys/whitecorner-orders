import {test} from 'node:test';
import assert from 'node:assert/strict';
import {transferTask} from './transfer-task.mjs';

const files=Array.from({length:4},(_,i)=>({file_id:`file-${i}`,filename:`D${i+1}.rd`,size_bytes:3,copies:i+1}));
const data=file=>Buffer.from([1,2,Number(file.file_id.slice(-1))]);
test('downloads all four files before sending each named job once, regardless of copy counts',async()=>{
 const calls=[],progress=[];
 const result=await transferTask(files,{address:'192.168.1.100',fetchFile:async file=>{calls.push('read:'+file.filename);return data(file);},
  sendFile:async(bytes,options)=>{calls.push('send');assert.equal(options.address,'192.168.1.100');assert.match(options.filename,/^D[1-4]$/);assert.equal(bytes.length,3);},onFile:item=>progress.push(item),
 });
 assert.deepEqual(calls,['read:D1.rd','read:D2.rd','read:D3.rd','read:D4.rd','send','send','send','send']);
 assert.deepEqual(result.map(file=>file.filename),['D1','D2','D3','D4']);
 assert.deepEqual(progress.map(item=>[item.completed,item.total]),[[1,4],[2,4],[3,4],[4,4]]);
});
test('does not write any file when one download fails validation',async()=>{
 let sent=0;
 await assert.rejects(transferTask(files,{address:'192.168.1.100',fetchFile:async file=>file===files[3]?Buffer.from([1]):data(file),sendFile:async()=>{sent++;}}),/D4.rd/);
 assert.equal(sent,0);
});
test('stops on a partial controller failure and reports only acknowledged files',async()=>{
 let sent=0;const progress=[];
 await assert.rejects(transferTask(files,{address:'192.168.1.100',fetchFile:async file=>data(file),sendFile:async()=>{if(++sent===2)throw Error('No ACK');},onFile:item=>progress.push(item)}),/No ACK/);
 assert.equal(sent,2);assert.equal(progress.length,1);
});
test('assigns distinct controller slots even when content is identical',async()=>{
 let sent=0;const progress=[];
 await transferTask(files,{address:'192.168.1.100',fetchFile:async()=>Buffer.from([1,2,3]),sendFile:async()=>{sent++;},onFile:item=>progress.push(item)});
 assert.equal(sent,4);assert.deepEqual(progress.map(item=>item.file.copies),[1,2,3,4]);
});
test('rejects invalid saved RD names before sending any file',async()=>{
 for(const input of [[{...files[0],filename:'name.svg'}],[{...files[0],filename:'.rd'}],[{...files[0],filename:'  .rd'}]]){
  let sent=0;
  await assert.rejects(transferTask(input,{fetchFile:async file=>data(file),sendFile:async()=>{sent++;}}),/filename/);
  assert.equal(sent,0);
 }
});
test('maps any saved RD name to the fixed controller slot',async()=>{
 for(const source of ['Arch Panel Painted.rd','D5.RD','Panel.rd.v2.rd','не ASCII.rd']){
  const original={...files[0],filename:source};const names=[],progress=[];
  const mapping=await transferTask([original],{fetchFile:async file=>data(file),sendFile:async(_bytes,{filename})=>names.push(filename),onFile:item=>progress.push(item)});
  assert.deepEqual(names,['D1']);assert.equal(mapping[0].filename,'D1');
  assert.equal(original.filename,source);assert.equal(progress[0].file.filename,source);
 }
});
test('uses D1–D4 again on reload so names do not accumulate',async()=>{
 const names=[];
 for(let attempt=0;attempt<2;attempt++)await transferTask(files.map((file,index)=>({...file,filename:`saved-${attempt}-${index}.rd`})),{fetchFile:async file=>data(file),sendFile:async(_bytes,{filename})=>names.push(filename)});
 assert.deepEqual(names,['D1','D2','D3','D4','D1','D2','D3','D4']);
});
test('uses only D1 and D2 for whole bottom and lid',async()=>{
 const names=[];
 await transferTask(files.slice(0,2),{fetchFile:async file=>data(file),sendFile:async(_bytes,{filename})=>names.push(filename)});
 assert.deepEqual(names,['D1','D2']);
});
test('honours operator stop before sending the next file',async()=>{
 let sent=0;
 await assert.rejects(transferTask(files,{address:'192.168.1.100',fetchFile:async file=>data(file),sendFile:async()=>{sent++;},isStopped:()=>sent===1}),/Station stopped/);
 assert.equal(sent,1);
});
