import {describe,it,expect} from 'vitest';
import {productFinishModes} from './product-finish';

describe('Painting visibility',()=>{
 const product={product_name:'Portable Market Mini Table',backdrop_paint_profile:{estimates:{'Painting:First primer':20}}};
 it('keeps an optionless RAW product hidden even with saved painting estimates',()=>{
  expect(productFinishModes(product,{variants:[]},[])).toEqual([false]);
 });
 it('uses current RAW catalogue choices instead of a historical painted order',()=>{
  expect(productFinishModes(product,{variants:[{choices:{Colour:'Raw'}}]},[{options:{Colour:'White'}}])).toEqual([false]);
 });
 it('enables all Painting fields when a painted choice is added without requiring an order',()=>{
  expect(productFinishModes(product,{productOptions:[{name:'Colour',choices:[{description:'Raw'},{description:'White'}]}]},[])).toEqual([false,true]);
 });
 it('supports dedicated Paint options and existing order profiles without a catalogue snapshot',()=>{
  expect(productFinishModes(product,{variants:[{choices:{Paint:'No'}}]},[])).toEqual([false]);
  expect(productFinishModes(product,{variants:[{choices:{Paint:'Yes'}}]},[])).toEqual([true]);
  expect(productFinishModes(product,null,[{options:{Colour:'White'}}])).toEqual([true]);
 });
});
