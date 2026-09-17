import {describe,it,expect,vi} from 'vitest';
import {backdropReferenceProfiles} from './backdrop-packing-reference';
import {SavedPackingComponent} from './saved-packing.component';
import {findPackagingProfile,resolveOrderPackaging,variantSignature,reviewComponents} from '../../../../../supabase/functions/_shared/delivery-review-domain';
const dimensions={size_key:'1800x900:foldable',package_name:'Backdrop',length_mm:930,width_mm:930,height_mm:90,revision:'v1'};
const plane={id:'plane',product_name:'Plane Arch Backdrop',wix_product_id:'plane-wix',saved_profiles:[]};
describe('Shared 180x90 packaging and model weight',()=>{
 it('uses the selected catalogue size and starts Plane weight empty without borrowing Ripple weight',()=>{
  const rows=backdropReferenceProfiles(plane,['180cm x 90cm','200cm x 100cm'],{'1800x900:foldable':dimensions},[]);
  expect(rows).toHaveLength(1);expect(rows[0].template_item.wix_options).toEqual({Size:'180cm x 90cm',Foldable:'YES'});
  expect(rows[0].packages[0]).toMatchObject({length_mm:930,width_mm:930,height_mm:90,weight_kg:null});
  expect(backdropReferenceProfiles({...plane,saved_profiles:rows},['180cm x 90cm'],{'1800x900:foldable':dimensions},[])).toEqual([]);
 });
 it('saves only the current model weight with complete size identity and retains it after reload',async()=>{
  let persisted:any;
  const invoke=vi.fn(async(_name:any,{body}:any)=>{persisted=structuredClone(body);return {data:{ok:true,signature:'plane-saved'}};});
  const profile=backdropReferenceProfiles(plane,['180cm x 90cm'],{'1800x900:foldable':dimensions},[])[0];
  const c=new SavedPackingComponent({client:{functions:{invoke}}} as any);
  Object.assign(c,{product:plane,profile,backdrop:true,backdropDimensions:dimensions,sharedSize:'1800x900:foldable'});c.ngOnChanges();
  await c.saveWeight();expect(invoke).not.toHaveBeenCalled();
  c.weightDraft=20;await c.saveWeight();expect(c.saved()).toBe(true);
  expect(persisted).toMatchObject({productId:'plane',existingSignature:'',options:[{name:'Size',value:'180cm x 90cm'},{name:'Foldable',value:'YES'}]});
  expect(persisted.packages[0].weight_kg).toBe(20);expect(profile.packages[0].weight_kg).toBeNull();
  const reloaded=new SavedPackingComponent({} as any);Object.assign(reloaded,{product:plane,profile:{...profile,signature:'plane-saved',packages:persisted.packages}});reloaded.ngOnChanges();expect(reloaded.weightDraft).toBe(20);
 });
 it('hydrates normalized Ripple profiles for delivery and fails visibly if the reference is missing',async()=>{
  const item={id:'ripple-item',product_name:'Ripple Backdrop',quantity:1,catalog_reference:{catalogItemId:'ripple'},wix_options:{Size:'180cm x 90cm',Foldable:'YES'}};
  const profile={signature:variantSignature(item),packages:[{backdrop_size_key:dimensions.size_key,weight_kg:24,contents:reviewComponents({wc_order_items:[item]})}]};
  let shared:any=dimensions;
  const db={from:(table:string)=>{const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:table==='wc_delivery_packaging_profiles'?profile:shared,error:null})};return q;}};
  const boxes=await resolveOrderPackaging(db,{wc_order_items:[item]});
  expect(boxes[0]).toMatchObject({length_mm:930,width_mm:930,height_mm:90,weight_kg:24});
  expect(profile.packages[0]).not.toHaveProperty('length_mm');
  shared=null;expect((await findPackagingProfile(db,profile.signature)).error?.message).toContain('Shared Backdrop');
 });
});
