import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';

const headers={
 'Access-Control-Allow-Origin':'*',
 'Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type',
 'Access-Control-Allow-Methods':'POST,OPTIONS',
 'Content-Type':'application/json',
};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});

Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response('ok',{headers});
 if(request.method!=='POST')return reply({error:'Method not allowed'},405);
 try{
  const url=Deno.env.get('SUPABASE_URL'),serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!serviceKey)return reply({error:'User management is not configured'},503);
  const token=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
  if(!token)return reply({error:'Sign in again'},401);
  const db=createClient(url,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
  const {data:{user},error:authError}=await db.auth.getUser(token);
  if(authError||!user)return reply({error:'Sign in again'},401);
  const {data:manager,error:roleError}=await db.from('wc_hub_members').select('role,active').eq('user_id',user.id).maybeSingle();
  if(roleError)return reply({error:'Could not check manager access'},503);
  if(!manager?.active||manager.role!=='manager')return reply({error:'Manager access required'},403);
  const body=await request.json().catch(()=>null);
  if(body?.action!=='invite')return reply({error:'Unknown action'},400);
  const email=String(body.email||'').trim().toLowerCase();
  const name=String(body.name||'').trim();
  if(email.length>254||!/^\S+@\S+\.\S+$/.test(email))return reply({error:'Enter a valid employee email'},422);
  if(name.length<1||name.length>100)return reply({error:'Enter the employee name (up to 100 characters)'},422);
  const redirect=Deno.env.get('HUB_INVITE_REDIRECT_URL');
  if(!redirect||!/^https:\/\//i.test(redirect)||!new URL(redirect).searchParams.has('setup')){
   return reply({error:'Invitation return URL is not configured. Ask the administrator to set it before inviting staff.'},503);
  }
  const {data,error}=await db.auth.admin.inviteUserByEmail(email,{
   data:{full_name:name},redirectTo:redirect
  });
  if(error)return reply({error:error.message||'Could not send invitation. Check the email and retry.'},409);
  if(!data.user)return reply({error:'Invitation was not confirmed. Check the user list before retrying.'},503);
  return reply({ok:true,email});
 }catch{
  return reply({error:'Could not invite the employee. Check the connection and retry.'},503);
 }
});
