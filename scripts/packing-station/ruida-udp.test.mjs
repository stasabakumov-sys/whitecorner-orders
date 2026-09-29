import {test} from 'node:test';
import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import {privateControllerAddress,sendRdFile} from './ruida-udp.mjs';

function unscramble(byte){
 let value=(byte-1+256)&255;
 value^=0x88;
 const high=value&0x80,low=value&1;
 return ((value-high-low)|(low<<7)|(high>>7))&255;
}

test('accepts only private controller IPv4 addresses',()=>{
 assert.equal(privateControllerAddress('192.168.1.5'),true);
 assert.equal(privateControllerAddress('10.0.0.5'),true);
 assert.equal(privateControllerAddress('8.8.8.8'),false);
 assert.equal(privateControllerAddress('localhost'),false);
});

test('stores a named RD file only after the controller acknowledges its name',async()=>{
 const mock=dgram.createSocket('udp4'),received=[];
 await new Promise(resolve=>mock.bind(0,'127.0.0.1',resolve));
 mock.on('message',(packet,remote)=>{
  const payload=packet.subarray(2);
  assert.equal(packet.readUInt16BE(0),[...payload].reduce((sum,byte)=>(sum+byte)&0xffff,0));
  received.push(payload);
  mock.send(Buffer.from([0xc6]),remote.port,remote.address);
 });
 try{
  const file=Buffer.alloc(3500,0x55);
  const result=await sendRdFile(file,{address:'127.0.0.1',filename:'TEST0929',port:mock.address().port,localPort:0,allowLoopbackForTest:true});
  assert.deepEqual(result,{bytes:3500,filename:'TEST0929'});
  assert.deepEqual(Buffer.from(received[0].map(unscramble)),Buffer.from([0xe8,0x02,0xe7,0x01,...Buffer.from('TEST0929'),0]));
  assert.deepEqual(Buffer.concat(received.slice(1)),file);
 }finally{mock.close();}
});

test('does not send file bytes when the filename command is rejected',async()=>{
 const mock=dgram.createSocket('udp4');
 await new Promise(resolve=>mock.bind(0,'127.0.0.1',resolve));
 let packets=0;
 mock.on('message',(_packet,remote)=>{packets++;mock.send(Buffer.from([0x46]),remote.port,remote.address);});
 try{
  await assert.rejects(sendRdFile(Buffer.from([1,2,3]),{address:'127.0.0.1',filename:'TEST',port:mock.address().port,localPort:0,allowLoopbackForTest:true}),/Controller rejected/);
  assert.equal(packets,1);
 }finally{mock.close();}
});
