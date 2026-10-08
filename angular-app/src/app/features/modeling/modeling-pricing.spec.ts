import {describe,it,expect} from 'vitest';
import {MODEL_CATALOG_LINKS,MODEL_ADDON_LINKS,readModelingCatalog,catalogPricing,linkedModelProduct,shortModelName,formatModelingPrice,ModelingProduct,ModelingCatalog} from './modeling-pricing';
const publishedAt='2026-10-08T00:00:00Z';
function product(link:{id:string;path:string},name:string,options:{name:string;values:string[]}[],variants:{price:number;choices:Record<string,string>}[]):ModelingProduct {
 return {id:link.id,path:link.path,name,currency:'AUD',options,variants:variants.map((v,i)=>({id:`${link.id}-${i}`,price:v.price,choices:v.choices}))};
}
function fixture():ModelingCatalog {
 const classic=product(MODEL_CATALOG_LINKS['classic-bar-plywood'],'Classic from Hub',[{name:'Size',values:['Size I (W1200mm x D600mm x H900mm)']}],[
  {price:1300,choices:{Size:'Size I (W1200mm x D600mm x H900mm)',Colour:'Raw','Internal Shelf':'No','Tabletop material':'Plywood'}},
  {price:1560,choices:{Size:'Size I (W1200mm x D600mm x H900mm)',Colour:'Raw','Internal Shelf':'Yes','Tabletop material':'Plywood'}},
  {price:2060,choices:{Size:'Size I (W1200mm x D600mm x H900mm)',Colour:'White','Internal Shelf':'Yes','Tabletop material':'Plywood'}},
  {price:2360,choices:{Size:'Size I (W1200mm x D600mm x H900mm)',Colour:'White','Internal Shelf':'Yes','Tabletop material':'Tasmanian Oak'}},
 ]);
 const roof=product(MODEL_CATALOG_LINKS['decorative-wheel-roof-cart-mdf'],'Roof from Hub',[],[
  {price:1650,choices:{Colour:'Raw','Internal Shelf':'No','Side shelves':'No'}},
  {price:1850,choices:{Colour:'Raw','Internal Shelf':'Yes','Side shelves':'No'}},
  {price:2100,choices:{Colour:'Raw','Internal Shelf':'Yes','Side shelves':'Yes - Raw finish'}},
 ]);
 const roofless=product(MODEL_CATALOG_LINKS['decorative-wheel-cart-mdf'],'Roofless from Hub',[],[
  {price:1200,choices:{Colour:'Raw','Internal Shelf':'No','Side shelves':'No'}},
  {price:1400,choices:{Colour:'Raw','Internal Shelf':'Yes','Side shelves':'No'}},
  {price:1650,choices:{Colour:'Raw','Internal Shelf':'Yes','Side shelves':'Yes - Raw finish'}},
 ]);
 const shelves=product(MODEL_ADDON_LINKS.sideShelves,'Side shelves',[{name:'Material and Colour',values:['MDF - Raw','Varnished Plywood']}],[
  {price:250,choices:{'Material and Colour':'MDF - Raw'}},
  {price:450,choices:{'Material and Colour':'Varnished Plywood'}},
 ]);
 const umbrella=product(MODEL_ADDON_LINKS.umbrellaHole,'Umbrella hole',[{name:'Diameter of the Cutout',values:['33mm','38mm','custom']}],[{price:85,choices:{}}]);
 const two=product(MODEL_CATALOG_LINKS['two-in-one-cart-mdf'],'2-in-1 Mobile Bar. Extra description',[],[
  {price:1050,choices:{Colour:'Raw',Tabletop:'Plain','Material (Tabletop)':'MDF','Set of steel pans in a separate parcel':'No'}},
  {price:1200,choices:{Colour:'Raw',Tabletop:'Plain','Material (Tabletop)':'Varnished Plywood','Set of steel pans in a separate parcel':'No'}},
  {price:1650,choices:{Colour:'White',Tabletop:'Plain','Material (Tabletop)':'MDF','Set of steel pans in a separate parcel':'No'}},
 ]);
 const ice=product(MODEL_ADDON_LINKS.iceShelf,'Ice shelf',[],[
  {price:300,choices:{Pans:'Shelf without steel pans',Colour:'Raw'}},
  {price:400,choices:{Pans:'Shelf without steel pans',Colour:'White'}},
 ]);
 return {publishedAt,products:[classic,roof,roofless,shelves,umbrella,two,ice]};
}
const selection={slug:'decorative-wheel-cart-mdf',width:1200,depth:600,height:900,raw:true,colour:'#f6f6f3',shelf:true,topFinish:'body' as const,sideFinish:'body' as const};
describe('Hub Modeling selling prices',()=>{
 it('binds exact product IDs and paths, retaining the Hub name',()=>{
  const data=fixture();expect(linkedModelProduct(readModelingCatalog(data,publishedAt),selection.slug)?.name).toBe('Roofless from Hub');
  data.products[2].id='another-product';expect(linkedModelProduct(readModelingCatalog(data,publishedAt),selection.slug)).toBeUndefined();
 });
 it('rejects duplicated linked identities and invalid prices',()=>{
  const data=fixture();data.products.push(data.products[0]);expect(()=>readModelingCatalog(data,publishedAt)).toThrow('duplicated');
  const invalid=fixture();invalid.products[0].variants[0].price=NaN;expect(()=>readModelingCatalog(invalid,publishedAt)).toThrow('prices');
 });
 it('selects the roofless product and its exact integrated side shelf variant',()=>{
  const p=catalogPricing(fixture(),{...selection,sideShelves:true});expect(p.productId).toBe(MODEL_CATALOG_LINKS['decorative-wheel-cart-mdf'].id);expect(p.subtotal).toBe(1650);
  expect(p.lines).toEqual([{label:'Cart configuration',amount:1650}]);
  expect(catalogPricing(fixture(),{...selection,width:1300}).subtotal).toBeNull();
 });
 it('prices an exact standalone finish and listed umbrella hole from Hub',()=>{
  const p=catalogPricing(fixture(),{...selection,sideShelves:true,sideFinish:'mdf',umbrella:true,umbrellaDiameter:38});
  expect(p.subtotal).toBe(1735); // integrated shelves plus listed hole
  const custom=catalogPricing(fixture(),{...selection,umbrella:true,umbrellaDiameter:40});
  expect(custom.lines.find(line=>line.label==='Umbrella hole')?.amount).toBeNull();
 });
 it('uses Classic tabletop variants and a distinct side shelf product',()=>{
  const p=catalogPricing(fixture(),{...selection,slug:'classic-bar-plywood',raw:false,topFinish:'oak',sideShelves:false});expect(p.subtotal).toBe(2360);
  const raw=catalogPricing(fixture(),{...selection,slug:'classic-bar-plywood',topFinish:'plywood',sideFinish:'plywood',sideShelves:true});expect(raw.subtotal).toBe(2010);expect(raw.lines[1].amount).toBe(450);
 });
 it('uses the exact 1200 mm 2-in-1 cart variant and prices only listed add-ons',()=>{
  const s={...selection,slug:'two-in-one-cart-mdf',height:850,shelf:false,sideShelves:true,iceShelf:false};
  const base=catalogPricing(fixture(),s);expect(base.productId).toBe(MODEL_CATALOG_LINKS['two-in-one-cart-mdf'].id);expect(base.subtotal).toBe(1050);
  expect(catalogPricing(fixture(),{...s,topFinish:'plywood'}).subtotal).toBe(1200);
  expect(catalogPricing(fixture(),{...s,raw:false,iceShelf:true,umbrella:true,umbrellaDiameter:38}).subtotal).toBe(2135);
  expect(catalogPricing(fixture(),{...s,shelf:true}).lines.find(line=>line.label==='Internal shelf')?.amount).toBeNull();
  expect(catalogPricing(fixture(),{...s,sideShelves:false}).lines.find(line=>line.label==='Side shelves')?.amount).toBeNull();
  expect(catalogPricing(fixture(),{...s,sideFinish:'plywood'}).lines.find(line=>line.label==='Side shelves finish')?.amount).toBeNull();
  expect(catalogPricing(fixture(),{...s,width:1500}).subtotal).toBeNull();
 });
 it('uses the first product image and shortens visible names at the first full stop',()=>{
  const data=fixture();(data.products[5] as ModelingProduct & {media?:unknown}).media=[{kind:'image',url:'https://example.supabase.co/storage/v1/object/public/catalog-media/cart.jpg'}];
  const linked=linkedModelProduct(readModelingCatalog(data,publishedAt),'two-in-one-cart-mdf');
  expect(linked?.imageUrl).toContain('catalog-media/cart.jpg');expect(shortModelName(linked!.name)).toBe('2-in-1 Mobile Bar');
  expect(shortModelName('MDF Mobile Bar Cart with Roof & Decorative Wheels – Foldable Serving Cart')).toBe('MDF Mobile Bar Cart with Roof & Decorative Wheels');
  expect(shortModelName('2-in-1 Mobile Bar - Event Bar - Charcuterie Cart')).toBe('2-in-1 Mobile Bar');
 });
 it('quotes unsupported colour, dimension, or variant combinations',()=>{
  const data=fixture();expect(catalogPricing(data,{...selection,colour:'#aecde5',raw:false}).subtotal).toBeNull();
  data.products[2].variants.push({...data.products[2].variants[1]});expect(catalogPricing(data,selection).subtotal).toBeNull();
  expect(formatModelingPrice(null)).toBe('Quote required');expect(formatModelingPrice(20)).toBe('$20');
 });
});
