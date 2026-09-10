export interface WixCatalogProduct {id: string; name: string; visible: boolean | null; variantCount: number | null;}
export interface HubCatalogProduct {id: string; wix_product_id: string | null; product_name: string;}
export function reconcileCatalogue(wix: WixCatalogProduct[], hub: HubCatalogProduct[]) {
  const name = (s: string) => s.trim().toLowerCase();
  const wixNames = new Map<string, number>();
  wix.forEach(p => wixNames.set(name(p.name), (wixNames.get(name(p.name)) || 0) + 1));
  const rows = wix.map(product => {
    const linked = hub.filter(p => p.wix_product_id === product.id);
    const candidates = hub.filter(p => !p.wix_product_id && name(p.product_name) === name(product.name));
    const duplicateName = (wixNames.get(name(product.name)) || 0) > 1;
    const status = linked.length === 1 ? 'Linked' : linked.length > 1 ? 'Conflict'
      : candidates.length ? 'Review match' : duplicateName ? 'Review duplicate name' : 'New';
    return {...product, status, hubIds: (linked.length ? linked : candidates).map(p => p.id)};
  });
  const ids = new Set(wix.map(p => p.id));
  return {rows, linked: rows.filter(p => p.status === 'Linked').length,
    newCount: rows.filter(p => p.status === 'New').length,
    review: rows.filter(p => !['Linked', 'New'].includes(p.status)).length,
    unlinked: hub.filter(p => !p.wix_product_id),
    absent: hub.filter(p => p.wix_product_id && !ids.has(p.wix_product_id))};
}
