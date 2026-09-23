import {test} from 'node:test';
import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import {privateControllerAddress,sendRdFile} from './ruida-udp.mjs';

test('accepts only local controller addresses',()=>{
 assert.equal(privateControllerAddress('192.168.1.5'),true);
 assert.equal(privateControllerAddress('10.0.0.5'),true);
 assert.equal(privateControllerAddress('8.8.8.8'),false);
 assert.equal(privateControllerAddress('localhost'),false);
});

test('sends RD bytes in acknowledged packets',async()=>{
 const mock=dgram.createSocket('udp4'),received=[];
 await new Promise(resolve=>mock.bind(0,'127.0.0.1',resolve));
 mock.on('message',(packet,remote)=>{
  const bytes=packet.subarray(2),expected=[...bytes].reduce((sum,value)=>(sum+value)&0xffff,0);
  assert.equal(packet.readUInt16BE(0),expected);
  received.push(bytes);mock.send(Buffer.from([0xc6]),remote.port,remote.address);
 });
 try{
  const input=Buffer.from(Array.from({length:3500},(_,index)=>index&255));
  await sendRdFile(input,{address:'127.0.0.1',port:mock.address().port,allowLoopbackForTest:true});
  assert.equal(received.length,3);
  assert.deepEqual(Buffer.concat(received),input);
 }finally{mock.close();}
});
