// Bounded requests and one shared sign-in prevent a stalled network or expired
// refresh token from permanently stopping the station heartbeat.
export function createHubClient(settings,{fetchImpl=fetch,timeoutMs=15000,downloadTimeoutMs=60000,now=Date.now}={}){
 let session=null,expiresAt=0,signingIn=null;
 async function request(path,options,read,timeout=timeoutMs){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try{return await read(await fetchImpl(settings.url+path,{...options,signal:controller.signal}));}
  catch(error){
   if(controller.signal.aborted)throw Error('Hub connection timed out. The station will reconnect automatically.');
   if(error instanceof TypeError)throw Error('Hub connection failed. Check the internet connection; the station will reconnect automatically.');
   throw error;
  }finally{clearTimeout(timer);}
 }
 async function signIn(grant,body){
  const result=await request(`/auth/v1/token?grant_type=${grant}`,{method:'POST',headers:{apikey:settings.anonKey,'Content-Type':'application/json'},body:JSON.stringify(body)},async response=>{
   const data=await response.json();
   if(!response.ok||!data?.access_token){const error=Error('Station sign-in failed. Check the saved manager account.');error.invalidRefresh=grant==='refresh_token'&&[400,401,403].includes(response.status);throw error;}
   return data;
  });
  session=result;expiresAt=now()+Math.max(30,Number(result.expires_in||3600)-60)*1000;
 }
 async function token(force=false){
  if(!force&&session&&now()<expiresAt)return session.access_token;
  if(!signingIn)signingIn=(async()=>{
   if(session){try{await signIn('refresh_token',{refresh_token:session.refresh_token});return;}catch(error){if(!error.invalidRefresh)throw error;session=null;}}
   await signIn('password',{email:settings.email,password:settings.password});
  })().finally(()=>{signingIn=null;});
  await signingIn;return session.access_token;
 }
 async function authenticated(path,options,read,timeout){
  for(let attempt=0;attempt<2;attempt++){
   const auth=await token(attempt===1);
   const result=await request(path,{...options,headers:{...options.headers,apikey:settings.anonKey,Authorization:`Bearer ${auth}`}},async response=>{
    if(response.status===401){await response.arrayBuffer();return {unauthorized:true};}
    return {value:await read(response)};
   },timeout);
   if(!result.unauthorized)return result.value;
  }
  throw Error('Station session was rejected. Check the saved manager account.');
 }
 return {
  rpc(name,body={}){return authenticated(`/rest/v1/rpc/${name}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)},async response=>{
   const result=await response.json();
   if(!response.ok)throw Error(result?.message||`Hub request failed (${response.status}).`);
   return result;
  });},
  fetchFile(file){
   if(!file?.object_path||!String(file.filename||'').toLowerCase().endsWith('.rd'))return Promise.reject(Error('Task contains an invalid RD file.'));
   const path=String(file.object_path).split('/').map(encodeURIComponent).join('/');
   return authenticated(`/storage/v1/object/authenticated/box-rd-files/${path}`,{},async response=>{
    if(!response.ok)throw Error(`${file.filename}: could not download from Hub (${response.status}).`);
    const buffer=Buffer.from(await response.arrayBuffer());
    if(buffer.length!==Number(file.size_bytes)||!buffer.length||buffer.length>20971520)throw Error(`${file.filename}: downloaded file size does not match the saved task.`);
    return buffer;
   },downloadTimeoutMs);
  },
 };
}
