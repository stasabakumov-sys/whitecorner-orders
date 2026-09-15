import type {ShopTemplate} from './shop-floor.models';
import {foldingOption,productionSize} from '../costing/production-cost';
import {manualBackdropSizeKey,optionSizes} from '../shipping-data/product-sizes';
import {cartSizeFromOptions} from '../shipping-data/cart-size';

export type ShopCatalogProduct={id:string;wix_product_id?:string|null;product_name:string;product_type?:string|null;manual_sizes?:string|null};

function optionText(value:unknown){return String((value as any)?.original??(value as any)?.value??value??'').trim();}

export function catalogProductForItem(item:any,catalog:ShopCatalogProduct[]){
 const external=String(item?.catalog_reference?.catalogItemId||item?.catalog_reference?.productId||'');
 return catalog.find(product=>(external&&product.wix_product_id===external)||(!product.wix_product_id&&product.product_name.trim().toLowerCase()===String(item?.product_name||'').trim().toLowerCase()));
}

export function resolvedProductionSize(item:any,product?:ShopCatalogProduct){
 const ordered=productionSize(item?.wix_options);if(ordered)return ordered;
 if(String(product?.product_type||'').trim().toLowerCase()==='cart'||/cart|mobile bar|serving table|event bar/i.test(product?.product_name||'')){const exact=cartSizeFromOptions(item?.wix_options);if(exact)return exact;}
 const manual=[...new Set(String(product?.manual_sizes||'').split(/\r?\n/).map(manualBackdropSizeKey).filter(Boolean))];
 if(manual.length!==1)return '';
 const orderValues=optionSizes(item?.wix_options);if(!orderValues.length)return manual[0];
 const loose=[...new Set(orderValues.map(manualBackdropSizeKey).filter(Boolean))];
 return loose.length===1&&loose[0]===manual[0]?loose[0]:'';
}

export function orderedFinish(options:any):'raw'|'painted'|''{
 const values=Object.entries(options||{}).filter(([key])=>/^(colou?r|finish)$/i.test(key.trim())).map(([,value])=>optionText(value).toLowerCase()).filter(Boolean);
 const unique=[...new Set(values)];if(unique.length!==1)return '';
 return /^(raw|unpainted|natural)(\b|\s*\/)/.test(unique[0])?'raw':'painted';
}

export function matchingProductTemplates(templates:ShopTemplate[],product:ShopCatalogProduct|undefined,item:any){
 if(!product)return [];
 const size=resolvedProductionSize(item,product),folding=foldingOption(item?.wix_options);
 return templates.filter(template=>template.product_id===product.id&&(template.size_key?template.size_key===size&&(folding?template.folding===folding:!template.folding):!/backdrop/i.test(item?.product_name||'')));
}
