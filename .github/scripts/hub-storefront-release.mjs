import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {assetUrl,mediaItems,buildCatalog} from './hub-storefront-model.mjs';
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
if(process.argv.includes('--apply')){
 const name='20260928000100_storefront_catalog';const source=(await readFile(`supabase/migrations/${name}.sql`,'utf8')).replaceAll('\r','');
 await sql(`begin; select pg_advisory_xact_lock(20260928000100); do $release$ begin
 if exists(select 1 from supabase_migrations.schema_migrations where version='20260928000100') then
  if (select replace(statements[1],E'\\r','') from supabase_migrations.schema_migrations where version='20260928000100') is distinct from ${literal(source)} then raise exception 'Storefront migration differs from registered source';end if;
 else execute ${literal(source)};insert into supabase_migrations.schema_migrations(version,name,statements) values('20260928000100','storefront_catalog',array[${literal(source)}]);end if;end $release$;commit;`,false);
 console.log('Storefront schema applied and registered.');
}
if(process.argv.includes('--sync')){
 const keys=await (await management('api-keys')).json();
 const service=keys.find(k=>k.name==='service_role')?.api_key;
 if(!service)throw Error('Service key is unavailable');
 console.log(`::add-mask::${service}`);
 const headers={Authorization:`Bearer ${service}`,apikey:service,'Content-Type':'application/json'};
 const rest=async(path,options={})=>request(`${base}/rest/v1/${path}`,{...options,headers:{...headers,...options.headers}});
 async function action(body){
  const r=await request(`${base}/functions/v1/hub-catalog-sync`,{method:'POST',headers,body:JSON.stringify(body)});
  const data=await r.json();if(!data.ok)throw Error('Catalogue importer did not confirm completion');return data;
 }
 let job=await action({action:'import',restart:process.argv.includes('--restart')});
 for(let page=0;!job.complete&&page<400;page++){
  console.log(`Wix → Hub: ${job.next_offset}/${job.expected_total}`);
  job=await action({action:'import'});
 }
 if(!job.complete)throw Error('Catalogue import incomplete; resume before publication');
 const collectionResult=await action({action:'collections'});
 console.log(`Wix → Hub complete: ${job.next_offset} products, ${collectionResult.count} collections.`);
 const rows=await (await rest(`wc_wix_catalog_products?select=shipping_product_id,source_product&run_id=eq.${job.run_id}&order=wix_product_id`)).json();
 if(rows.length!==job.expected_total)throw Error('Saved product count differs from complete import');
 const collections=await (await rest('wc_wix_catalog_collections?select=id,source_collection')).json();
 // Rest pagination is explicit; media can exceed PostgREST's default 1000-row cap.
 const existing=[];
 for(let offset=0;;offset+=1000){const page=await (await rest(`wc_catalog_media?select=source_url,bucket,path,bytes,sha256,content_type&order=source_url&offset=${offset}&limit=1000`)).json();existing.push(...page);if(page.length<1000)break;}
 const assets=new Map(existing.map(a=>[a.source_url,a]));
 const needed=new Map();
 for(const row of rows)for(const item of mediaItems(row.source_product)){
  const old=needed.get(item.url);needed.set(item.url,{...item,public:old?.public||row.source_product.visible===true});
 }
 let completed=0,bytes=0;const failures=[];
 const queue=[...needed.values()];
 async function worker(){while(queue.length){const item=queue.shift();try{
  const bucket=item.public?'catalog-media':'catalog-source-media';
  const saved=assets.get(item.url);
  if(saved&&(saved.bucket===bucket||saved.bucket==='catalog-media')){completed++;continue;}
  const response=await request(assetUrl(item.url),{redirect:'error'});
  const mime=(response.headers.get('content-type')??'').split(';')[0];
  const extensions={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','video/mp4':'mp4'};
  if(!extensions[mime])throw Error('Unsupported asset content type');
  const limit=50*1024*1024;
  if(Number(response.headers.get('content-length'))>limit)throw Error('Asset exceeds 50 MB bucket limit');
  const chunks=[];let size=0;
  for await(const chunk of response.body){size+=chunk.length;if(size>limit)throw Error('Asset exceeds 50 MB bucket limit');chunks.push(chunk);}
  if(!size)throw Error('Empty media file');
  const buffer=Buffer.concat(chunks),hash=createHash('sha256').update(buffer).digest('hex');
  const path=`wix/${createHash('sha256').update(item.url).digest('hex')}.${extensions[mime]}`;
  await request(`${base}/storage/v1/object/${bucket}/${path}`,{method:'POST',headers:{Authorization:`Bearer ${service}`,apikey:service,'Content-Type':mime,'x-upsert':'true','cache-control':'public, max-age=31536000'},body:buffer});
  const asset={source_url:item.url,bucket,path,content_type:mime,bytes:size,sha256:hash};
  await rest('wc_catalog_media?on_conflict=source_url',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify(asset)});
  assets.set(item.url,asset);completed++;bytes+=size;
  if(completed%25===0)console.log(`Media saved in Hub: ${completed}/${needed.size}`);
 }catch(error){failures.push({source:item.url,error:error.message});}}}
 await Promise.all(Array.from({length:5},worker));
 console.log(JSON.stringify({mediaTotal:needed.size,mediaComplete:completed,newBytes:bytes,failures:failures.length}));
 if(failures.length){console.log(JSON.stringify(failures));throw Error('Media incomplete. Previous storefront catalogue kept; rerun to resume.');}
 const catalog=buildCatalog(rows,collections,assets,base);
 // Anonymous contract contains only the separate, explicitly selected public projection.
 await rest('wc_storefront_catalog?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify({id:'live',payload:catalog,published_at:catalog.syncedAt})});
 const anon=keys.find(k=>k.name==='anon')?.api_key;
 if(!anon)throw Error('Anonymous verification key unavailable');
 const published=await (await request(`${base}/rest/v1/wc_storefront_catalog?select=payload&id=eq.live`,{headers:{apikey:anon,Authorization:`Bearer ${anon}`}})).json();
 if(published[0]?.payload.products.length!==catalog.products.length)throw Error('Published catalogue verification failed');
 // Existing private tables must remain inaccessible to anonymous callers.
 for(const table of ['wc_wix_catalog_products','wc_catalog_media','wc_shipping_products']){
  const r=await fetch(`${base}/rest/v1/${table}?select=*&limit=1`,{headers:{apikey:anon,Authorization:`Bearer ${anon}`}});
  if(r.ok&&(await r.json()).length)throw Error('Private catalogue data exposed to anonymous access');
 }
 console.log(JSON.stringify({publishedProducts:catalog.products.length,hiddenProducts:rows.length-catalog.products.length,categories:catalog.categories.map(c=>({name:c.name,path:c.path,products:catalog.products.filter(p=>c.id==='all'||p.categoryIds.includes(c.id)).length})),variants:catalog.products.reduce((n,p)=>n+p.variants.length,0),publishedAt:catalog.syncedAt}));
}
