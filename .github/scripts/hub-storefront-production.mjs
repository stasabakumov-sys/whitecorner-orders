import {readFile} from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';

const ref='zgvnrpspwluapaxnycrg';
const token=process.env.SUPABASE_ACCESS_TOKEN;
if(!token)throw Error('SUPABASE_ACCESS_TOKEN is required');
const endpoint=`https://${ref}.supabase.co/functions/v1/hub-catalog-sync`;
const management=`https://api.supabase.com/v1/projects/${ref}`;
const literal=value=>"'"+value.replaceAll("'","''")+"'";
async function api(path,options={}){
 const response=await fetch(`${management}/${path}`,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(90000)});
 if(!response.ok)throw Error(`Supabase management request failed (${response.status}) at ${path}`);
 return response.json();
}
async function sql(query,read_only=true){return api('database/query',{method:'POST',body:JSON.stringify({query,read_only})});}
const functions=await api('functions');
const importer=functions.find(f=>f.slug==='hub-catalog-sync');
if(!importer||importer.verify_jwt!==false)throw Error('Catalog importer must already have gateway JWT disabled; stop before deployment or token creation');
console.log('Existing catalog importer gateway setting verified.');
if(process.argv.includes('--check')){
 const editorial=JSON.parse(await readFile('.github/scripts/hub-storefront-editorial-assets.json','utf8'));
 const [media]=await sql(`select count(*)::int as public_assets_needing_review from wc_catalog_media a
 where a.bucket='catalog-media' and a.source_url not in (${editorial.map(literal).join(',')})
 and not exists(select 1 from wc_wix_catalog_products p join wc_wix_catalog_jobs j using(site_id,run_id)
 where p.source_product->>'visible'='true' and jsonb_path_exists(p.source_product,'$.**.url ? (@ == $needle)',jsonb_build_object('needle',a.source_url)))`);
 console.log(JSON.stringify({publicAssetsNeedingReview:media.public_assets_needing_review}));
 process.exit(0);
}

if(process.argv.includes('--apply')){
 const name='20260930000400_catalog_release_fence';
 const source=(await readFile(`supabase/migrations/${name}.sql`,'utf8')).replaceAll('\r','');
 const version=name.slice(0,14);
 await sql(`begin; select pg_advisory_xact_lock(20260930000400); do $release$ begin
 if exists(select 1 from supabase_migrations.schema_migrations where version='${version}') then
  if (select replace(statements[1],E'\\r','') from supabase_migrations.schema_migrations where version='${version}') is distinct from ${literal(source)} then raise exception 'Catalog release migration differs from registered source';end if;
 else execute ${literal(source)};insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','${name.slice(15)}',array[${literal(source)}]);end if;end $release$;commit;`,false);
 console.log(`${name} applied and registered.`);
 process.exit(0);
}

if(!process.argv.includes('--sync'))throw Error('Choose --apply or --sync');
const jobToken=randomBytes(32).toString('hex');
const hash=createHash('sha256').update(jobToken).digest('hex');
console.log('::add-mask::'+jobToken);
await sql(`insert into wc_catalog_import_access(token_hash,expires_at) values(${literal(hash)},now()+interval '110 minutes')`,false);
try{
 async function action(body){
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','x-catalog-token':jobToken},body:JSON.stringify(body),signal:AbortSignal.timeout(120000)});
  const data=await response.json();
  if(!response.ok||!data.ok)throw Error(`Catalog action ${body.action} failed: ${String(data.error??response.status).slice(0,220)}`);
  return data;
 }
 const before=await action({action:'status'});
 let job=await action({action:'import',restart:before.complete});
 for(let page=0;!job.complete&&page<400;page++){
  if(page%10===0)console.log(`Wix scan ${job.next_offset}/${job.expected_total??'?'}`);
  job=await action({action:'import'});
 }
 if(!job.complete)throw Error('Wix scan incomplete; saved progress retained');
 const collections=await action({action:'collections'});
 console.log(`Wix scan complete: ${job.next_offset} products, ${collections.count} collections.`);
 let mediaComplete=false,copied=0,deferred=0;
 for(let item=0;item<10000;item++){
  const result=await action({action:'copyNextMedia'});
  if(result.complete){mediaComplete=true;break;}
  if(result.copied)copied++;
  if(result.deferredVideo)deferred++;
  if((copied+deferred)%25===0)console.log(`Media processed: ${copied} copied, ${deferred} deferred videos.`);
 }
 if(!mediaComplete)throw Error('Media processing limit reached; saved progress retained');
 const result=await action({action:'publish'});
 const [audit]=await sql("select published_at, jsonb_array_length(payload->'products') as products from wc_storefront_catalog where id='live'");
 if(Date.parse(audit?.published_at)!==Date.parse(result.publishedAt)||audit.products!==result.products)throw Error('Published catalogue verification failed');
 console.log(JSON.stringify({publishedAt:result.publishedAt,products:result.products,categories:result.categories,pendingVideos:result.pendingVideos,copied,deferred}));
}finally{
 await sql(`delete from wc_catalog_import_access where token_hash=${literal(hash)} or expires_at<now()`,false);
}
