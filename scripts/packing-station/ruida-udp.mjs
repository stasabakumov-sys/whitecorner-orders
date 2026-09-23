import dgram from 'node:dgram';
import {isIP} from 'node:net';

const PRIVATE_IPV4=[/^10\./,/^192\.168\./,/^172\.(1[6-9]|2\d|3[01])\./];

export function privateControllerAddress(address){
 return isIP(address)===4&&PRIVATE_IPV4.some(pattern=>pattern.test(address));
}

export async function sendRdFile(data,{address,port=50200,timeoutMs=3000,chunkSize=1470,allowLoopbackForTest=false}={}){
 if(!privateControllerAddress(address)&&!(allowLoopbackForTest&&address==='127.0.0.1'))throw Error('Controller address must be a private IPv4 address on the local network.');
 if(!Buffer.isBuffer(data)||data.length<1||data.length>20971520)throw Error('RD file is empty or exceeds 20 MB.');
 if(!Number.isInteger(port)||port<1||port>65535||!Number.isInteger(chunkSize)||chunkSize<1||chunkSize>1470)throw Error('Invalid Ruida network settings.');
 const socket=dgram.createSocket('udp4');
 try{
  await new Promise((resolve,reject)=>{socket.once('error',reject);socket.bind(0,()=>{socket.off('error',reject);resolve();});});
  await new Promise((resolve,reject)=>socket.connect(port,address,error=>error?reject(error):resolve()));
  for(let offset=0;offset<data.length;offset+=chunkSize){
   const payload=data.subarray(offset,Math.min(offset+chunkSize,data.length));
   const packet=Buffer.allocUnsafe(payload.length+2);
   let sum=0;for(const byte of payload)sum=(sum+byte)&0xffff;
   packet.writeUInt16BE(sum,0);payload.copy(packet,2);
   let attempt=0;
   while(true){
    const answer=await new Promise((resolve,reject)=>{
     const timer=setTimeout(()=>{socket.off('message',onMessage);reject(Error('Controller acknowledgement timed out. Check its file list before retrying.'));},timeoutMs);
     const onMessage=message=>{clearTimeout(timer);resolve(message);};
     socket.once('message',onMessage);
     socket.send(packet,error=>{if(error){clearTimeout(timer);socket.off('message',onMessage);reject(error);}});
    });
    if(answer[0]===0xc6)break;
    if(offset===0&&answer[0]===0x46&&attempt++<2){await new Promise(resolve=>setTimeout(resolve,200*attempt));continue;}
    throw Error(`Controller rejected a packet (${answer[0]?.toString(16)||'empty'}). Check its file list before retrying.`);
   }
  }
 }finally{socket.close();}
}
