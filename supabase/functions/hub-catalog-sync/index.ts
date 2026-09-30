import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {importCatalogPage} from '../wix-orders-sync/catalog-import.ts';
import {assetUrl,mediaItems,buildCatalog} from '../../../.github/scripts/hub-storefront-model.mjs';
import editorial from '../../../.github/scripts/hub-storefront-editorial-assets.json' with {type:'json'};

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
  const all=async(table:string,columns:string,filters:Record<string,string>={})=>{
   const rows:Record<string,any>[]=[];
   const keys:Record<string,string>={wc_wix_catalog_products:'wix_product_id',wc_wix_catalog_collections:'id',wc_catalog_media:'source_url',wc_catalog_media_issues:'source_url'};
   for(let from=0;from<10000;from+=500){
    let query=db.from(table).select(columns);
    for(const [field,value] of Object.entries(filters))query=query.eq(field,value);
    const {data,error}=await query.order(keys[table]).range(from,from+499);
    if(error||!data)throw Error(`Could not read saved catalogue ${table}`);
    rows.push(...data);
    if(data.length<500)return rows;
   }
   throw Error('Catalogue exceeds safe pagination limit');
  };
  const current=async()=>{
   const {data:job,error}=await db.from('wc_wix_catalog_jobs').select('run_id,next_offset,expected_total,complete,updated_at').eq('site_id',site).maybeSingle();
   if(error||!job)throw Error('Catalogue import has not started');
   return job;
  };
  if(body.action==='status'){
   const job=await current();
   const {data:live}=await db.from('wc_storefront_catalog').select('published_at').eq('id','live').maybeSingle();
   return json({ok:true,complete:job.complete,offset:job.next_offset,total:job.expected_total,runId:job.run_id,publishedAt:live?.published_at??null});
  }
  if(body.action==='copyNextMedia'||body.action==='publish'){
   const job=await current();
   if(!job.complete||job.expected_total!==job.next_offset)throw Error('Complete Wix scan required');
   const rows=await all('wc_wix_catalog_products','wix_product_id,shipping_product_id,source_product',{site_id:site,run_id:job.run_id});
   if(rows.length!==job.expected_total)throw Error('Saved product count differs from complete Wix scan');
   const collections=await all('wc_wix_catalog_collections','id,source_collection',{run_id:job.run_id});
   if(!collections.length)throw Error('Collections for this Wix scan are missing');
   const assets=new Map((await all('wc_catalog_media','source_url,bucket,path,bytes,content_type,sha256')).map(a=>[a.source_url,a]));
   if(body.action==='copyNextMedia'){
    const needed=new Map<string,{url:string,kind:string,public:boolean}>();
    for(const row of rows)for(const item of mediaItems(row.source_product)){
     const old=needed.get(item.url);
     needed.set(item.url,{url:item.url,kind:item.kind,public:old?.public===true||row.source_product.visible===true});
    }
    for(const url of editorial)needed.set(assetUrl(url),{url:assetUrl(url),kind:'image',public:true});
    const issues=new Set((await all('wc_catalog_media_issues','source_url')).map(i=>i.source_url));
    for(const item of needed.values()){
     const saved=assets.get(item.url);
     if(saved&&(saved.bucket===(item.public?'catalog-media':'catalog-source-media')||!item.public&&saved.bucket==='catalog-media'))continue;
     if(item.kind==='video'&&issues.has(item.url))continue;
     body.action='copyMedia';body.url=item.url;body.bucket=item.public?'catalog-media':'catalog-source-media';body.automated=true;
     break;
    }
    if(body.action==='copyNextMedia')return json({ok:true,complete:true,needed:needed.size});
   }else{
    const publicUrls=new Set<string>(editorial.map(assetUrl));
    for(const row of rows)if(row.source_product.visible===true)for(const item of mediaItems(row.source_product))publicUrls.add(item.url);
    const obsoletePublic=[...assets.values()].filter(a=>a.bucket==='catalog-media'&&!publicUrls.has(a.source_url)).length;
    if(obsoletePublic)throw Error(`Manual media review required before publication: ${obsoletePublic} public assets are no longer in the visible catalogue`);
    const catalog=buildCatalog(rows,collections,assets,url) as ReturnType<typeof buildCatalog>&{editorialAssets?:Record<string,string>};
    catalog.editorialAssets=Object.fromEntries(editorial.map(source=>{
     const a=assets.get(assetUrl(source));
     if(!a||a.bucket!=='catalog-media')throw Error('Editorial media is incomplete');
     return [source,`${url}/storage/v1/object/public/${a.bucket}/${a.path}`];
    }));
    const {data:published,error}=await db.rpc('wc_storefront_publish_run',{p_site:site,p_run:job.run_id,p_payload:catalog});
    if(error||!published)throw Error('Catalogue publication failed or scan changed');
    return json({ok:true,publishedAt:published,products:catalog.products.length,categories:catalog.categories.length,pendingVideos:catalog.products.reduce((n:number,p:{pendingMedia:number})=>n+p.pendingMedia,0)});
   }
  }
  if(body.action==='prepareMedia'||body.action==='confirmMedia'){
   const target=new URL(body.url);
   if(target.protocol!=='https:'||target.port||target.username||target.password||!['static.wixstatic.com','video.wixstatic.com'].includes(target.hostname)||!['catalog-media','catalog-source-media'].includes(body.bucket))throw Error('Invalid catalogue media request');
   const extensions:Record<string,string>={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','video/mp4':'mp4'};
   if(!extensions[body.contentType])throw Error('Unsupported media type');
   const path=`wix/${hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(target.href)))}.${extensions[body.contentType]}`;
   if(body.action==='prepareMedia'){
    const {data,error}=await db.storage.from(body.bucket).createSignedUploadUrl(path,{upsert:true});
    if(error||!data)throw Error('Could not prepare catalogue media upload');
    return json({ok:true,signedUrl:data.signedUrl,path});
   }
   const filename=path.slice(4);
   const {data:files,error:filesError}=await db.storage.from(body.bucket).list('wix',{search:filename,limit:2});
   const saved=files?.find(f=>f.name===filename);
   if(filesError||!saved||saved.metadata?.size!==body.bytes||saved.metadata?.mimetype!==body.contentType||!/^[a-f0-9]{64}$/.test(body.sha256))throw Error('Catalogue media upload could not be verified');
   const asset={source_url:target.href,bucket:body.bucket,path,bytes:body.bytes,content_type:body.contentType,sha256:body.sha256};
   const {error:saveError}=await db.from('wc_catalog_media').upsert(asset,{onConflict:'source_url'});
   if(saveError)throw Error('Could not confirm media record');
   return json({ok:true,asset});
  }
  if(body.action==='copyMedia'){
   const target=new URL(body.url);
   if(target.protocol!=='https:'||target.port||target.username||target.password||!['static.wixstatic.com','video.wixstatic.com'].includes(target.hostname)||!['catalog-media','catalog-source-media'].includes(body.bucket))throw Error('Invalid catalogue media request');
   const response=await fetch(target,{redirect:'error',signal:AbortSignal.timeout(60000)});
   if(!response.ok){
    if(body.automated===true&&[403,404].includes(response.status)&&target.hostname==='video.wixstatic.com'){
     const {error}=await db.from('wc_catalog_media_issues').upsert({source_url:target.href,reason:`Wix video unavailable: HTTP ${response.status}`,checked_at:new Date().toISOString()},{onConflict:'source_url'});
     if(error)throw Error('Could not record unavailable video');
     return json({ok:true,copied:false,deferredVideo:true});
    }
    throw Error(`Media download failed (${response.status})`);
   }
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
   if(body.automated===true){
    await db.from('wc_catalog_media_issues').delete().eq('source_url',target.href);
    return json({ok:true,copied:true});
   }
   return json({ok:true,asset});
  }
  if(body.action==='import')return json(await importCatalogPage(db,headers,site,body));
  if(body.action==='collections'){
   const job=await current();
   if(!job.complete)throw Error('Complete product scan required before collections');
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
     seen.add(item.id);rows.push({id:item.id,source_collection:item,synced_at:new Date().toISOString(),run_id:job.run_id});
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
