// Never fall back to a different Wix product merely because names match.
export function productNavigationMatches(products:any[],params:{get:(key:string)=>string|null}){
 const id=params.get('productId'),wixId=params.get('wixProductId'),name=params.get('product'),saved=params.get('savedProfile');
 let matches=id!==null?products.filter(p=>p.id===id):wixId!==null?products.filter(p=>p.wix_product_id===wixId):products.filter(p=>p.product_name===name);
 if(id===null&&wixId!==null&&!matches.length&&name)matches=products.filter(p=>!p.wix_product_id&&p.product_name===name);
 return matches.filter(p=>!saved||p.saved_profiles?.some((x:any)=>x.signature===saved));
}
