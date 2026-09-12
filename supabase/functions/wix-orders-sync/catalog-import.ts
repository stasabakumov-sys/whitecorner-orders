import {historySnapshot} from './order-history.ts';

export function catalogSnapshot(product: any) {
  if (typeof product?.id !== 'string' || !product.id || typeof product?.name !== 'string' || !product.name.trim()) throw new Error('Invalid Wix product');
  // V1 returns at most 1000 variants embedded in a product. Never silently accept a capped array.
  if (!Array.isArray(product.variants) || product.variants.length >= 1000 || product.variants.some((v: any) => typeof v?.id !== 'string' || !v.id) ||
      new Set(product.variants.map((v: any) => v.id)).size !== product.variants.length || product.manageVariants && !product.variants.length) {
    throw new Error('Wix product variants are missing, duplicated or possibly truncated. Import stopped for review.');
  }
  const snapshot = historySnapshot(product);
  if (snapshot.raw_order.id !== product.id || snapshot.raw_order.name !== product.name) throw new Error('Invalid Unicode in product identity requires review');
  return {product: snapshot.raw_order, source_json: snapshot.source_json};
}

// Refresh only an existing imported snapshot. Hub operational fields and import checkpoints are untouched.
export async function refreshCatalogProduct(db:any,headers:Record<string,string>,site:string,productId:unknown,call:typeof fetch=fetch){
  if(typeof productId!=='string'||!/^[0-9a-f-]{36}$/i.test(productId))throw Error('Invalid Hub product ID');
  const {data:saved,error}=await db.from('wc_wix_catalog_products').select('wix_product_id,synced_at').eq('shipping_product_id',productId).eq('site_id',site).maybeSingle();
  if(error||!saved)throw Error('Imported Wix product not found. Reload the product card and retry.');
  async function read(path:string,payload?:unknown){
    const response=await call(`https://www.wixapis.com${path}`,{method:payload===undefined?'GET':'POST',headers,...(payload===undefined?{}:{body:JSON.stringify(payload)}),signal:AbortSignal.timeout(25000)});
    if(!response.ok)throw Error(`Wix product refresh failed (${response.status}). Check catalogue permissions and retry.`);
    return response.json();
  }
  const version=await read('/stores/v3/provision/version');
  if(version.catalogVersion!=='V1_CATALOG')throw Error('Catalogue version changed. Review the import before refreshing.');
  const result=await read('/stores-reader/v1/products/query',{includeHiddenProducts:true,includeVariants:true,query:{filter:JSON.stringify({id:{$hasSome:[saved.wix_product_id]}}),paging:{limit:2,offset:0}}});
  if(result.totalResults!==1||result.products?.length!==1||result.products[0].id!==saved.wix_product_id)throw Error('Wix did not return the exact linked product. Saved data was kept.');
  const snapshot=catalogSnapshot(result.products[0]);
  const {data:updated,error:saveError}=await db.from('wc_wix_catalog_products').update({source_product:snapshot.product,source_json:snapshot.source_json,synced_at:new Date().toISOString()})
    .eq('shipping_product_id',productId).eq('site_id',site).eq('wix_product_id',saved.wix_product_id).eq('synced_at',saved.synced_at).select('source_product,synced_at').maybeSingle();
  if(saveError||!updated)throw Error('Product refresh could not be confirmed, or another import changed it. Reload the card before retrying.');
  return {ok:true,...updated};
}

export async function importCatalogPage(db: any, headers: Record<string,string>, site: string, body: Record<string,unknown>, call: typeof fetch = fetch) {
  async function read(path: string, payload?: unknown) {
    const response = await call(`https://www.wixapis.com${path}`, {method:payload === undefined ? 'GET' : 'POST',headers,
      ...(payload === undefined ? {} : {body:JSON.stringify(payload)}),signal:AbortSignal.timeout(25000)});
    if (!response.ok) throw new Error(response.status===403 ? 'Wix catalogue permission denied. Read Products and hidden-product access are required.' : `Wix catalogue request failed (${response.status}); resume to retry.`);
    return response.json();
  }
  async function rpc(name: string, args: Record<string, unknown>) {
    const {data,error} = await db.rpc(name,args);
    if(error) throw new Error(`Catalogue save failed${/^[A-Z0-9]{5}$/.test(error.code||'')?` (${error.code})`:''}. Saved pages are kept. Check the catalogue migration or review conflicting products.`);
    return data;
  }
  const version = await read('/stores/v3/provision/version');
  if(version.catalogVersion!=='V1_CATALOG') throw new Error('This importer supports the reviewed V1 catalogue only. Run catalogue review again.');
  const job = await rpc('wc_wix_catalog_begin',{p_site:site,p_restart:body.restart===true});
  if(job.complete)return {ok:true,...job};
  const data = await read('/stores-reader/v1/products/query',{includeHiddenProducts:true,includeVariants:true,
    query:{paging:{limit:25,offset:job.next_offset},sort:JSON.stringify([{numericId:'asc'}])}});
  if(!Array.isArray(data.products)||!Number.isSafeInteger(data.totalResults)||data.totalResults<0)throw new Error('Wix catalogue count or products missing; no page was saved.');
  const rows=data.products.map(catalogSnapshot);
  if(new Set(rows.map((r:any)=>r.product.id)).size!==rows.length)throw new Error('Duplicate Wix product IDs; no page was saved.');
  const saved=await rpc('wc_wix_catalog_page',{p_site:site,p_run:job.run_id,p_offset:job.next_offset,p_total:data.totalResults,p_rows:rows});
  return {ok:true,...saved};
}
