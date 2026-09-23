import {describe,it,expect} from 'vitest';
import {ShippingDataComponent} from './shipping-data.component';
import {signal} from '@angular/core';

describe('Product size selection',()=>{
 function setup(product:any,sizes:string[]){
  const c=Object.create(ShippingDataComponent.prototype) as ShippingDataComponent;
  c.catalogProducts=signal({[product.id]:{productOptions:[{name:'Size',choices:sizes.map(description=>({description}))}]}});
  c.selectedCartSize='';c.selectedPackingSize='';c.selectedBackdropFolding='foldable';c.mainAddOns=signal<any[]>([]);
  c.backdropDimensions=signal({});c.rules=signal([]);
  return c;
 }
 it('switches the product drawing and packaging together, preserving separate folding profiles',()=>{
  const profile=(size:string,foldable:string,signature:string)=>({signature,template_item:{wix_options:{Size:size,Foldable:foldable}},packages:[]});
  const p={id:'p',product_name:'Plane Arch',product_type:'Backdrop',saved_profiles:[profile('180cm x 90cm','YES','small-fold'),profile('180cm x 90cm','NO','small-rigid'),profile('200cm x 100cm','YES','large')]};
  const c=setup(p,['180cm x 90cm','200cm x 100cm']);
  expect(c.visiblePackingProfiles(p).map(p=>p.signature)).toEqual(['small-fold']);
  c.selectedBackdropFolding='nonfoldable';expect(c.visiblePackingProfiles(p).map(p=>p.signature)).toEqual(['small-rigid']);
  c.selectedBackdropFolding='foldable';
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
 it('shows a separate missing Non-foldable packing slot for the selected Backdrop size',()=>{
  const p={id:'ripple',product_name:'Ripple Hollow Arch Backdrop',product_type:'Backdrop',saved_profiles:[{signature:'foldable',template_item:{wix_options:{Size:'200cm x 120cm',Foldable:'YES'}},packages:[]}]};
  const c=setup(p,['200cm x 120cm','200cm x 100cm']);
  expect(c.missingBackdropPacking(p)).toEqual([]);
  c.selectedBackdropFolding='nonfoldable';expect(c.missingBackdropPacking(p)).toEqual(['2000x1200:nonfoldable']);
  c.selectedBackdropFolding='foldable';
  c.selectProductSize(p,'200cm x 100cm');
  expect(c.missingBackdropPacking(p)).toEqual(['2000x1000:foldable']);
  c.backdropDimensions.set({'2000x1000:nonfoldable':{size_key:'2000x1000:nonfoldable',package_name:'Backdrop',length_mm:2030,width_mm:1030,height_mm:80,revision:'saved'}});
  c.selectedBackdropFolding='nonfoldable';expect(c.missingBackdropPacking(p)).toEqual([]);
 });
});
