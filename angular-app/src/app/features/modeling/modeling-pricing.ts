export const MODEL_CATALOG_LINKS: Record<string,{id:string;path:string}> = {
 'classic-bar-plywood': {id:'750a0827-801d-4cb4-b630-1e07167ad400',path:'/product-page/collapsible-plywood-mobile-bar-classic-mobile-food-service-event-bar-cart'},
 'decorative-wheel-roof-cart-mdf': {id:'f33d3815-564c-47d9-b4c0-8ffa6dd4541d',path:'/product-page/mdf-mobile-bar-cart-with-roof-decorative-wheels-foldable-serving-cart'},
};
export interface CatalogVariant {id:string;price:number;choices:Record<string,string>}
export interface ModelingProduct {id:string;name:string;path:string;currency:'AUD';options:{name:string;values:string[]}[];variants:CatalogVariant[]}
export interface ModelingCatalog {publishedAt:string;products:ModelingProduct[]}
export interface PricingLine {label:string;amount:number|null}
export interface ConfigurationPricing {productId:string;variantId:string|null;publishedAt:string;subtotal:number|null;lines:PricingLine[]}
export interface PricingSelection {slug:string;width:number;depth:number;height:number;raw:boolean;colour:string;shelf:boolean}
// Explicit Hub UUID + supplied product path binding. Names are never used to merge products.
export function readModelingCatalog(payload:unknown,publishedAt:string):ModelingCatalog {
 const source=payload as {products?:ModelingProduct[]};
 if(!Array.isArray(source?.products)||!publishedAt||!Number.isFinite(Date.parse(publishedAt)))throw Error('The published Hub catalogue is incomplete.');
 const products=Object.values(MODEL_CATALOG_LINKS).map(link=>{
  const matches=source.products!.filter(p=>p.id===link.id&&p.path===link.path);
  if(matches.length!==1)throw Error('A linked Modeling product is missing or duplicated in Hub.');
  const product=matches[0];
  if(!product.name?.trim()||product.currency!=='AUD'||!Array.isArray(product.options)||product.options.some(o=>!o.name||!Array.isArray(o.values))||!Array.isArray(product.variants)||!product.variants.length||product.variants.some(v=>!v.id||!Number.isFinite(v.price)||v.price<0||!v.choices))throw Error('A linked Hub product has incomplete names or prices.');
  return {id:product.id,name:product.name,path:product.path,currency:product.currency,options:product.options.map(o=>({name:o.name,values:o.values})),variants:product.variants.map(v=>({id:v.id,price:v.price,choices:{...v.choices}}))};
 });
 return {publishedAt,products};
}
export function linkedModelProduct(catalog:ModelingCatalog|null,slug:string):ModelingProduct|undefined {
 const link=MODEL_CATALOG_LINKS[slug];return catalog?.products.find(p=>link&&p.id===link.id&&p.path===link.path);
}
export function catalogPricing(catalog:ModelingCatalog,selection:PricingSelection):ConfigurationPricing {
 const product=linkedModelProduct(catalog,selection.slug);
 const empty:ConfigurationPricing={productId:product?.id||'',variantId:null,publishedAt:catalog.publishedAt,subtotal:null,lines:[{label:'Cart configuration',amount:null}]};
 if(!product)return empty;
 const choices:Record<string,string>={'Colour':selection.raw?'Raw':selection.colour.toLowerCase()==='#f6f6f3'?'White':'Custom (provide Dulux Code)','Internal Shelf':selection.shelf?'Yes':'No'};
 if(selection.slug==='classic-bar-plywood') {
  const size=product.options.find(o=>o.name==='Size')?.values.find(value=>{
   const dimensions=/W(\d+)mm\s*x\s*D(\d+)mm\s*x\s*H(\d+)mm/i.exec(value);
   return dimensions&&+dimensions[1]===selection.width&&+dimensions[2]===selection.depth&&+dimensions[3]===selection.height;
  });
  if(!size)return empty;choices['Size']=size;
 } else {
  // This linked roof cart has one published size, no dimension-price interpolation.
  if(selection.width!==1200||selection.depth!==600||selection.height!==900)return empty;
  choices['Side shelves']='No';
 }
 const find=(wanted:Record<string,string>)=>{
  const matches=product.variants.filter(v=>Object.keys(v.choices).length===Object.keys(wanted).length&&Object.entries(wanted).every(([key,value])=>v.choices[key]===value));
  return matches.length===1?matches[0]:undefined;
 };
 const selected=find(choices);if(!selected)return empty;
 const raw=find({...choices,Colour:'Raw','Internal Shelf':'No'}),noShelf=find({...choices,'Internal Shelf':'No'});
 const cents=(value:number)=>Math.round(value*100)/100;
 return {productId:product.id,variantId:selected.id,publishedAt:catalog.publishedAt,subtotal:selected.price,
  lines:raw&&noShelf?[{label:'Cart & dimensions',amount:raw.price},{label:'Finish / colour',amount:cents(noShelf.price-raw.price)},{label:'Internal shelf',amount:cents(selected.price-noShelf.price)}]:[{label:'Cart configuration',amount:selected.price}]};
}
export function formatModelingPrice(amount:number|null):string {
 return amount===null?'Quote required':new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD',minimumFractionDigits:0,maximumFractionDigits:2}).format(amount);
}
