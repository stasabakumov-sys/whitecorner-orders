// Read-only catalogue preflight. No catalogue/order/packaging mutations belong here.
type Version = 'V1_CATALOG' | 'V3_CATALOG';
export async function queryCatalogPage(body: Record<string, unknown>, headers: Record<string, string>, call: typeof fetch = fetch) {
  const offset = body.offset ?? 0;
  const cursor = body.cursor ?? null;
  if (!Number.isSafeInteger(offset) || Number(offset) < 0 || Number(offset) > 100000 ||
      (cursor !== null && (typeof cursor !== 'string' || !cursor || cursor.length > 10000))) {
    throw new Error('Invalid catalogue pagination');
  }
  async function read(path: string, payload?: unknown) {
    const response = await call(`https://www.wixapis.com${path}`, {
      method: payload === undefined ? 'GET' : 'POST', headers,
      ...(payload === undefined ? {} : {body: JSON.stringify(payload)}), signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) {
      const permission = path.includes('/provision/') ? 'Read v3 catalog (PII) for catalogue version detection'
        : path.includes('/v1/') ? 'Read Products and permission to include hidden products (Manage Products in V1)'
        : 'Read products in v3 catalog; Product v3 read admin is required for hidden products';
      throw new Error(response.status === 403 ? `Wix catalogue access denied. Check ${permission}.`
        : `Wix catalogue request failed (${response.status}). Retry the review; no products were changed.`);
    }
    return await response.json();
  }
  const detection = await read('/stores/v3/provision/version');
  const version: Version = detection.catalogVersion;
  if (version !== 'V1_CATALOG' && version !== 'V3_CATALOG') throw new Error('Wix returned an unsupported catalogue version');
  if (body.version != null && body.version !== version) throw new Error('Wix catalogue version changed. Restart the review.');
  if ((version === 'V1_CATALOG' && cursor !== null) || (version === 'V3_CATALOG' && offset !== 0)) throw new Error('Pagination does not match catalogue version');
  const data = version === 'V1_CATALOG'
    ? await read('/stores-reader/v1/products/query', {
        includeHiddenProducts: true, includeVariants: true,
        query: {paging: {limit: 100, offset}, sort: JSON.stringify([{numericId: 'asc'}])},
      })
    : await read('/stores/v3/products/query', {query: {cursorPaging: {limit: 100, ...(cursor ? {cursor} : {})}}});
  if (!Array.isArray(data.products) || data.products.some((p: any) => typeof p?.id !== 'string' || !p.id || typeof p.name !== 'string' || !p.name.trim())) {
    throw new Error('Wix returned an invalid catalogue page');
  }
  const products = data.products.map((p: any) => ({
    id: p.id, name: p.name, visible: typeof p.visible === 'boolean' ? p.visible : null,
    variantCount: version === 'V1_CATALOG' && Array.isArray(p.variants) ? p.variants.length : null,
  }));
  if (new Set(products.map((p: any) => p.id)).size !== products.length) throw new Error('Duplicate Wix product IDs. Restart the review.');
  const total = version === 'V1_CATALOG' ? data.totalResults : data.pagingMetadata?.total;
  if (total != null && (!Number.isSafeInteger(total) || total < 0)) throw new Error('Invalid Wix catalogue total');
  let nextOffset: number | null = null, nextCursor: string | null = null;
  if (version === 'V1_CATALOG') {
    const next = Number(offset) + products.length;
    if (total != null && next > total) throw new Error('Wix catalogue changed during review. Restart the review.');
    const more = total != null ? next < total : products.length === 100;
    if (more && products.length === 0) throw new Error('Wix catalogue pagination stalled');
    if (more) nextOffset = next;
  } else {
    const next = data.pagingMetadata?.cursors?.next;
    if (next != null && (typeof next !== 'string' || !next || next === cursor)) throw new Error('Wix catalogue pagination stalled');
    nextCursor = next ?? null;
    if (nextCursor && !products.length || data.pagingMetadata?.hasNext === true && !nextCursor) throw new Error('Incomplete Wix catalogue pagination');
    if (!data.pagingMetadata) throw new Error('Wix catalogue pagination metadata is missing');
  }
  return {version, products, total: total ?? null, nextOffset, nextCursor,
    complete: nextOffset === null && nextCursor === null,
    hiddenCoverage: version === 'V1_CATALOG' ? 'requested' : 'unverified',
    // V3 Query Products deliberately does not return variants or location inventory.
    detailsComplete: false};
}
