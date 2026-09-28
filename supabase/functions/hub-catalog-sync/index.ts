import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {importCatalogPage} from '../wix-orders-sync/catalog-import.ts';

// Service-to-service importer only. JWT verification remains enabled as well.
// No order sync, fulfilment, payments or write requests to Wix.
Deno.serve(async(request:Request)=>{
 const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
 const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!service||request.headers.get('Authorization')!==`Bearer ${service}`)return json({error:'Forbidden'},403);
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 try{
  const body=await request.json();
  const wixKey=Deno.env.get('WIX_API_KEY'),site=Deno.env.get('WIX_SITE_ID'),url=Deno.env.get('SUPABASE_URL');
  if(!wixKey||!site||!url)return json({error:'Catalogue integration configuration missing'},503);
  const headers={'Authorization':wixKey,'wix-site-id':site,'Content-Type':'application/json'};
  const db=createClient(url,service,{auth:{persistSession:false}});
  if(body.action==='import')return json(await importCatalogPage(db,headers,site,body));
  if(body.action==='collections'){
   const rows:Record<string,unknown>[]=[];const seen=new Set<string>();let total:number|undefined;
   for(let offset=0;offset<10000;offset+=100){
    const response=await fetch('https://www.wixapis.com/stores-reader/v1/collections/query',{method:'POST',headers,body:JSON.stringify({query:{paging:{limit:100,offset}}}),signal:AbortSignal.timeout(25000)});
    if(!response.ok)throw Error(`Wix collections request failed (${response.status})`);
    const page=await response.json();
    if(!Array.isArray(page.collections)||!Number.isSafeInteger(page.totalResults)||page.totalResults<0)throw Error('Invalid collections page');
    if(total!==undefined&&total!==page.totalResults)throw Error('Collections changed during import');
    total=page.totalResults;
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
