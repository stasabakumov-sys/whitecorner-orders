import {describe,expect,it,vi} from 'vitest';
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

describe('Packaging editor loading',()=>{
 it('saves the first box for a product without Size and assigns its only component automatically',async()=>{
  const invoke=vi.fn().mockResolvedValue({data:{ok:true}});
  const component=new PackagingVariantsComponent({client:{functions:{invoke},from:()=>({select(){return this;},eq:async()=>({data:[],error:null})})}} as any);
  component.product={id:'medium',product_name:'Medium table',wix_product_id:'catalog',manual_sizes:'Display only'};
  component.reset();component.addBox();Object.assign(component.boxes[0],{package_name:'Table',length_mm:1020,width_mm:840,height_mm:85,weight_kg:22.5});component.confirmed=true;
  expect(component.options).toEqual([]);expect(component.boxes[0].contents).toHaveLength(1);expect(component.issue()).toBe('');
  await component.save();expect(invoke.mock.calls[0][1].body).toMatchObject({options:[],packages:[{height_mm:85,weight_kg:22.5}]});expect(component.saved()).toBe(true);
 });
 it('keeps real incomplete options blocked and identifies the hidden section',()=>{
  const component=new PackagingVariantsComponent({} as any);component.product={wix_product_id:'catalog'};component.options=[{name:'Size',value:''}];
  expect(component.issue()).toContain('Variant matching (advanced)');
  component.packagingScope='shared-backdrop';component.reset();expect(component.options).toEqual([{name:'Size',value:''}]);
 });
 const query=(result:any,rangeResult?:Promise<any>)=>({
  select(){return this;},eq(){return this;},order(){return this;},
  range(){return rangeResult||Promise.resolve(result);},
  then(resolve:any,reject:any){return Promise.resolve(result).then(resolve,reject);},
 });
 const savedProfile={signature:'only-profile',template_item:{wix_options:{Size:'Size II'}},packages:[{package_name:'Table',length_mm:980,width_mm:460,height_mm:70,weight_kg:13,contents:[{component_key:'main',unit_index:1}]}]};

 it('opens the only saved profile automatically for direct dimension editing',async()=>{
  const client={from:vi.fn((table:string)=>table==='wc_delivery_packaging_profiles'?query({data:[savedProfile],error:null}):table==='wc_shipping_rules'?query({data:[],error:null}):query({},Promise.resolve({data:[],error:null})))};
  const component=new PackagingVariantsComponent({client} as any);component.product={id:'table',product_name:'Table',wix_product_id:'catalog'};
  await component.ngOnChanges();
  expect(component.selectedKey).toBe('only-profile');
  expect(component.boxes[0]).toMatchObject({length_mm:980,width_mm:460,height_mm:70,weight_kg:13});
  const calls=client.from.mock.calls.length;component.boxes[0].height_mm=95;
  component.sharedBackdropProfiles=[];await component.ngOnChanges();
  expect(client.from.mock.calls).toHaveLength(calls);expect(component.boxes[0].height_mm).toBe(95);
 });

 it('unlocks package fields while order composition examples continue loading',async()=>{
  let finishOrders!: (value:any)=>void;
  const orders=new Promise(resolve=>{finishOrders=resolve;});
  const client={from:vi.fn((table:string)=>table==='wc_delivery_packaging_profiles'?query({data:[savedProfile],error:null}):table==='wc_shipping_rules'?query({data:[],error:null}):query({},orders))};
  const component=new PackagingVariantsComponent({client} as any);component.product={id:'table',product_name:'Table',wix_product_id:'catalog'};
  const loading=component.ngOnChanges();
  await vi.waitFor(()=>expect(component.loadingExamples()).toBe(true));
  expect(component.busy()).toBe(false);
  finishOrders({data:[],error:null});await loading;
  expect(component.loadingExamples()).toBe(false);
 });
});
