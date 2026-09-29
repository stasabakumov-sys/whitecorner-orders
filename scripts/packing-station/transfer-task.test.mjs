import {test} from 'node:test';
import assert from 'node:assert/strict';
import {transferTask} from './transfer-task.mjs';

const files=Array.from({length:4},(_,i)=>({file_id:`file-${i}`,filename:`D${i+1}.rd`,size_bytes:3,copies:i+1}));
const data=file=>Buffer.from([1,2,Number(file.file_id.slice(-1))]);
test('downloads all four files before sending each named job once, regardless of copy counts',async()=>{
 const calls=[],progress=[];
 const result=await transferTask(files,{address:'192.168.1.100',fetchFile:async file=>{calls.push('read:'+file.filename);return data(file);},
  sendFile:async(bytes,options)=>{calls.push('send');assert.equal(options.address,'192.168.1.100');assert.match(options.filename,/^[A-F0-9]{8}$/);assert.equal(bytes.length,3);},onFile:item=>progress.push(item),
 });
 assert.deepEqual(calls,['read:D1.rd','read:D2.rd','read:D3.rd','read:D4.rd','send','send','send','send']);
 assert.equal(new Set(result.map(file=>file.filename)).size,4);
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
test('stores identical content once and retains each operator copy instruction',async()=>{
 let sent=0;const progress=[];
 await transferTask(files,{address:'192.168.1.100',fetchFile:async()=>Buffer.from([1,2,3]),sendFile:async()=>{sent++;},onFile:item=>progress.push(item)});
 assert.equal(sent,1);assert.deepEqual(progress.map(item=>item.file.copies),[1,2,3,4]);
});
test('honours operator stop before sending the next file',async()=>{
 let sent=0;
 await assert.rejects(transferTask(files,{address:'192.168.1.100',fetchFile:async file=>data(file),sendFile:async()=>{sent++;},isStopped:()=>sent===1}),/Station stopped/);
 assert.equal(sent,1);
});
