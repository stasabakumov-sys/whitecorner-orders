import {optionSizes} from './product-sizes';

export function isCartProduct(product:any){return String(product?.product_type||'').trim().toLowerCase()==='cart'||/(\bcart\b|\bmobile bar\b|\bserving table\b|\bevent bar\b)/i.test(String(product?.product_name||''));}
export function cartSizeKey(value:unknown){return String(value??'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
export function cartSizeFromOptions(options:any){const values=[...new Set(optionSizes(options).map(cartSizeKey).filter(Boolean))];return values.length===1?values[0]:'';}
export function cartSizeRows(values:string[]){const rows=new Map<string,{key:string;label:string}>();for(const label of values){const key=cartSizeKey(label);if(key&&!rows.has(key))rows.set(key,{key,label});}return [...rows.values()];}
