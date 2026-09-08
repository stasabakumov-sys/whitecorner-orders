import {OrderItemRow} from '../models/order.models';

const ADDON_WORDS=['additional tabletop','custom cutout','custom cutouts','side shelves','integrated ice storage shelf','umbrella hole','support panel','customisation','customization','back panel with','benchtop upgrade'];

/** Product identity is the source line ID. Components retain their own IDs for packing. */
export function orderProducts(items:OrderItemRow[]){
 const rows=items.filter(i=>!isDeliveryLine(i));
 const isAddon=(i:OrderItemRow)=>ADDON_WORDS.some(w=>(i.product_name||'').toLowerCase().includes(w));
 const products=rows.filter(i=>!isAddon(i)).map(item=>({item,components:[item]}));
 const unresolved:OrderItemRow[]=[];
 for(const addon of rows.filter(isAddon)){
  // Multiple candidate products and non-divisible quantities need a reviewed rule.
  const product=products.length===1?products[0]:null;
  const quantity=Number(product?.item.quantity??1),addonQuantity=Number(addon.quantity??1);
  if(product&&Number.isInteger(quantity)&&quantity>0&&Number.isInteger(addonQuantity)&&addonQuantity>0&&addonQuantity%quantity===0)product.components.push(addon);
  else unresolved.push(addon);
 }
 return {products,unresolved};
}

export function isDeliveryLine(item:Pick<OrderItemRow,'product_name'>){return /^(delivery|shipping)(\s+(fee|charge))?$/i.test(String(item.product_name||'').trim());}
