export function isBackdropProduct(product:{product_name?:string|null;product_type?:string|null}|null|undefined):boolean {
 return String(product?.product_type||'').trim().toLowerCase()==='backdrop'
  || /backdrop|display\s+arch\s+with\s+shelves/i.test(product?.product_name||'');
}
