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
