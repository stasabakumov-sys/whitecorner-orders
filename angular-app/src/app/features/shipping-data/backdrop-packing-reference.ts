import {backdropDrawingKey,backdropSizeKey} from './product-sizes';
import {reviewComponents} from '../../../../../supabase/functions/_shared/delivery-review-domain';

export function backdropReferenceProfiles(product:any,sizes:string[],references:Record<string,any>,rules:any[]){
 const own=product.saved_profiles||[],owned=new Set(own.map((p:any)=>backdropDrawingKey(p,product.product_name)));
 const labels=new Map(sizes.map(size=>[backdropSizeKey(size),size]));
 return Object.entries(references).filter(([key])=>labels.has(key.split(':')[0])&&!owned.has(key)).map(([key,box])=>{
  const item={id:product.id,product_name:product.product_name,quantity:1,catalog_reference:{catalogItemId:product.wix_product_id},wix_options:{Size:labels.get(key.split(':')[0])!,Foldable:key.endsWith(':foldable')?'YES':'NO'}};
  return {signature:'reference:'+product.id+':'+key,reference_only:true,template_item:item,packages:[{package_name:box.package_name,length_mm:Number(box.length_mm),width_mm:Number(box.width_mm),height_mm:Number(box.height_mm),weight_kg:null,contents:reviewComponents({wc_order_items:[item]},rules)}]};
 });
}
