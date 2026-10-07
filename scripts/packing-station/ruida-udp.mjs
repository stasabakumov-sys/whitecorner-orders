import dgram from 'node:dgram';
import {isIP} from 'node:net';

const PRIVATE_IPV4=[/^10\./,/^192\.168\./,/^172\.(1[6-9]|2\d|3[01])\./];

export function privateControllerAddress(address){
 return isIP(address)===4&&PRIVATE_IPV4.some(pattern=>pattern.test(address));
}

function scramble(byte){
 const high=byte&0x80,low=byte&1;
 return ((((byte-high-low)|(low<<7)|(high>>7))^0x88)+1)&0xff;
}

function packetFor(payload){
 const packet=Buffer.allocUnsafe(payload.length+2);
 let checksum=0;
 for(const byte of payload)checksum=(checksum+byte)&0xffff;
 packet.writeUInt16BE(checksum,0);
 payload.copy(packet,2);
 return packet;
}

export async function sendRdFile(data,{address,filename,port=50200,localPort=40200,timeoutMs=3000,chunkSize=1470,allowLoopbackForTest=false}={}){
 if(!privateControllerAddress(address)&&!(allowLoopbackForTest&&address==='127.0.0.1'))throw Error('Controller address must be a private IPv4 address on the local network.');
 if(!Buffer.isBuffer(data)||data.length<1||data.length>20971520)throw Error('RD file is empty or exceeds 20 MB.');
 if(typeof filename!=='string'||!/^[\x20-\x7e]{1,255}$/.test(filename)||!filename.trim()||/[\\/]/.test(filename))throw Error('Controller filename must be a non-empty ASCII job name without path separators.');
 if(!Number.isInteger(port)||port<1||port>65535||!Number.isInteger(localPort)||localPort<0||localPort>65535||!Number.isInteger(chunkSize)||chunkSize<1||chunkSize>1470)throw Error('Invalid Ruida network settings.');

 const socket=dgram.createSocket('udp4');
 try{
  await new Promise((resolve,reject)=>{socket.once('error',error=>reject(error.code==='EADDRINUSE'?Error(`RDWorks or another program is using UDP port ${localPort}. Close RDWorks, check the controller file list, then retry Load to laser.`):error));socket.bind(localPort,()=>{socket.removeAllListeners('error');resolve();});});
  const sendPacket=(payload,stage)=>new Promise((resolve,reject)=>{
   const packet=packetFor(payload);
   const timer=setTimeout(()=>{cleanup();reject(Error(`Controller acknowledgement timed out during ${stage}. Check its file list, network access and whether RDWorks is open before retrying.`));},timeoutMs);
   const cleanup=()=>{clearTimeout(timer);socket.off('message',onMessage);socket.off('error',onError);};
   const onError=error=>{cleanup();reject(error);};
   const onMessage=(answer,peer)=>{
    if(peer.address!==address||(peer.port!==port&&peer.port!==40200))return;
    cleanup();
    if(answer.length!==1||answer[0]!==0xc6)reject(Error(`Controller rejected ${stage} (${answer[0]?.toString(16)||'empty'}). Check its file list before retrying.`));
    else resolve();
   };
   socket.on('message',onMessage);
   socket.on('error',onError);
   socket.send(packet,port,address,error=>{if(error){cleanup();reject(error);}});
  });

  const nameCommand=Buffer.concat([Buffer.from([0xe8,0x02,0xe7,0x01]),Buffer.from(filename,'ascii'),Buffer.from([0])]);
  await sendPacket(Buffer.from(nameCommand.map(scramble)),'filename command');
  for(let offset=0;offset<data.length;offset+=chunkSize){
   await sendPacket(data.subarray(offset,Math.min(offset+chunkSize,data.length)),`file packet ${Math.floor(offset/chunkSize)+1}/${Math.ceil(data.length/chunkSize)}`);
  }
  return {bytes:data.length,filename};
 }finally{try{socket.close();}catch(error){if(error.code!=='ERR_SOCKET_DGRAM_NOT_RUNNING')throw error;}}
}
