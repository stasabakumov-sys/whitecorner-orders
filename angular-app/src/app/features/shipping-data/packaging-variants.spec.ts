import {describe,expect,it} from 'vitest';
import {PackagingVariantsComponent,sharedBackdropBoxes} from './packaging-variants.component';

const profile=(size:string,foldable:string,dimensions=[1980,1040,90,22],colour='White')=>({
 template_item:{wix_options:{Size:size,Foldable:foldable,Colour:colour}},
 packages:[{package_name:'Backdrop box',length_mm:dimensions[0],width_mm:dimensions[1],height_mm:dimensions[2],weight_kg:dimensions[3],contents:[{component_key:'main',unit_index:1}]}],
});
const shared=(value:any,productName='Existing Backdrop')=>({profile:value,productName});

describe('Shared Backdrop packaging by size and folding',()=>{
 it('reuses boxes across Backdrop products for the same exact size and folding while ignoring colour',()=>{
  const found=sharedBackdropBoxes({Size:'190cm x 95cm',Foldable:'YES',Colour:'Raw'},[shared(profile('950 × 1900 mm','Foldable',[1980,1040,90,22],'White'))]);
  expect(found.key).toBe('1900x950:foldable');
  expect(found.ambiguous).toBe(false);
  expect(found.packages).toEqual([expect.objectContaining({length_mm:1980,width_mm:1040,height_mm:90,weight_kg:22})]);
 });
 it('keeps Foldable and Non-foldable boxes separate',()=>{
  const rows=[shared(profile('190cm x 95cm','YES',[1980,1040,90,22])),shared(profile('190cm x 95cm','NO',[1980,1040,45,18]))];
  expect(sharedBackdropBoxes({Size:'190cm x 95cm',Foldable:'NO'},rows).packages[0].height_mm).toBe(45);
 });
 it('does not guess when different layouts exist for the same size and folding',()=>{
  const rows=[shared(profile('190cm x 95cm','YES',[1980,1040,90,22])),shared(profile('190cm x 95cm','YES',[2000,1050,100,24]))];
  expect(sharedBackdropBoxes({Size:'190cm x 95cm',Foldable:'YES'},rows)).toMatchObject({key:'1900x950:foldable',packages:[],ambiguous:true});
 });
 it('does not apply the Backdrop database to Carts or other products',()=>{
  const component=new PackagingVariantsComponent({} as any);
  component.product={product_name:'Display Cart'};
  component.packagingScope='product';
  component.sharedBackdropProfiles=[shared(profile('190cm x 95cm','YES'))];
  component.options=[{name:'Size',value:'190cm x 95cm'},{name:'Foldable',value:'YES'}];
  component.reuseSharedBackdropBoxes();
  expect(component.boxes).toEqual([]);
 });
});
