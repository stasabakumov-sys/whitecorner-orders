// Use Wix creation time only: imports and later edits must not move products.
export function newestFirst(products, rows) {
 const dates = new Map(rows.map(row => [row.shipping_product_id, row.source_product?.createdDate]));
 const dated = products.map(product => {
  const raw = dates.get(product.id);
  const timestamp = typeof raw === 'string' ? Date.parse(raw) : NaN;
  if (!Number.isFinite(timestamp)) throw Error(`Missing Wix creation date for product ${product.id}`);
  return {product, timestamp};
 });
 dated.sort((a,b) => b.timestamp-a.timestamp || a.product.id.localeCompare(b.product.id));
 return dated.map(({product}) => product);
}
