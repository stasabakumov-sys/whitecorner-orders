import {describe,it,expect} from 'vitest';
import {ShippingDataComponent} from './shipping-data.component';
import {signal} from '@angular/core';

describe('Product size selection',()=>{
 function setup(product:any,sizes:string[]){
  const c=Object.create(ShippingDataComponent.prototype) as ShippingDataComponent;
  c.catalogProducts=signal({[product.id]:{productOptions:[{name:'Size',choices:sizes.map(description=>({description}))}]}});
  c.selectedCartSize='';c.selectedPackingSize='';c.mainAddOns=signal<any[]>([]);
  return c;
 }
 it('switches the product drawing and packaging together, preserving separate folding profiles',()=>{
  const profile=(size:string,signature:string)=>({signature,template_item:{wix_options:{Size:size}},packages:[]});
  const p={id:'p',product_name:'Plane Arch',product_type:'Backdrop',saved_profiles:[profile('180cm x 90cm','small-fold'),profile('180cm x 90cm','small-rigid'),profile('200cm x 100cm','large')]};
  const c=setup(p,['180cm x 90cm','200cm x 100cm']);
  expect(c.visiblePackingProfiles(p).map(p=>p.signature)).toEqual(['small-fold','small-rigid']);
  expect(c.productDrawingKey(p)).toBe('product-size:metric:1800x900');
  c.selectProductSize(p,'200cm x 100cm');
  expect(c.activeProductSize(p)).toBe('200cm x 100cm');
  expect(c.visiblePackingProfiles(p).map(p=>p.signature)).toEqual(['large']);
  expect(c.productDrawingKey(p)).toBe('product-size:metric:2000x1000');
 });
 it('uses the existing cart size selection for all downstream editors',()=>{
  const p={id:'cart',product_name:'Cart',product_type:'Cart'};
  const c=setup(p,['Size I','Size II']);
  c.mainAddOns.set([{id:'addon',shipping_product_id:'cart'}]);c.selectProductSize(p,'Size II');
  expect(c.activeProductSize(p)).toBe('Size II');
  expect(c.activeCartSize(p)).toBe('size ii');
  expect(c.mainAddOns()).toEqual([]);
 });
});
