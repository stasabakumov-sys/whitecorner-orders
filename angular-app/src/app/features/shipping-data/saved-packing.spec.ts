import {describe,it,expect,vi} from 'vitest';
import {SavedPackingComponent} from './saved-packing.component';

function setup(result:any={data:{ok:true}}){
 const invoke=vi.fn().mockResolvedValue(result),rpc=vi.fn().mockResolvedValue({data:{size_key:'1800x900:foldable',package_name:'Backdrop',length_mm:930,width_mm:930,height_mm:90,revision:'revision'},error:null}),component=new SavedPackingComponent({client:{functions:{invoke},rpc}} as any);
 component.product={id:'table',product_name:'Table',wix_product_id:'catalog'};
 component.profile={signature:'saved',template_item:{id:'original',source_item_id:'source',product_name:'Table',catalog_reference:{catalogItemId:'catalog'},wix_options:{Colour:'Raw'}},packages:[{package_name:'Table',length_mm:980,width_mm:460,height_mm:70,weight_kg:13,contents:[{component_key:'main',unit_index:1}]}]};
 return {component,invoke,rpc};
}
describe('Direct saved packaging editing',()=>{
 it('edits a dimension without changing saved data before server confirmation or requiring Size',async()=>{
  const {component,invoke}=setup();const emit=vi.spyOn(component.profileSaved,'emit');component.edit();component.draft[0].height_mm=90;
  expect(component.profile.packages[0].height_mm).toBe(70);await component.save();
  expect(invoke.mock.calls[0][1].body).toMatchObject({productId:'table',sourceItemId:'source',options:[{name:'Colour',value:'Raw'}],packages:[{height_mm:90,length_mm:980}]});
  expect(emit).toHaveBeenCalledWith(expect.objectContaining({signature:'saved',packages:[expect.objectContaining({height_mm:90})]}));
 });
 it('keeps edits after failure and permits retry',async()=>{
  const {component,invoke}=setup({data:{ok:false,error:'Connection failed'}});component.edit();component.draft[0].height_mm=95;await component.save();
  expect(component.editing).toBe(true);expect(component.draft[0].height_mm).toBe(95);expect(component.error()).toContain('Connection failed');
  invoke.mockResolvedValue({data:{ok:true}});await component.save();expect(component.saved()).toBe(true);
 });
 it('replaces boxes as a draft and can cancel without deleting the saved packaging',()=>{
  const {component,invoke}=setup();component.replace();component.addBox();expect(component.draft).toHaveLength(2);component.cancel();
  expect(component.profile.packages).toHaveLength(1);expect(component.profile.packages[0].height_mm).toBe(70);expect(invoke).not.toHaveBeenCalled();
 });
 it('rejects incomplete replacement boxes before sending',async()=>{
  const {component,invoke}=setup();component.replace();await component.save();expect(invoke).not.toHaveBeenCalled();expect(component.error()).toContain('positive dimensions');
 });
 it('uses the selected Backdrop identity while editing shared packaging',()=>{
  const {component}=setup();component.product={id:'arch',product_name:'Flutted Arch',wix_product_id:'arch-catalog'};component.profile.template_item.product_name='Another Backdrop';component.edit();
  expect(component.components()[0]).toMatchObject({order_item_id:'arch',product_name:'Flutted Arch'});
 });
 it('saves a legacy Backdrop profile whose template item is null',async()=>{
  const {component,invoke}=setup();component.profile.template_item=null;component.backdrop=true;component.fallbackOptions={Size:'180cm x 90cm',Foldable:'YES'};component.backdropDimensions={package_name:'Backdrop',length_mm:930,width_mm:930,height_mm:90};component.edit();component.draft[0].weight_kg=20;await component.save();
  expect(invoke).toHaveBeenCalledWith('delivery-cost-review',{body:expect.objectContaining({sourceItemId:'',existingSignature:'saved',options:[{name:'Size',value:'180cm x 90cm'},{name:'Foldable',value:'YES'}],packages:[expect.objectContaining({length_mm:930,width_mm:930,height_mm:90,weight_kg:20})]})});
  expect(component.saved()).toBe(true);
 });
 it('lets a legacy Backdrop open immediately and confirms its dimensions on first save',async()=>{
  const {component,rpc,invoke}=setup();component.backdrop=true;component.sharedSize='1800x900:foldable';component.fallbackOptions={Size:'180cm x 90cm',Foldable:'YES'};component.edit();expect(component.editing).toBe(true);component.draft[0].weight_kg=20;await component.save();
  expect(rpc).toHaveBeenCalledWith('wc_save_backdrop_packaging_dimensions',expect.objectContaining({p_size:'1800x900:foldable',p_length:980,p_width:460,p_height:70,p_expected:null}));expect(invoke).toHaveBeenCalled();expect(component.saved()).toBe(true);
 });
 it('uses the existing shared dimensions while editing only this model weight',()=>{
  const {component}=setup();component.backdrop=true;component.backdropDimensions={package_name:'Backdrop',length_mm:1030,width_mm:1030,height_mm:90};component.edit();expect(component.draft[0]).toMatchObject({length_mm:1030,width_mm:1030,height_mm:90,weight_kg:13});
 });
});
