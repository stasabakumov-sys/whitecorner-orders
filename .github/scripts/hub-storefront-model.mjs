// The only public catalogue projection. Never spread Wix or operational objects.
export const plainText=value=>String(value??'').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<\/(p|div|li|h\d)>|<br\s*\/?>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\n\s*\n\s*\n/g,'\n\n').trim();
const amount=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
const priceOf=p=>{const n=amount(p?.discountedPrice)??amount(p?.price);if(n===null||p?.currency!=='AUD')throw Error('Missing or unsupported AUD price');return n;};
export function assetUrl(value){
 if(typeof value!=='string')throw Error('Missing media URL');
 const u=new URL(value);
 if(u.protocol!=='https:'||!['static.wixstatic.com','video.wixstatic.com'].includes(u.hostname)||u.port||u.username||u.password)throw Error('Unsupported catalogue media host');
 return u.href;
}
export function mediaItems(p){
 const items=[...(p.media?.items??[])];
 if(p.media?.mainMedia&&!items.some(i=>i.id===p.media.mainMedia.id))items.unshift(p.media.mainMedia);
 for(const option of p.productOptions??[])for(const choice of option.choices??[])items.push(...(choice.media?.items??[]));
 const unique=new Map();
 for(const item of items){
  const url=item.mediaType==='image'?item.image?.url:item.mediaType==='video'?item.video?.files?.[0]?.url:undefined;
  if(!url)throw Error('Unsupported or missing product media');
  unique.set(assetUrl(url),{url:assetUrl(url),kind:item.mediaType,alt:plainText(item.altText??item.title??p.name)});
 }
 return [...unique.values()];
}
const categoryAliases={cart:{name:'Collapsible Carts',type:'Mobile Carts'},'event-backdrops':{name:'Event Backdrops',type:'Event Backdrops'},'cart-add-ons':{name:'Cart Add-ons',type:'Cart Add-ons'},'modular-bar-system':{name:'Modular Bar System',type:'Modular Bar System'},'market-furniture':{name:'Retail Furniture',type:'Retail Furniture'},'riddling-rack':{name:'Riddling Racks',type:'Riddling Racks'},'party-props':{name:'Party Props',type:'Party Props'},'store-displays-and-stands':{name:'Tabletop Displays',type:'Tabletop Displays'}};
export function buildCatalog(rows,collections,assets,baseUrl){
 const categories=[{id:'all',name:'All Products',path:'/category/all-products',type:'All',description:'Explore the White Corner collection.'}];
 for(const c of collections){
  const s=c.source_collection;
  if(s.id==='00000000-000000-000000-000000000001'||/^all products$/i.test(s.name))continue;
  const slug=s.slug||s.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  if(!/^[a-z0-9][a-z0-9-]*$/i.test(slug))throw Error('Invalid collection slug');
  categories.push({id:c.id,name:categoryAliases[slug]?.name??plainText(s.name),path:`/category/${slug}`,type:categoryAliases[slug]?.type??plainText(s.name),description:plainText(s.description)});
 }
 const publicAsset=url=>{const a=assets.get(assetUrl(url));if(!a||a.bucket!=='catalog-media')throw Error('Product media has not been copied to Hub');return `${baseUrl}/storage/v1/object/public/${a.bucket}/${a.path}`;};
 const products=[];
 for(const row of rows){
  const p=row.source_product;
  if(p.visible!==true)continue;
  if(typeof p.slug!=='string'||!p.slug||/[/?#]/.test(p.slug))throw Error('Product slug missing or invalid');
  const categoryIds=(p.collectionIds??[]).filter(id=>categories.some(c=>c.id===id));
  // Unknown IDs must be resolved; the special All Products collection is not a category.
  if((p.collectionIds??[]).some(id=>!collections.some(c=>c.id===id)))throw Error('Product refers to an unknown collection');
  const primary=categories.find(c=>c.id!=='all'&&categoryIds.includes(c.id));
  const priceData=p.priceData??p.price;
  const options=(p.productOptions??[]).map(o=>({name:plainText(o.name),values:(o.choices??[]).filter(c=>c.visible!==false).map(c=>plainText(c.description??c.value)),choiceImages:Object.fromEntries((o.choices??[]).filter(c=>c.visible!==false).map(c=>[plainText(c.description??c.value),(c.media?.items??[]).filter(i=>i.mediaType==='image').map(i=>publicAsset(i.image.url))]))}));
  const variants=(p.variants??[]).filter(v=>v.variant?.visible!==false).map(v=>({id:v.id,choices:Object.fromEntries(Object.entries(v.choices??{}).map(([k,val])=>[plainText(k),plainText(val)])),sku:String(v.variant?.sku??''),price:priceOf(v.variant?.priceData??priceData),weight:amount(v.variant?.weight),inStock:typeof v.stock?.inStock==='boolean'?v.stock.inStock:null,trackQuantity:v.stock?.trackQuantity===true,quantity:v.stock?.trackQuantity===true?amount(v.stock.quantity):null}));
  if(p.manageVariants&&variants.length===0)throw Error('Managed product has no visible variants');
  const pendingMedia=mediaItems(p).filter(i=>i.kind==='video'&&!assets.has(i.url)).length;
  const media=mediaItems(p).filter(i=>i.kind!=='video'||assets.has(i.url)).map(i=>({kind:i.kind,url:publicAsset(i.url),alt:i.alt}));
  const details=plainText(p.description);
  // Derive only explicitly stated attributes; never infer material from packaging/cost data.
  const material=details.match(/(?:^|\n)Material\s*:\s*([^\n]+)/i)?.[1]?.trim()??'';
  const roof=/\bwithout roof\b/i.test(p.name)?'Without Roof':/\bwith (?:a )?roof\b/i.test(p.name)?'With Roof':undefined;
  const info=(p.additionalInfoSections??[]).map(s=>({title:plainText(s.title),description:plainText(s.description)}));
  const seoTags=p.seoData?.tags??[];
  const seoTitle=plainText(seoTags.find(t=>t.type==='title')?.children);
  const seoDescription=plainText(seoTags.find(t=>t.type==='meta'&&t.props?.name==='description')?.props?.content);
  products.push({id:row.shipping_product_id,name:plainText(p.name),path:`/product-page/${p.slug}`,price:p.manageVariants?Math.min(...variants.map(v=>v.price)):priceOf(priceData),currency:'AUD',pendingMedia,images:media.filter(m=>m.kind==='image').map(m=>m.url),media,categoryIds,type:primary?.type??'Other',material,roof,description:details.split('\n\n')[0],details,options,variants,manageVariants:p.manageVariants===true,sku:String(p.sku??''),weight:amount(p.weight),inStock:typeof p.stock?.inStock==='boolean'?p.stock.inStock:null,trackQuantity:p.stock?.trackQuantity===true,quantity:p.stock?.trackQuantity===true?amount(p.stock.quantity):null,customTextFields:(p.customTextFields??[]).map(f=>({title:plainText(f.title),maxLength:f.maxLength,mandatory:f.mandatory===true})),info,brand:plainText(p.brand),ribbon:plainText(p.ribbon),sourceTitle:seoTitle,sourceMetaDescription:seoDescription});
 }
 if(!products.length||new Set(products.map(p=>p.id)).size!==products.length||new Set(products.map(p=>p.path)).size!==products.length)throw Error('Empty or duplicate storefront products');
 if(new Set(categories.map(c=>c.path)).size!==categories.length)throw Error('Duplicate collection paths');
 const doc={schemaVersion:1,source:'hub',syncedAt:new Date().toISOString(),products,categories};
 if(/(?:static|video)\.wixstatic\.com|costRange|internal_comment|source_product/.test(JSON.stringify(doc)))throw Error('Unexpected source URL or private field in public catalogue');
 return doc;
}
