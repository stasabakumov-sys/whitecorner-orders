import {describe,expect,it,vi} from 'vitest';
import {BackdropPaintProfileComponent} from './backdrop-paint-profile.component';

describe('Shared Backdrop painting profile',()=>{
 it('saves paint materials and minutes once for the product',async()=>{
  const rpc=vi.fn().mockResolvedValue({data:{lines:[{material_id:'paint',quantity:2}],estimates:{'Painting:First primer':10},materials_confirmed:true,version:1},error:null});
  const component=new BackdropPaintProfileComponent({client:{rpc}} as any);component.product={id:'backdrop',backdrop_paint_profile:{version:0}};component.materials=[{id:'paint',name:'Paint',unit:'L',active:true}];component.ngOnChanges();component.lines=[{material_id:'paint',quantity:2}];component.confirmed=true;component.setMinute('First primer',10);const saved=vi.fn();component.saved.subscribe(saved);
  await component.save();
  expect(rpc).toHaveBeenCalledWith('wc_save_backdrop_paint_profile',{p_product:'backdrop',p_lines:[{material_id:'paint',quantity:2}],p_estimates:{'Painting:First primer':10},p_confirmed:true,p_expected:0});expect(saved).toHaveBeenCalledWith(expect.objectContaining({backdrop_paint_profile:expect.objectContaining({version:1})}));expect(component.message).toContain('saved');
 });
 it('retains the draft and shows the server error when saving fails',async()=>{
  const component=new BackdropPaintProfileComponent({client:{rpc:vi.fn().mockResolvedValue({data:null,error:Error('offline')})}} as any);component.product={id:'backdrop'};component.ngOnChanges();await component.save();expect(component.error).toContain('offline');expect(component.busy).toBe(false);
 });
});
