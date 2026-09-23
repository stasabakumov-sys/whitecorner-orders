import {describe,expect,it} from 'vitest';
import {catalogProductForItem,matchingProductTemplates,orderedFinish,orderedFolding,resolvedProductionSize} from './shop-floor-selection';

const product={id:'product',wix_product_id:'wix-product',product_name:'Plywood Hollow Event Backdrop',manual_sizes:'190x100'};
const item=(options:any={Foldable:'YES',Colour:'White'})=>({product_name:product.product_name,catalog_reference:{catalogItemId:'wix-product'},wix_options:options});
const template:any={id:'template',product_id:'product',size_key:'1900x1000',folding:'foldable'};

describe('Automatic Shop Floor product composition',()=>{
 it('uses the exact catalogue product and its sole manual size when the order has no metric size',()=>{
  expect(catalogProductForItem(item(),[product])).toBe(product);
  expect(resolvedProductionSize(item(),product)).toBe('1900x1000');
  expect(matchingProductTemplates([template],product,item())).toEqual([template]);
 });
 it('reuses the saved Foldable Backdrop template across sizes and prefers it over an old size-specific template',()=>{
  const shared={...template,id:'shared',size_key:null};
  const other={...template,id:'nonfoldable',size_key:null,folding:'nonfoldable'};
  const order=item({Size:'200cm x 120cm',Foldable:'YES'});
  expect(matchingProductTemplates([template,shared,other],product,order)).toEqual([shared]);
  expect(matchingProductTemplates([shared,other],product,item({Size:'200cm x 120cm',Foldable:'NO'}))).toEqual([other]);
  expect(matchingProductTemplates([shared],product,item({Size:'200cm x 120cm'}))).toEqual([]);
 });
 it('reads the visible Wix folding choice when the imported options object is empty',()=>{
  const shared={...template,id:'shared',size_key:null};
  const order={...item({}),description_lines:[{name:{original:'Foldable'},plainText:{original:'YES'}}]};
  expect(orderedFolding(order)).toBe('foldable');
  expect(matchingProductTemplates([shared],product,order)).toEqual([shared]);
  expect(orderedFolding({...order,wix_options:{Foldable:'NO'}})).toBe('');
 });
 it('keeps an explicit order size authoritative and does not guess between multiple manual sizes',()=>{
  expect(resolvedProductionSize(item({Size:'200cm x 100cm',Foldable:'YES'}),product)).toBe('2000x1000');
  expect(resolvedProductionSize(item({Size:'180x90',Foldable:'YES'}),product)).toBe('');
  expect(resolvedProductionSize(item(),{...product,manual_sizes:'190x100\n180x90'})).toBe('');
 });
 it('defaults every product without an explicit finish to RAW',()=>{
  expect(orderedFinish({Colour:'Raw'})).toBe('raw');
  expect(orderedFinish({Colour:'White'})).toBe('painted');
  expect(orderedFinish({Size:'190x100'})).toBe('raw');
  expect(orderedFinish({Size:'190x100'},product.product_name)).toBe('raw');
  expect(orderedFinish({Colour:'White'},product.product_name)).toBe('painted');
  expect(orderedFinish({Paint:'Yes'},product.product_name)).toBe('painted');
  expect(orderedFinish({Paint:'No'},product.product_name)).toBe('raw');
  expect(orderedFinish({Colour:'Raw',Finish:'Painted'},product.product_name)).toBe('');
  expect(orderedFinish({Colour:'Raw',Paint:'Yes'},product.product_name)).toBe('');
 });
});
