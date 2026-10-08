// Client selling prices come from Hub's published Wix catalogue projection.
// Exact product IDs and option choices are required; names never merge products.
export const MODEL_CATALOG_LINKS: Record<string,{id:string;path:string}> = {
 'classic-bar-plywood': {id:'750a0827-801d-4cb4-b630-1e07167ad400',path:'/product-page/collapsible-plywood-mobile-bar-classic-mobile-food-service-event-bar-cart'},
 'decorative-wheel-roof-cart-mdf': {id:'f33d3815-564c-47d9-b4c0-8ffa6dd4541d',path:'/product-page/mdf-mobile-bar-cart-with-roof-decorative-wheels-foldable-serving-cart'},
 'decorative-wheel-cart-mdf': {id:'07ce16db-6737-44a2-a69e-29bf7de313e0',path:'/product-page/mdf-mobile-bar-cart-with-decorative-wheels-foldable-serving-cart'},
 'side-shelf-cart-mdf': {id:'bb41466d-c2a1-4c08-adb1-5ed4cd2f0576',path:'/product-page/mobile-foldable-charcuterie-cart-with-wheels-bar-cart-vendor-cart'},
};
export const MODEL_ADDON_LINKS = {
 sideShelves: {id:'a0ff6072-49be-413c-99f9-1a9cc2c9e770',path:'/product-page/side-shelves-for-mobile-carts-as-an-addition-to-the-main-order-only'},
 umbrellaHole: {id:'80a3fd20-b06d-4406-a1e9-68d79762a4f9',path:'/product-page/umbrella-hole-for-the-mobile-cart-only-as-an-addition-to-the-main-order'},
 iceShelf: {id:'dccabced-cbb4-458f-bad1-a7b1292105f6',path:'/product-page/integrated-ice-storage-shelf-with-support-panel-for-charcuterie-carts'},
} as const;
export interface CatalogVariant {id:string;price:number;choices:Record<string,string>}
export interface ModelingProduct {id:string;name:string;path:string;currency:'AUD';options:{name:string;values:string[]}[];variants:CatalogVariant[]}
export interface ModelingCatalog {publishedAt:string;products:ModelingProduct[]}
export interface PricingLine {label:string;amount:number|null}
export interface ConfigurationPricing {productId:string;variantId:string|null;publishedAt:string;subtotal:number|null;lines:PricingLine[]}
export interface PricingSelection {
 slug:string;width:number;depth:number;height:number;raw:boolean;colour:string;shelf:boolean;
 topFinish?:'body'|'oak'|'plywood'|'mdf';sideShelves?:boolean;sideFinish?:'body'|'oak'|'plywood'|'mdf';
 umbrella?:boolean;umbrellaDiameter?:number;iceShelf?:boolean;cutouts?:number;trays?:number;roofClosed?:boolean;glassRacks?:number;frontStyle?:string;frontLogo?:boolean;moulding?:boolean;
}
const links = [...Object.values(MODEL_CATALOG_LINKS),...Object.values(MODEL_ADDON_LINKS)];
export function readModelingCatalog(payload:unknown,publishedAt:string):ModelingCatalog {
 const source=payload as {products?:ModelingProduct[]};
 if(!Array.isArray(source?.products)||!publishedAt||!Number.isFinite(Date.parse(publishedAt)))throw Error('The published Hub catalogue is incomplete.');
 const products:ModelingProduct[]=[];
 for(const link of links){
  const matches=source.products.filter(p=>p.id===link.id&&p.path===link.path);
  if(matches.length>1)throw Error('A linked Modeling product is duplicated in Hub.');
  if(!matches.length)continue;
  const p=matches[0];
  if(!p.name?.trim()||p.currency!=='AUD'||!Array.isArray(p.options)||p.options.some(o=>!o.name||!Array.isArray(o.values))||!Array.isArray(p.variants)||!p.variants.length||p.variants.some(v=>!v.id||!Number.isFinite(v.price)||v.price<0||!v.choices))throw Error('A linked Hub product has incomplete names or prices.');
  products.push({id:p.id,name:p.name,path:p.path,currency:p.currency,options:p.options.map(o=>({name:o.name,values:o.values})),variants:p.variants.map(v=>({id:v.id,price:v.price,choices:{...v.choices}}))});
 }
 return {publishedAt,products};
}
function linkedProduct(catalog:ModelingCatalog,link:{id:string;path:string}):ModelingProduct|undefined {return catalog.products.find(p=>p.id===link.id&&p.path===link.path);}
export function linkedModelProduct(catalog:ModelingCatalog|null,slug:string):ModelingProduct|undefined {
 const link=MODEL_CATALOG_LINKS[slug];return catalog&&link?linkedProduct(catalog,link):undefined;
}
function variant(product:ModelingProduct|undefined,choices:Record<string,string>):CatalogVariant|undefined {
 const matches=product?.variants.filter(v=>Object.keys(v.choices).length===Object.keys(choices).length&&Object.entries(choices).every(([key,value])=>v.choices[key]===value))||[];
 return matches.length===1?matches[0]:undefined;
}
function colour(s:PricingSelection):string {if(s.raw)return 'Raw';if(s.colour.toLowerCase()==='#f6f6f3')return 'White';if(s.colour.toLowerCase()==='#f3b0c8')return 'Pink';return 'Custom (provide Dulux Code)';}
function shelfChoice(s:PricingSelection,body:string):string|null {
 const finish=s.sideFinish??s.topFinish;
 if(finish==='oak')return null;
 if(finish==='plywood')return 'Varnished Plywood';
 if(finish==='mdf')return 'MDF - Raw';
 if(s.slug==='classic-bar-plywood'){
  if(finish==='body'&&body==='White')return 'Plywood - White';
  if(finish==='body'&&body==='Pink')return 'Plywood - Pink';
  return null;
 }
 if(finish==='body'&&body==='Raw')return 'MDF - Raw';
 if(finish==='body'&&body==='White')return 'MDF - White';
 if(finish==='body'&&body==='Pink')return 'MDF - Pink';
 return null;
}
function integratedShelfChoice(s:PricingSelection,body:string):string|null {
 const finish=s.sideFinish??s.topFinish;
 if(finish==='body'||(finish==='mdf'&&body==='Raw'))return `Yes - ${body==='Raw'?'Raw':body==='White'?'White':body==='Pink'?'Pink':'Custom'} finish`;
 return null;
}
export function catalogPricing(catalog:ModelingCatalog,s:PricingSelection):ConfigurationPricing {
 const product=linkedModelProduct(catalog,s.slug);
 const empty:ConfigurationPricing={productId:product?.id||'',variantId:null,publishedAt:catalog.publishedAt,subtotal:null,lines:[{label:'Cart configuration',amount:null}]};
 if(!product)return empty;
 const body=colour(s),choices:Record<string,string>={Colour:body};let integrated=false;
 if(s.slug==='classic-bar-plywood'){
  const size=product.options.find(o=>o.name==='Size')?.values.find(value=>{const dimensions=/W(\d+)mm\s*x\s*D(\d+)mm\s*x\s*H(\d+)mm/i.exec(value);return dimensions&&+dimensions[1]===s.width&&+dimensions[2]===s.depth&&+dimensions[3]===s.height;});
  if(!size)return empty;
  choices['Size']=size;choices['Internal Shelf']=s.shelf?'Yes':'No';
  if(s.topFinish==='oak')choices['Tabletop material']='Tasmanian Oak';
  else if(s.topFinish==='plywood'||s.topFinish==null)choices['Tabletop material']='Plywood';
  else return empty;
 }else if(s.slug==='side-shelf-cart-mdf'){
  if(s.width!==1500||s.depth!==600||s.height!==850||![0,13].includes(s.cutouts||0)||![0,13].includes(s.trays||0))return empty;
  choices['Tabletop design']=s.cutouts===13?'13 cutouts - 12 x 1/6 GS plus 1 x 1/1 GS':'Plain - without cutouts';
  choices['Pans']=s.trays===13?'With 12/13/14 pans in a separate parcel':'Cart without pans';
 }else{
  if(s.width!==1200||s.depth!==600||s.height!==900)return empty;
  choices['Internal Shelf']=s.shelf?'Yes':'No';
  const side=s.sideShelves?integratedShelfChoice(s,body):null;integrated=!!side;choices['Side shelves']=side||'No';
 }
 const selected=variant(product,choices);if(!selected)return empty;
 const lines:PricingLine[]=[{label:'Cart configuration',amount:selected.price}];let subtotal=selected.price;
 const add=(label:string,amount:number|null)=>{lines.push({label,amount});if(amount!=null)subtotal=Math.round((subtotal+amount)*100)/100;};
 if(s.sideShelves&&!integrated){const choice=shelfChoice(s,body);const addon=choice?variant(linkedProduct(catalog,MODEL_ADDON_LINKS.sideShelves),{'Material and Colour':choice}):undefined;add('Side shelves · 2 × 200 × 600 mm',addon?.price??null);}
 if(s.umbrella){const hole=linkedProduct(catalog,MODEL_ADDON_LINKS.umbrellaHole);const listed=hole?.options.find(o=>o.name==='Diameter of the Cutout')?.values.includes(`${s.umbrellaDiameter}mm`);add('Umbrella hole',listed?variant(hole,{})?.price??null:null);}
 if(s.slug==='side-shelf-cart-mdf'){
  if(s.shelf)add('Internal shelf',null);
  if(s.iceShelf){const ice=variant(linkedProduct(catalog,MODEL_ADDON_LINKS.iceShelf),{Pans:'Shelf without steel pans',Colour:body});add('Ice shelf',ice?.price??null);}
 }
 if(s.topFinish&&s.slug!=='classic-bar-plywood'&&s.topFinish!=='body')add('Table top finish',null);
 if(s.frontStyle&&s.frontStyle!==(s.slug==='classic-bar-plywood'?'plain':'shaker'))add('Front panel',null);
 if(s.slug==='classic-bar-plywood'&&s.moulding)add('Moulding',null);
 if(s.frontLogo)add('Front logo',null);
 if(s.roofClosed)add('Closed roof',null);
 if(s.glassRacks)add(`${s.glassRacks} × Wine Glass Rack Chrome 405mm`,null);
 return {productId:product.id,variantId:selected.id,publishedAt:catalog.publishedAt,subtotal,lines};
}
export function formatModelingPrice(amount:number|null):string {return amount===null?'Quote required':new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD',minimumFractionDigits:0,maximumFractionDigits:2}).format(amount);}
