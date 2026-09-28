import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {importCatalogPage} from '../wix-orders-sync/catalog-import.ts';

// Scoped machine importer. See docs/STOREFRONT_SECURITY_REVIEW.md.
// No order sync, fulfilment, payments or write requests to Wix.
Deno.serve(async(request:Request)=>{
 const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
 const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 const url=Deno.env.get('SUPABASE_URL');
 if(!service||!url)return json({error:'Catalogue configuration missing'},503);
 const db=createClient(url,service,{auth:{persistSession:false}});
 const token=request.headers.get('x-catalog-token');
 if(!token||!/^[a-f0-9]{64}$/.test(token))return json({error:'Forbidden'},403);
 const hex=(buffer:ArrayBuffer)=>Array.from(new Uint8Array(buffer)).map(b=>b.toString(16).padStart(2,'0')).join('');
 const hash=hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)));
 const {data:access,error:accessError}=await db.from('wc_catalog_import_access').select('expires_at').eq('token_hash',hash).gt('expires_at',new Date().toISOString()).maybeSingle();
 if(accessError||!access)return json({error:'Forbidden'},403);
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 try{
  const body=await request.json();
  const wixKey=Deno.env.get('WIX_API_KEY'),site=Deno.env.get('WIX_SITE_ID');
  if(!wixKey||!site||!url)return json({error:'Catalogue integration configuration missing'},503);
  const headers={'Authorization':wixKey,'wix-site-id':site,'Content-Type':'application/json'};
  if(body.action==='copyMedia'){
   const target=new URL(body.url);
   if(target.protocol!=='https:'||target.port||target.username||target.password||!['static.wixstatic.com','video.wixstatic.com'].includes(target.hostname)||!['catalog-media','catalog-source-media'].includes(body.bucket))throw Error('Invalid catalogue media request');
   const response=await fetch(target,{redirect:'error',signal:AbortSignal.timeout(60000)});
   if(!response.ok)throw Error(`Media download failed (${response.status})`);
   const mime=(response.headers.get('content-type')??'').split(';')[0];
   const extensions:Record<string,string>={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','video/mp4':'mp4'};
   if(!extensions[mime])throw Error('Unsupported media type');
   const limit=50*1024*1024;
   if(Number(response.headers.get('content-length'))>limit)throw Error('Media exceeds 50 MB limit');
   const chunks:Uint8Array[]=[];let size=0;
   if(!response.body)throw Error('Empty media response');
   for await(const chunk of response.body){size+=chunk.length;if(size>limit)throw Error('Media exceeds 50 MB limit');chunks.push(chunk);}
   if(!size)throw Error('Empty media file');
   const data=new Uint8Array(size);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}
   const sha=hex(await crypto.subtle.digest('SHA-256',data));
   const path=`wix/${hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(target.href)))}.${extensions[mime]}`;
   const {error:uploadError}=await db.storage.from(body.bucket).upload(path,data,{contentType:mime,upsert:true,cacheControl:'31536000'});
   if(uploadError)throw Error('Could not save media in Hub storage');
   const asset={source_url:target.href,bucket:body.bucket,path,bytes:size,content_type:mime,sha256:sha};
   const {error:saveError}=await db.from('wc_catalog_media').upsert(asset,{onConflict:'source_url'});
   if(saveError)throw Error('Could not confirm media record');
   return json({ok:true,asset});
  }
  if(body.action==='import')return json(await importCatalogPage(db,headers,site,body));
  if(body.action==='collections'){
   const rows:Record<string,unknown>[]=[];const seen=new Set<string>();let total:number|undefined;
   for(let offset=0;offset<10000;offset+=100){
    const response=await fetch('https://www.wixapis.com/stores-reader/v1/collections/query',{method:'POST',headers,body:JSON.stringify({query:{paging:{limit:100,offset}}}),signal:AbortSignal.timeout(25000)});
    if(!response.ok)throw Error(`Wix collections request failed (${response.status})`);
    const page=await response.json();
    if(!Array.isArray(page.collections)||!Number.isSafeInteger(page.totalResults)||page.totalResults<0)throw Error('Invalid collections page');
    if(total!==undefined&&total!==page.totalResults)throw Error('Collections changed during import');
    total=Number(page.totalResults);
    for(const item of page.collections){
     if(typeof item.id!=='string'||!item.id||typeof item.name!=='string'||!item.name||seen.has(item.id))throw Error('Invalid or duplicate collection');
     seen.add(item.id);rows.push({id:item.id,source_collection:item,synced_at:new Date().toISOString()});
    }
    if(rows.length===total)break;
    if(rows.length>total||page.collections.length!==100)throw Error('Incomplete collection pagination');
   }
   if(rows.length!==total||!rows.length)throw Error('Incomplete or empty collections response; previous data kept');
   const {error}=await db.from('wc_wix_catalog_collections').upsert(rows,{onConflict:'id'});
   if(error)throw Error('Could not save catalogue collections');
   return json({ok:true,count:rows.length});
  }
  return json({error:'Unknown catalogue action'},400);
 }catch(error){return json({error:error instanceof Error?error.message:'Catalogue operation failed'},400);}
});
