import {describe,it,expect} from 'vitest';
import {MODEL_CATALOG_LINKS,readModelingCatalog,catalogPricing,linkedModelProduct,formatModelingPrice,ModelingProduct} from './modeling-pricing';
const classic=MODEL_CATALOG_LINKS['classic-bar-plywood'],roof=MODEL_CATALOG_LINKS['decorative-wheel-roof-cart-mdf'];
function fixture(){
 const products:ModelingProduct[]=Object.entries({classic,roof}).map(([kind,link])=>({id:link.id,path:link.path,name:kind+' Hub name',currency:'AUD',options:kind==='classic'?[{name:'Size',values:['Size I (W1200mm x D600mm x H900mm)','Size II (W1300mm x D600mm x H900mm)']}]:[],variants:[]}));
 for(const [index,p] of products.entries())for(const size of index?[null]:p.options[0].values)for(const colour of ['Raw','White','Custom (provide Dulux Code)'])for(const shelf of ['No','Yes']){
  const choices:Record<string,string>={Colour:colour,'Internal Shelf':shelf};if(size)choices['Size']=size;else choices['Side shelves']='No';
  const base=size?.includes('1300')?110:100,paint=colour==='Raw'?0:colour==='White'?(base===100?50:40):75;
  p.variants.push({id:index+'-'+p.variants.length,choices,price:base+paint+(shelf==='Yes'?20:0)});
 }
 return {publishedAt:'2026-10-04T00:00:00Z',products};
}
const selection={slug:'classic-bar-plywood',width:1200,depth:600,height:900,raw:false,colour:'#f6f6f3',shelf:true};
describe('Hub Modeling pricing',()=>{
 it('binds by exact Hub ID and path and retains the Hub name',()=>{
  const data=fixture(),catalog=readModelingCatalog(data,data.publishedAt);expect(linkedModelProduct(catalog,selection.slug)?.name).toBe('classic Hub name');
  data.products[0].id='another-product';expect(()=>readModelingCatalog(data,data.publishedAt)).toThrow('missing');
 });
 it('rejects duplicate identities and invalid prices rather than using a name match',()=>{
  const data=fixture();data.products.push(data.products[0]);expect(()=>readModelingCatalog(data,data.publishedAt)).toThrow('duplicated');
  const invalid=fixture();invalid.products[0].variants[0].price=NaN;expect(()=>readModelingCatalog(invalid,invalid.publishedAt)).toThrow('prices');
 });
 it('uses exact variant totals and size-specific paint differences',()=>{
  const catalog=fixture();const small=catalogPricing(catalog,selection),large=catalogPricing(catalog,{...selection,width:1300});
  expect(small.subtotal).toBe(170);expect(large.subtotal).toBe(170);expect(small.lines[1].amount).toBe(50);expect(large.lines[1].amount).toBe(40);
  expect(small.lines.reduce((sum,line)=>sum+(line.amount??0),0)).toBe(small.subtotal);
 });
 it('preserves colour semantics and removes the shelf charge',()=>{
  const price=catalogPricing(fixture(),{...selection,colour:'#aecde5',shelf:false});expect(price.subtotal).toBe(175);expect(price.lines[2].amount).toBe(0);
 });
 it('requires a quote for unknown sizes, missing and duplicate variants',()=>{
  const data=fixture();expect(catalogPricing(data,{...selection,height:950}).subtotal).toBeNull();
  data.products[0].variants=[];expect(catalogPricing(data,selection).variantId).toBeNull();
  const duplicate=fixture();duplicate.products[0].variants.push({...duplicate.products[0].variants[3]});expect(catalogPricing(duplicate,selection).subtotal).toBeNull();
 });
 it('uses the linked MDF variant without adding unselected side shelves',()=>{
  const data=fixture(),price=catalogPricing(data,{...selection,slug:'decorative-wheel-roof-cart-mdf'});expect(price.subtotal).toBe(170);expect(price.productId).toBe(roof.id);
  expect(catalogPricing(data,{...selection,slug:'decorative-wheel-roof-cart-mdf',width:1300}).subtotal).toBeNull();
 });
 it('never formats an unknown price as zero',()=>{expect(formatModelingPrice(null)).toBe('Quote required');expect(formatModelingPrice(20)).toBe('$20');});
});
