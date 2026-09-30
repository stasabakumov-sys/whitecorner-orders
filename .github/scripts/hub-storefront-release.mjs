import {newestFirst} from './hub-storefront-order.mjs';
import {readFile} from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';
import {assetUrl,mediaItems,buildCatalog} from './hub-storefront-model.mjs';
import {cardPresentation} from './hub-storefront-presentation.mjs';
import {syncRestart} from './hub-storefront-freshness.mjs';
const ref='zgvnrpspwluapaxnycrg',base=`https://${ref}.supabase.co`;
const token=process.env.SUPABASE_ACCESS_TOKEN;if(!token)throw Error('SUPABASE_ACCESS_TOKEN is required');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function request(url,options={}){
 for(let attempt=0;attempt<4;attempt++){
  let response;
  try{response=await fetch(url,{...options,signal:AbortSignal.timeout(90000)});}catch{if(attempt===3)throw Error('Network failure; saved progress is retained');await sleep(1000*2**attempt);continue;}
  if(response.ok)return response;
  if([429,500,502,503,504].includes(response.status)&&attempt<3){await sleep(1000*2**attempt);continue;}
  // Never log request headers or arbitrary provider response bodies.
  throw Error(`Request failed (${response.status}) at ${new URL(url).pathname}`);
 }
}
async function management(path,options={}){return request(`https://api.supabase.com/v1/projects/${ref}/${path}`,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...options.headers}});}
async function sql(query,read_only=true){return (await management('database/query',{method:'POST',body:JSON.stringify({query,read_only})})).json();}
const literal=s=>"'"+s.replaceAll("'","''")+"'";
if(process.argv.includes('--presentation')){
 const [row]=await sql("select payload,published_at from wc_storefront_catalog where id='live'");
 if(!row?.payload?.products?.length)throw Error('Published Hub catalogue is missing');
 const sourceRows=await sql('select shipping_product_id,source_product from wc_wix_catalog_products');
 const catalog={...row.payload,products:newestFirst(row.payload.products,sourceRows).map(p=>({...p,...cardPresentation(p,row.payload.categories)}))};
 const saved=await sql(`update wc_storefront_catalog set payload=${literal(JSON.stringify(catalog))}::jsonb where id='live' and published_at=${literal(row.published_at)}::timestamptz and payload=${literal(JSON.stringify(row.payload))}::jsonb returning id`,false);
 if(saved.length!==1)throw Error('Catalogue changed concurrently; retry from the latest snapshot');
 console.log(JSON.stringify({presentationUpdated:catalog.products.length,examples:catalog.products.slice(0,3).map(p=>({title:p.name,attributes:p.cardAttributes}))}));
}
if(process.argv.includes('--apply')){
 for(const name of ['20260928000100_storefront_catalog','20260928000200_catalog_import_access','20260928000300_catalog_media_issues']){const version=name.slice(0,14);const source=(await readFile(`supabase/migrations/${name}.sql`,'utf8')).replaceAll('\r','');
 await sql(`begin; select pg_advisory_xact_lock(20260928000100); do $release$ begin
 if exists(select 1 from supabase_migrations.schema_migrations where version='${version}') then
  if (select replace(statements[1],E'\\r','') from supabase_migrations.schema_migrations where version='${version}') is distinct from ${literal(source)} then raise exception 'Storefront migration differs from registered source';end if;
 else execute ${literal(source)};insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','${name.slice(15)}',array[${literal(source)}]);end if;end $release$;commit;`,false);
 console.log(`${name} applied and registered.`);}
}
if(process.argv.includes('--sync')){
 const restart=syncRestart(process.argv);
 const jobToken=randomBytes(32).toString('hex');const jobHash=createHash('sha256').update(jobToken).digest('hex');
 console.log('::add-mask::'+jobToken);
 await sql("insert into wc_catalog_import_access(token_hash,expires_at) values("+literal(jobHash)+",now()+interval '110 minutes')",false);
 try{
 async function action(body){
  const response=await fetch(base+'/functions/v1/hub-catalog-sync',{method:'POST',headers:{'Content-Type':'application/json','x-catalog-token':jobToken},body:JSON.stringify(body),signal:AbortSignal.timeout(120000)});
  const data=await response.json();if(!response.ok||!data.ok)throw Error('Catalogue importer: '+String(data.error??response.status).slice(0,250));return data;
 }
 let job=await action({action:'import',restart});
 if(!restart&&job.complete)console.log('Resuming a completed run: this does not perform a fresh Wix scan. Use refresh for current Wix data.');
 for(let page=0;!job.complete&&page<400;page++){
  console.log(`Wix → Hub: ${job.next_offset}/${job.expected_total}`);
  job=await action({action:'import'});
 }
 if(!job.complete)throw Error('Catalogue import incomplete; resume before publication');
 const collectionResult=await action({action:'collections'});
 console.log(`Wix → Hub complete: ${job.next_offset} products, ${collectionResult.count} collections.`);
 const rows=await sql(`select shipping_product_id,source_product from wc_wix_catalog_products where run_id=${literal(job.run_id)}::uuid order by wix_product_id`);
 if(rows.length!==job.expected_total)throw Error('Saved product count differs from complete import');
 const collections=await sql('select id,source_collection from wc_wix_catalog_collections order by id');
 // Rest pagination is explicit; media can exceed PostgREST's default 1000-row cap.
 const existing=await sql('select source_url,bucket,path,bytes,sha256,content_type from wc_catalog_media');
 const assets=new Map(existing.map(a=>[a.source_url,a]));
 const needed=new Map();
 for(const row of rows)for(const item of mediaItems(row.source_product)){
  const old=needed.get(item.url);needed.set(item.url,{...item,public:old?.public||row.source_product.visible===true});
 }
 const editorial=JSON.parse(await readFile('.github/scripts/hub-storefront-editorial-assets.json','utf8'));
 for(const url of editorial)needed.set(assetUrl(url),{url:assetUrl(url),kind:'image',public:true});
 let completed=0,bytes=0;const failures=[];
 const queue=[...needed.values()];
 async function worker(){while(queue.length){const item=queue.shift();try{
  const bucket=item.public?'catalog-media':'catalog-source-media';
  const saved=assets.get(item.url);
  if(saved&&(saved.bucket===bucket||saved.bucket==='catalog-media')){completed++;continue;}
  const response=await fetch(assetUrl(item.url),{redirect:'error',signal:AbortSignal.timeout(90000)});
  if(item.kind==='video'&&[403,404].includes(response.status)){
   await sql(`insert into wc_catalog_media_issues(source_url,reason) values(${literal(item.url)},${literal('Wix video unavailable: HTTP '+response.status)}) on conflict(source_url) do update set reason=excluded.reason,checked_at=now()`,false);
   completed++;continue;
  }
  if(!response.ok)throw Error(`Wix media download failed (${response.status})`);
  const mime=(response.headers.get('content-type')??'').split(';')[0];
  const limit=50*1024*1024;
  if(Number(response.headers.get('content-length'))>limit&&item.kind==='video'){
   await sql(`insert into wc_catalog_media_issues(source_url,reason) values(${literal(item.url)},'Video exceeds 50 MB storage limit') on conflict(source_url) do update set reason=excluded.reason,checked_at=now()`,false);
   await response.body.cancel();completed++;continue;
  }
  const chunks=[];let size=0;
  for await(const chunk of response.body){size+=chunk.length;if(size>limit)throw Error('Media exceeds 50 MB storage limit');chunks.push(chunk);}
  if(!size)throw Error('Empty media file');
  const buffer=Buffer.concat(chunks);const sha256=createHash('sha256').update(buffer).digest('hex');
  const prepared=await action({action:'prepareMedia',url:assetUrl(item.url),bucket,contentType:mime});
  if(new URL(prepared.signedUrl).origin!==base)throw Error('Unexpected upload destination');
  await request(prepared.signedUrl,{method:'PUT',headers:{'Content-Type':mime,'x-upsert':'true'},body:buffer});
  const result=await action({action:'confirmMedia',url:assetUrl(item.url),bucket,contentType:mime,bytes:size,sha256});
  const asset=result.asset;
  await sql(`delete from wc_catalog_media_issues where source_url=${literal(item.url)}`,false);
  assets.set(item.url,asset);completed++;bytes+=size;
  if(completed%25===0)console.log(`Media saved in Hub: ${completed}/${needed.size}`);
 }catch(error){failures.push({source:item.url,error:error.message});}}}
 await Promise.all(Array.from({length:5},worker));
 console.log(JSON.stringify({mediaTotal:needed.size,mediaComplete:completed,newBytes:bytes,failures:failures.length}));
 if(failures.length){console.log(JSON.stringify(failures));throw Error('Media incomplete. Previous storefront catalogue kept; rerun to resume.');}
 const catalog=buildCatalog(rows,collections,assets,base);
 catalog.editorialAssets=Object.fromEntries(editorial.map(url=>{const asset=assets.get(url);return [url,`${base}/storage/v1/object/public/${asset.bucket}/${asset.path}`];}));
 // Anonymous contract contains only the separate, explicitly selected public projection.
 await sql(`insert into wc_storefront_catalog(id,payload,published_at) values('live',${literal(JSON.stringify(catalog))}::jsonb,${literal(catalog.syncedAt)}::timestamptz) on conflict(id) do update set payload=excluded.payload,published_at=excluded.published_at`,false);
 const anon='sb_publishable_DwutkRc9dxioIdUcdPn4gA_RfDb1-n_';
 if(!anon)throw Error('Anonymous verification key unavailable');
 const published=await (await request(`${base}/rest/v1/wc_storefront_catalog?select=payload&id=eq.live`,{headers:{apikey:anon}})).json();
 if(published[0]?.payload.products.length!==catalog.products.length)throw Error('Published catalogue verification failed');
 // Existing private tables must remain inaccessible to anonymous callers.
 for(const table of ['wc_wix_catalog_products','wc_catalog_media','wc_shipping_products']){
  const r=await fetch(`${base}/rest/v1/${table}?select=*&limit=1`,{headers:{apikey:anon}});
  if(r.ok&&(await r.json()).length)throw Error('Private catalogue data exposed to anonymous access');
 }
 console.log(JSON.stringify({publishedProducts:catalog.products.length,hiddenProducts:rows.length-catalog.products.length,categories:catalog.categories.map(c=>({name:c.name,path:c.path,products:catalog.products.filter(p=>c.id==='all'||p.categoryIds.includes(c.id)).length})),variants:catalog.products.reduce((n,p)=>n+p.variants.length,0),publishedAt:catalog.syncedAt}));
 console.log('Media requiring review:',JSON.stringify(await sql('select reason,count(*)::int count from wc_catalog_media_issues group by reason')));
 }finally{await sql(`delete from wc_catalog_import_access where token_hash=${literal(jobHash)} or expires_at<now()`,false);}
}
