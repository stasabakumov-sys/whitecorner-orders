import {describe,expect,it} from 'vitest';
import {isBackdropProduct} from './backdrop-product';

describe('Backdrop product classification',()=>{
 it('recognises every Display Arch with Shelves model across the Hub',()=>{
  expect(isBackdropProduct({product_name:'Half Arch Shelf Wall – Plywood Display Arch with Shelves',product_type:'Other'})).toBe(true);
  expect(isBackdropProduct({product_name:'MDF DISPLAY ARCH WITH SHELVES',product_type:'Other'})).toBe(true);
  expect(isBackdropProduct({product_name:'Custom display arch with shelves',product_type:'Backdrop'})).toBe(true);
  expect(isBackdropProduct({product_name:'Display Arch without Shelves',product_type:'Other'})).toBe(false);
 });
});
