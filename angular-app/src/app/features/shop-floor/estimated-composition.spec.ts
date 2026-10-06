import {describe,expect,it} from 'vitest';
import {estimatedComposition,estimatedCncMinutes} from './estimated-composition';

describe('estimated minutes by product configuration',()=>{
 it('adds Main CNC and each selected Add-on for a product configuration',()=>{
  const template:any={parts:[
   {id:'body',component_product_id:'main'},
   {id:'shelf',component_product_id:'main',option_name:'Internal Shelf',option_value:'Yes'},
   {id:'side',component_product_id:'main',option_name:'Side Shelves',option_value:'Yes'},
   {id:'addon',component_product_id:'addon'},
  ],estimates:{CNC:15,'CNC+option:internal shelf=yes':7,'CNC+option:side shelves=yes':5,'CNC+component:addon':3}};
  expect(estimatedCncMinutes(estimatedComposition(template,['main'],{},'main'))).toBe(15);
  expect(estimatedCncMinutes(estimatedComposition(template,['main'],{'Internal Shelf':'Yes'},'main'))).toBe(22);
  expect(estimatedCncMinutes(estimatedComposition(template,['main','addon'],{'Internal Shelf':'Yes','Side Shelves':'Yes'},'main'))).toBe(30);
  delete template.estimates['CNC+option:side shelves=yes'];
  expect(estimatedCncMinutes(estimatedComposition(template,['main','addon'],{'Internal Shelf':'Yes','Side Shelves':'Yes'},'main'))).toBeNull();
 });
 it('uses one whole-product CNC total for an exact composition',()=>{
  const template:any={parts:[
   {id:'body',component_product_id:'main'},
   {id:'shelf',component_product_id:'main',option_name:'Internal Shelf',option_value:'Yes'},
   {id:'addon',component_product_id:'addon'},
  ],estimates:{CNC:15,'CNC@option:internal shelf=yes':25,'CNC@component:addon':30,'CNC@component:addon|option:internal shelf=yes':38}};
  expect(estimatedCncMinutes(estimatedComposition(template,['main'],{},'main'))).toBe(15);
  expect(estimatedCncMinutes(estimatedComposition(template,['main'],{'Internal Shelf':'Yes'},'main'))).toBe(25);
  expect(estimatedCncMinutes(estimatedComposition(template,['main','addon'],{},'main'))).toBe(30);
  expect(estimatedCncMinutes(estimatedComposition(template,['main','addon'],{'Internal Shelf':'Yes'},'main'))).toBe(38);
  delete template.estimates['CNC@component:addon|option:internal shelf=yes'];
  expect(estimatedCncMinutes(estimatedComposition(template,['main','addon'],{'Internal Shelf':'Yes'},'main'))).toBeNull();
 });
 it('reuses base minutes and includes only ordered options and add-ons',()=>{
  const template:any={id:'shared',name:'Cart',parts:[
   {id:'body',name:'Body',component_product_id:'main'},
   {id:'shelf',name:'Shelf',component_product_id:'main',option_name:'Internal Shelf',option_value:'Yes'},
   {id:'side',name:'Side shelf',component_product_id:'main',option_name:'Side Shelves',option_value:'Yes'},
   {id:'addon',name:'Extra panel',component_product_id:'addon'},
  ],estimates:{CNC:15,'CNC:shelf':7,'CNC:side':5,'Assembly:body':30,'Assembly:shelf':12,'Assembly:side':18,'Assembly:addon':20}};
  const without=estimatedComposition(template,['main'],{'Internal Shelf':'No','Side Shelves':'No'},'main');
  const withShelf=estimatedComposition(template,['main'],{'Internal Shelf':{original:'Yes'},'Side Shelves':'No'},'main');
  const full=estimatedComposition(template,['main','addon'],{'Internal Shelf':'Yes','Side Shelves':'Yes'},'main');
  expect(without.parts.map(part=>part.id)).toEqual(['body']);
  expect(without.estimates).toEqual({CNC:15,'Assembly:body':30});
  expect(withShelf.parts.map(part=>part.id)).toEqual(['body','shelf']);
  expect(estimatedCncMinutes(withShelf)).toBe(22);
  expect(full.parts.map(part=>part.id)).toEqual(['body','shelf','side','addon']);
  expect(estimatedCncMinutes(full)).toBe(27);
  expect(template.parts).toHaveLength(4);
 });
});
